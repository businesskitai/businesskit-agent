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

| Title | File | Role |
|---|---|---|
| CEO | `agents/csuite/ceo.ts` | Weekly briefing, cross-agent orchestration, priority setting |
| CMO | `agents/csuite/cmo.ts` | Campaign strategy, content calendar, growth recommendations |
| COO | `agents/csuite/coo.ts` | Content pipeline, publish queue, scheduling oversight |
| CBO | `agents/csuite/cbo.ts` | Revenue analysis, product strategy, pricing recommendations |

### Content Creators

| Title | File | Writes to |
|---|---|---|
| Blog Writer | `agents/creators/blog-writer.ts` | `posts` |
| Newsletter Writer | `agents/creators/newsletter-writer.ts` | `subscribers` + email via SES/Resend |
| Copywriter | `agents/creators/copywriter.ts` | `pages`, `products.description`, `links` |
| Course Creator | `agents/creators/course-creator.ts` | `products` (type=course) + lessons JSON |
| Store Manager | `agents/creators/store-manager.ts` | `products` (downloads, services, webinars, events, listings, sponsorships, meetings) |
| Jobs Manager | `agents/creators/jobs-manager.ts` | `job_listings` + `job_applications` |
| Forms Builder | `agents/creators/forms-builder.ts` | `forms` + `questions` |
| Docs Writer | `agents/creators/docs-writer.ts` | `doc_collections` + `doc_articles` |

### Growth & Intelligence

| Title | File | Role |
|---|---|---|
| SEO Agent | `agents/growth/seo-agent.ts` | `collections`, slugs, meta, OG tags |
| Analytics Agent | `agents/growth/analytics-agent.ts` | All analytics tables — reads only, never writes |
| Social Agent | `agents/growth/social-agent.ts` | `credentials.n8n_webhook_url` → social platforms |
| Scheduler | `agents/growth/scheduler.ts` | `published=0 + date <= now()` → flips published=1 |

---

## Current Repository Structure

```
businesskit-agent/
│
├── CLAUDE.md                        ← brain: full schema + rules + brand context
├── PLAN.md                          ← this file
├── README.md                        ← setup in 3 commands
├── .env.example                     ← TURSO_URL, TURSO_TOKEN
├── cli.ts                           ← universal CLI entry point (npx / bun / tsx)
├── setup.ts                         ← validates Turso connection on first run
├── package.json
├── tsconfig.json
│
├── lib/
│   ├── db.ts                        ← Turso client singleton (Phase 1: process.env)
│   ├── db.adapter.ts                ← Phase 2 bridge: injects sharedMap["userClient"]
│   ├── id.ts                        ← ulid() + now() + iso()
│   ├── slug.ts                      ← toSlug() + uniqueSlug()
│   ├── profile.ts                   ← getBrandContext() — profile + settings + credentials
│   └── analytics.ts                 ← read-only analytics helpers
│
├── agents/
│   ├── _base.ts                     ← BaseAgent: profile isolation, archive(), publish(), count()
│   │
│   ├── csuite/
│   │   ├── ceo.ts
│   │   ├── cmo.ts
│   │   ├── coo.ts
│   │   └── cbo.ts
│   │
│   ├── creators/
│   │   ├── blog-writer.ts
│   │   ├── newsletter-writer.ts
│   │   ├── copywriter.ts
│   │   ├── course-creator.ts
│   │   ├── store-manager.ts
│   │   ├── jobs-manager.ts
│   │   ├── forms-builder.ts
│   │   └── docs-writer.ts
│   │
│   └── growth/
│       ├── analytics-agent.ts
│       ├── seo-agent.ts
│       ├── social-agent.ts
│       └── scheduler.ts
│
├── .claude/
│   ├── skills/                      ← auto-loaded context (passive, always present)
│   │   ├── schema.md
│   │   ├── brand.md
│   │   ├── store.md
│   │   ├── analytics.md
│   │   └── agents.md
│   │
│   └── commands/                    ← slash commands (active, triggered by /name)
│       ├── ceo.md
│       ├── cmo.md
│       ├── coo.md
│       ├── cbo.md
│       ├── blog-writer.md
│       ├── newsletter-writer.md
│       ├── copywriter.md
│       ├── course-creator.md
│       ├── store-manager.md
│       ├── jobs-manager.md
│       ├── forms-builder.md
│       ├── docs-writer.md
│       ├── analytics.md
│       ├── seo.md
│       ├── social.md
│       └── scheduler.md
│
└── .claude-plugin/
    └── plugin.json                  ← Cowork + Claude Code plugin manifest
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
- [x] `lib/` — 6 files: db, db.adapter, id, slug, profile, analytics
- [x] `agents/_base.ts` — BaseAgent with profile isolation
- [x] 16 agents: 4 C-Suite + 8 Creators + 4 Growth
- [x] 16 slash commands in `.claude/commands/`
- [x] 5 skill files in `.claude/skills/`
- [x] `cli.ts` — universal terminal entry point
- [x] `.claude-plugin/plugin.json`
- [x] `README.md` + `.env.example` + `setup.ts`

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
