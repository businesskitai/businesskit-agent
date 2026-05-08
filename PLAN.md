# BusinessKit Agent — Master Build Plan

> One-man army. Autonomous. Profile-isolated. Turso-powered.
> Built to run locally (Phase 1), in-app via MCP (Phase 2), autonomous on CF Workflows (Phase 3).

---

## The Mental Model

```
profile_id = one business = one isolated universe
Every agent operates within exactly one profile.
All reads/writes are scoped to profile_id. No exceptions.
```

**Store** = all digital commerce:
digital downloads, courses, 1:1 meetings, webinars, events, listings, sponsorships, services.
These all live in the `products` table under different `type` values.

---

## Agent Roster

### C-Suite (Intelligence + Strategy)

| Title | Folder / File | Role |
|---|---|---|
| CEO | `agents/ceo/ceo.ts` | Weekly briefing, cross-agent orchestration, priority setting |
| Marketing (CMO) | `agents/marketing/marketing.ts` | Campaign strategy, content calendar, growth recommendations |
| Operations (COO) | `agents/operations/operations.ts` | Content pipeline, publish queue, scheduling oversight |
| Business (CBO) | `agents/business/business.ts` | Revenue analysis, product strategy, pricing recommendations |

### Content Creators

| Title | Folder / File | Writes to |
|---|---|---|
| Sales (CRM) | `agents/sales/sales.ts` | `crm_*` — contacts, deals, activities, proposals, invoices |
| Content (Blog Writer) | `agents/content/content.ts` | `posts`, `compare`, `alternative`, `prompt`, `notes`, `guides` |
| Newsletter | `agents/newsletter/newsletter.ts` | `subscribers` + email via SES/Resend |
| Copywriting | `agents/copywriting/copywriting.ts` | `pages`, `products.description`, `links` |
| Courses | `agents/courses/courses.ts` | `products` (type=course) + lessons JSON |
| Store | `agents/store/store.ts` | `products` (downloads, services, webinars, events, listings, sponsorships, meetings) |
| Hiring | `agents/hiring/hiring.ts` | `job_listings` + `job_applications` |
| Forms | `agents/forms/forms.ts` | `forms` + `questions` |
| Docs | `agents/docs/docs.ts` | `doc_collections` + `doc_articles` |

### Growth & Intelligence

| Title | Folder / File | Role |
|---|---|---|
| SEO | `agents/seo/seo.ts` | `collections`, slugs, meta, OG tags |
| Analytics | `agents/analytics/analytics.ts` | All analytics tables — reads only, never writes |
| Social | `agents/social/social.ts` | `credentials.n8n_webhook_url` → social platforms |
| Scheduler | `agents/scheduler/scheduler.ts` | `published=0 + date <= now()` → flips published=1 |

---

## Current Repository Structure

One folder per agent. Each folder has `SOUL.md` (identity + rules) + `<agent>.ts` (implementation).

```
businesskit-agent/                        ← repo root
│
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
│
├── .claude/
│   ├── commands/                   ← slash-command bodies (user-facing names kept stable)
│   │   ├── analytics.md            blog-writer.md     cbo.md
│   │   ├── ceo.md                  cmo.md             compress.md
│   │   ├── coo.md                  copywriter.md      course-creator.md
│   │   ├── crm.md                  deep.md            docs-writer.md
│   │   ├── forms-builder.md        ingest.md          jobs-manager.md
│   │   ├── kb.md                   newsletter-writer.md
│   │   ├── preserve.md             resume.md          scheduler.md
│   │   ├── seo.md                  social.md          store-manager.md
│   │   └── settings.json
│   └── skills/                     ← auto-loaded skills (see also top-level skills/)
│
├── agents/                         ← one folder per agent, SOUL.md + <agent>.ts
│   ├── _base.ts                    ← BaseAgent — profile iso, idempotency, txn, audit
│   │
│   ├── ceo/            SOUL.md + ceo.ts
│   ├── marketing/      SOUL.md + marketing.ts     (CMO role)
│   ├── operations/     SOUL.md + operations.ts    (COO role)
│   ├── business/       SOUL.md + business.ts      (CBO role)
│   ├── sales/          SOUL.md + sales.ts         (CRM pipeline)
│   │
│   ├── content/        SOUL.md + content.ts       (blog writer)
│   ├── newsletter/     SOUL.md + newsletter.ts
│   ├── copywriting/    SOUL.md + copywriting.ts
│   ├── courses/        SOUL.md + courses.ts
│   ├── store/          SOUL.md + store.ts
│   ├── hiring/         SOUL.md + hiring.ts        (job listings)
│   ├── forms/          SOUL.md + forms.ts
│   ├── docs/           SOUL.md + docs.ts
│   │
│   ├── analytics/      SOUL.md + analytics.ts
│   ├── seo/            SOUL.md + seo.ts
│   ├── social/         SOUL.md + social.ts
│   └── scheduler/      SOUL.md + scheduler.ts
│
├── bin/
│   └── businesskit.js
│
├── context/                        ← Brand Foundation — fill in once
│   ├── about-me.md
│   ├── brand-voice.md
│   ├── brand.md
│   ├── business.md
│   └── working-style.md
│
├── lib/
│   ├── analytics.ts                ← analytics summaries
│   ├── db.adapter.ts               ← Phase 1↔2 swap point
│   ├── db.ts                       ← Turso client, withRetry, txn, reader/writer split (P0-2, P0-3, P1-4)
│   ├── enums.ts                    ← single source of truth for status strings (P0-5)
│   ├── groups.ts                   ← crm_contact_groups junction helpers (P0-4)
│   ├── id.ts                       ← ulid, iso, now, generateIdempotencyKey (P0-1)
│   ├── kb.ts                       ← KB query helpers
│   ├── memory.ts                   ← dual-write agent_memory + memory.md
│   ├── pattern-detector.ts         ← Hermes skill-detection
│   ├── profile.ts                  ← BrandContext loader
│   ├── slug.ts                     ← slug utilities
│   └── validate.ts                 ← numeric bounds guards (P0-8)
│
├── skills/                         ← on-demand domain skills
│   ├── agents/SKILL.md             ← load for routing decisions
│   ├── analytics/SKILL.md          ← load when reading analytics
│   ├── blog-writer/SKILL.md
│   ├── brand/SKILL.md              ← load when writing content
│   ├── ceo/SKILL.md
│   ├── cmo/SKILL.md
│   ├── copywriting/SKILL.md
│   ├── humanizer/SKILL.md
│   ├── sales/                      ← reserved (empty)
│   ├── schema/SKILL.md             ← load for DB queries
│   ├── social/{SKILL.md, content-seo.md}
│   └── store/SKILL.md
│
├── memory/                         ← per-session state (gitignored)
├── .cursorrules .env.example .gitignore .mcp.json
├── AGENTS.md CLAUDE.md GEMINI.md HEARTBEAT.md
├── PLAN.md PRD-Agent-Composition.md PRD-Agent-Harness.md
├── README.md REFERENCE.md SOUL.md SYSTEM.md
├── cli.ts setup.ts memory.md
├── package.json package-lock.json tsconfig.json
```

---

## Skills vs Commands

| Location | What | When it runs |
|---|---|---|
| `.claude/skills/` | Background knowledge — schema, brand, store types, analytics patterns | Auto-loaded on every conversation |
| `.claude/commands/` | Step-by-step task instructions per agent | Only when user types `/command-name` |

Skills are **passive context**. Commands are **active triggers**.

---

## Phase 1 — Local Repo ✅ Complete

**Goal**: Users clone → drop in `.env` → run any agent via Claude Code, Cowork, or terminal.

```bash
git clone https://github.com/businesskit/businesskit-agent
cd businesskit-agent
npm install
cp .env.example .env         # paste TURSO_URL + TURSO_TOKEN from BusinessKit dashboard
npm run setup                # verify connection
# Open in Claude Code → type /ceo for first briefing
```

**CLI**:

```bash
npx tsx cli.ts ceo                # CEO weekly briefing
npx tsx cli.ts blog-writer        # list posts
npx tsx cli.ts scheduler hourly   # run publish queue
```

**Delivered**:

- [x] `CLAUDE.md` — full schema, brand rules, agent roster
- [x] `lib/` — db (withRetry + txn + reader/writer), id (+ idempotency key), enums, groups junction, validate, memory, profile, kb, analytics, slug
- [x] `agents/_base.ts` — BaseAgent: profile iso, idempotency (P0-1), txn (P0-2), audit (P0-6), APPEND_ONLY guard (P0-7), logMemory retention (P1-2), single-profile factory (P1-7)
- [x] 17 agents, one folder each, SOUL.md + `<agent>.ts`
- [x] 22 slash commands in `.claude/commands/` (+ `settings.json`)
- [x] Skills in `skills/<domain>/SKILL.md` — loaded on demand
- [x] `cli.ts` — universal terminal entry point with legacy-name aliases
- [x] `.claude-plugin/plugin.json`
- [x] `README.md` + `.env.example` (+ optional `TURSO_REPLICA_URL`) + `setup.ts`

---

## Phase 2 — In-App (Qwik + CF Worker)

**Goal**: Same agents, same code, running inside the BusinessKit dashboard via MCP tool calls.

**The only change**: swap the DB client source.

```ts
// Phase 1 — local, reads from .env
const ceo = new CEO()

// Phase 2 — CF Worker, reads from sharedMap set by plugin.ts
import { createAgentDB } from '~/lib/db.adapter'
const ceo = new CEO(createAgentDB(event))
```

**Deliverables**:

- [ ] Copy `agents/` + `lib/` into `src/lib/agents/` in the Qwik app
- [ ] `/api/mcp` route in `src/routes/api/mcp/index.tsx`
- [ ] One MCP tool definition per agent action
- [ ] Session auth → `sharedMap["userClient"]` → `createAgentDB(event)`

---

## Phase 3 — Autonomous (CF Workflows + Durable Objects)

**Goal**: Agents run on cron with no user present.

**Deliverables**:

- [ ] `scheduler.ts` as CF Durable Object (stub already in file — uncomment to activate)
- [ ] Weekly CEO briefing → n8n → email/Slack (`0 8 * * 1`)
- [ ] Hourly publish queue → flips `published=1` + triggers Social Agent (`0 * * * *`)
- [ ] CMO auto-generates content calendar → creates drafts via Blog Writer / Store Manager
- [ ] Newsletter Writer sends on schedule via SES/Resend

---

## Design Rules

- **Minimal code** — raw libSQL, no ORM, no boilerplate beyond BaseAgent
- **profile_id on every write** — enforced in BaseAgent, never per-agent
- **No hard deletes** — always `hidden=1`
- **No credentials in logs** — credentials table is read-only, never output values
- **One file per agent** — file name = command name (kebab-case)
- **Composable** — C-Suite calls Growth calls Creators. Never reverse.
- **n8n = external integration layer** — social posting, email delivery
- **CF Workflows = cron layer** — Scheduler designed for Durable Objects from day one
- **Same codebase, two transports** — `db.adapter.ts` is the only diff between Phase 1 and 2

---

## Phase 2 Additions — Agent Infrastructure (from Hermes + Karpathy patterns)

### New tables (defined in agents.ts)

| Table | Purpose |
|---|---|
| `agents` | Registry — one row per agent type, tracks last_run, auto_approve, pending skill suggestions |
| `agent_skills` | Live instruction skills — editable from dashboard, version-tracked |
| `agent_memory` | Rolling 20-row session log — dual-write (Turso + memory.md) |
| `agent_notes` | Persistent knowledge artifacts — Karpathy wiki pattern (research, analysis, briefings) |
| `agent_files` | Files agent produces — SEO reports, blog exports, CRM data — visible in dashboard |
| `agent_tasks` | Tasks: manual + scheduled + auto-detected from patterns (Hermes pattern) |
| `agent_conversations` | Future agentic chat UI — table only, implementation deferred |

### Hermes pattern: auto-skill generation

When an agent performs the same action 3+ times in 7 days:

1. `detectAndSuggestSkill()` in `_base.ts` detects the pattern
2. Creates a pending `agent_tasks` row (status='detected')
3. Sets `pending_skill_suggestion` on the `agents` row
4. Dashboard surfaces it: "CEO detected you want Monday briefings — add as task?"
5. User approves → status='active', auto_run=1, skill is_active=1
6. Rejects → status='cancelled'

### Karpathy wiki pattern: agent_notes

Agents write persistent knowledge to `agent_notes`, not just ephemeral `agent_memory`.

- CEO briefing → saved as note (type='briefing')
- SEO audit findings → saved as note (type='analysis')
- CRM lead research → saved as note (type='research', source_id=contact_id)
- Notes link to each other via related_note_ids JSON
- Dashboard shows all notes, filterable by agent and type

### Dashboard routes (main Qwik app)

- `/dashboard/agents` — agent roster grid
- `/dashboard/agents/[agentType]` — agent detail (memory, skills, tasks, files, notes tabs)
- `/dashboard/agents/files` — all files across all agents

### Build order

See CURSOR-PLAN.md for step-by-step Cursor prompts.
Do Phase 0 → 1 → 2 in order. Phase 3–5 are optional enhancements.

---

## Architecture Principles (learned from production)

### Backend-as-context (Nainsi principle)

Same app, same model, same prompt: 10.4M tokens vs 3.7M tokens.
The difference: treating the backend as part of the agent's context window.

**Applied to this repo:**

- `HEARTBEAT.md` is a structured snapshot — one read, no DB calls, full business state
- Skills load on demand, never all at once
- `agent_kb` index (slug+summary) loaded before content — never full content scan
- Every DB query returns only what's needed — no `SELECT *` on large tables

**The counterintuitive part:** better models make poor infrastructure MORE expensive.
A capable model explores more deeply when context is missing. Design for no exploration.

### Skillify every failure (Garry Tan principle)

Every agent mistake → permanent structural fix, not a re-prompt.
Deterministic work (date math, row counts, routing) → `lib/` functions, not LLM reasoning.
Every skill in `agent_skills` must be registered in `CLAUDE.md` skills table or it's dark.

---

## Phase 2 — Dependencies to add when ready

### Spectrum (photon.codes)

`npm install spectrum-ts` — connects agents to iMessage, Telegram, WhatsApp, Slack, Discord, Instagram.
Edge-first, <1s latency. Use when users want to talk to their agents via messaging instead of terminal.
Add to `lib/channels/` — wrap Spectrum adapters per platform, route inbound messages to correct agent.

**Phase 2 channel architecture:**

```
User sends iMessage/WhatsApp/Telegram
  → Spectrum adapter receives
  → routes to correct agent based on message content
  → agent reads HEARTBEAT.md + relevant skills
  → writes response back via Spectrum
  → logs to agent_memory
```

Not needed for Phase 1 (Claude Code / Cowork covers it).
Add when users ask for "talk to my CEO agent on WhatsApp."
