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
├── .gitignore
├── .env.example                     ← TURSO_URL, TURSO_TOKEN
├── mcp.json                         ← local MCP server config
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