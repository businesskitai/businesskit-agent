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
businesskit-agent/                          ← clone this repo
│
├── CLAUDE.md                               ← 🧠 project brain — auto-loaded by Claude Code
├── AGENTS.md                               ← Codex entry point — auto-loaded by Codex
├── GEMINI.md                               ← Gemini CLI entry point — auto-loaded
├── README.md                               ← user guide
├── memory.md                               ← 📝 preferences (gitignored, never committed)
├── .env                                    ← your Turso credentials (gitignored, you create this)
├── .env.example                            ← template — committed, shows what to fill in
├── .gitignore
├── .cursorrules                            ← Cursor IDE rules — auto-loaded by Cursor
├── .mcp.json                               ← MCP server config (Turso)
├── package.json
├── tsconfig.json
├── cli.ts                                  ← npx tsx cli.ts <agent>
├── setup.ts                                ← npm run setup — verifies Turso connection
├── provision-migrations.ts                 ← ⚠️ copy entries into main app's provision.ts
├── PLAN.md                                 ← phased build plan
├── PRD-Agent-Harness.md                    ← harness architecture reference
│
├── context/                                ← 📖 brand docs — committed, fill in once
│   ├── brand.md                            ← brand voice, audience, tone, products
│   └── business.md                         ← goals, revenue model, publishing schedule
│
├── agents/
│   ├── _base.ts                            ← BaseAgent class — all agents extend this
│   ├── csuite/
│   │   ├── ceo.ts                          ← CEO — briefing, orchestration
│   │   ├── cmo.ts                          ← CMO — content calendar, growth
│   │   ├── coo.ts                          ← COO — publish queue, pipeline
│   │   └── cbo.ts                          ← CBO — revenue, pricing
│   ├── creators/
│   │   ├── blog-writer.ts                  ← 8 content types, all content tables
│   │   ├── newsletter-writer.ts            ← newsletter + SES/Resend send
│   │   ├── copywriter.ts                   ← pages, product descriptions, bio
│   │   ├── course-creator.ts               ← products (type=course) + lessons
│   │   ├── store-manager.ts                ← all other product types
│   │   ├── jobs-manager.ts                 ← job_listings + applications
│   │   ├── forms-builder.ts                ← forms + questions
│   │   ├── docs-writer.ts                  ← doc_collections + doc_articles
│   │   └── crm-agent.ts                    ← contacts, deals, outreach pipeline
│   └── growth/
│       ├── analytics-agent.ts              ← read-only analytics snapshot
│       ├── seo-agent.ts                    ← audit, fix, LLM visibility
│       ├── social-agent.ts                 ← Zernio API → 13 platforms
│       └── scheduler.ts                    ← publish queue, cron
│
├── lib/
│   ├── db.ts                               ← Turso client (reads TURSO_URL + TURSO_TOKEN)
│   ├── db.adapter.ts                       ← Phase 2 bridge for CF Worker / sharedMap
│   ├── memory.ts                           ← memory_log + agent_skills Turso helpers
│   ├── profile.ts                          ← getBrandContext() — profile + credentials
│   ├── analytics.ts                        ← read-only analytics helpers
│   ├── id.ts                               ← ulid() + now() + iso()
│   └── slug.ts                             ← toSlug() + uniqueSlug()
│
├── .agents/skills/                         ← 🌐 universal skills — all tools read this
│   ├── agents.md                           ← roster, routing rules, dependency direction
│   ├── schema.md                           ← all 30+ tables, columns, ID/timestamp rules
│   ├── brand.md                            ← content quality bars, voice rules
│   ├── analytics.md                        ← how to read JSON analytics columns
│   └── store.md                            ← product types, required fields, pricing
│
├── .claude/
│   ├── commands/                           ← slash commands for Claude Code + Cowork
│   │   ├── ceo.md                          ← /ceo
│   │   ├── cmo.md                          ← /cmo
│   │   ├── coo.md                          ← /coo
│   │   ├── cbo.md                          ← /cbo
│   │   ├── blog-writer.md                  ← /blog-writer
│   │   ├── newsletter-writer.md            ← /newsletter-writer
│   │   ├── copywriter.md                   ← /copywriter
│   │   ├── course-creator.md               ← /course-creator
│   │   ├── store-manager.md                ← /store-manager
│   │   ├── jobs-manager.md                 ← /jobs-manager
│   │   ├── forms-builder.md                ← /forms-builder
│   │   ├── docs-writer.md                  ← /docs-writer
│   │   ├── crm.md                          ← /crm
│   │   ├── social.md                       ← /social
│   │   ├── analytics.md                    ← /analytics
│   │   ├── seo.md                          ← /seo
│   │   ├── scheduler.md                    ← /scheduler
│   │   └── deep.md                         ← /deep
│   └── skills/                             ← Claude Code specific (mirrors .agents/skills/)
│       ├── README.md
│       ├── agents.md
│       ├── schema.md
│       ├── brand.md
│       ├── analytics.md
│       └── store.md
│
└── .claude-plugin/
    └── plugin.json                         ← Claude Cowork plugin manifest
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
- [x] `lib/` — db, db.adapter, **memory.ts** (memory_log + agent_skills), id, slug, profile, analytics
- [x] `provision-migrations.ts` — copy `NEW_TABLES_SQL` / `MIGRATIONS_SQL` into main app `src/lib/provision.ts`
- [x] `agents/_base.ts` — BaseAgent with profile isolation
- [x] Agents: 4 C-Suite + 9 Creators (incl. CRM) + 4 Growth
- [x] Slash commands in `.claude/commands/` (incl. `/crm`, `/deep`)
- [x] 5 skill files in `.claude/skills/` and `.agents/skills/`
- [x] `context/brand.md` + `context/business.md` — committed brand docs
- [x] `cli.ts` — universal terminal entry point
- [x] `.claude-plugin/plugin.json`
- [x] `README.md` + `.env.example` + `setup.ts`

**Not in repo (live in Turso after provision)**:
- `memory_log` — last 20 agent actions per profile (replaces `progress.md`)
- `agent_skills` — dashboard-editable skills (brand-voice, seo, store, analytics)

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