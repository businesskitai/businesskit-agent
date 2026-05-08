# CODEBASE.md

> Find the agent → go to `agents/<folder>/<folder>.ts`. Find a helper → check `lib/`. Never read `agents/sales/sales.ts` end-to-end; jump to the method you need.

---

## Entry points

| What | Where |
|---|---|
| CLI entry | `cli.ts` — routes `<agent> [command] [args]` to `agents/<folder>/<folder>.ts` |
| Connection check | `setup.ts` — verifies Turso creds + profile (multi-profile → PROFILE_ID prompt) |
| CLI wrapper binary | `bin/businesskit.js` — npm `bin` entry (`bk`, `businesskit`) |
| Plugin manifest | `.claude-plugin/plugin.json` + `marketplace.json` |
| Session start (auto) | `CLAUDE.md` + `HEARTBEAT.md` — what Claude reads first every session |
| Slash commands | `.claude/commands/<cmd>.md` — instructions Claude follows when user types `/<cmd>` |

---

## `agents/` — 17 agents, one folder each

Every folder has a `SOUL.md` (identity + rules + tables touched) and an implementation file. `_base.ts` is the shared parent.

| Agent | Writes to | Notes |
|---|---|---|
| `ceo/` | reads only; pushes agent_reports | weekly briefing, recommendations, cross-agent orchestration |
| `marketing/` | reads content + analytics | content calendar, growth plan — delegates to content/social/seo/newsletter |
| `operations/` | content, products, job_listings (UPDATEs to flip published=1) | draftPipeline, publishQueue, runPublishQueue, schedule |
| `business/` | reads only | revenue report, pricing audit |
| `sales/` | 11 CRM tables | 43 methods; idempotency keys on activities/tasks/notes/proposals/invoices |
| `content/` | content + cms (auto-seeds missing cms rows) | ContentKind: blog/notes/guides/newsletter/compare/alternative/prompt/skills |
| `newsletter/` | subscribers (read), n8n_webhook (send) | approval-gated send |
| `copywriting/` | pages, products.description, links | bio, product copy |
| `courses/` | products (type=course) + lessons JSON | course creator |
| `store/` | products (download, service, webinar, …) | store manager |
| `hiring/` | job_listings + job_applications | hiring agent |
| `forms/` | forms + questions + submissions | forms builder |
| `docs/` | doc_collections + doc_articles (INT ids) | knowledge base |
| `analytics/` | reads only | `profile_analytics`, `*_analytics`, trigger-maintained |
| `seo/` | content (UPDATEs seo_*), collections | audit, fixPost, LLM visibility |
| `social/` | social_accounts + social_posts + social_queue | Zernio BYOK, n8n, platform fallback |
| `scheduler/` | reads due, flips published=1 via operations | hourly/daily/weekly cron entry |

---

## `lib/` — shared helpers

| File | Purpose |
|---|---|
| `db.ts` | Turso client. `db.execute` (reader, replica if set), `db.write` (writer), `db.txn` / `db.batch` (atomic). All wrapped in `withRetry()` for SQLITE_BUSY. |
| `db.adapter.ts` | Phase 1 ↔ Phase 2 swap point. `createAgentDB(event)` extracts raw libSQL client from Qwik `sharedMap`. |
| `id.ts` | `ulid()`, `iso()`, `now()`, `generateIdempotencyKey()` (UUID v7 style, timestamp-prefixed) |
| `enums.ts` | Single source of truth for status strings. Never literal `'pending_approval'` in agent code. |
| `validate.ts` | Numeric guards: `leadScore` (0–100), `probability` (0–100), `cents` (non-neg int), `hotScore` |
| `groups.ts` | `crm_contact_groups` junction helpers — replaces the old `LIKE '%grp_x%'` pattern (un-indexable, substring-collides) |
| `profile.ts` | `getBrandContext()` — loads profile + settings + credentials. Reads `PROFILE_ID` env for multi-profile DBs. |
| `memory.ts` | Dual-write `agent_memory` + local `memory.md` file. `logMemory(agent, action, meta)` |
| `kb.ts` | `agent_kb` query helpers — slug+summary index first, content on demand |
| `slug.ts` | Slug utilities — kebab-case, unique-per-profile |
| `analytics.ts` | Read helpers for `profile_analytics`, `product_analytics`, etc. |
| `pattern-detector.ts` | Hermes pattern: auto-detect when the same action runs 3+ times in 7 days → suggest a skill |

---

## `skills/` — on-demand skills (root-level, load only when needed)

Never auto-loaded. Loaded by the agent when the task calls for it.

| Folder | Load when |
|---|---|
| `brand/SKILL.md` | Writing any content (brand voice rules) |
| `schema/SKILL.md` | Writing SQL / writing to any table |
| `agents/SKILL.md` | Routing decisions |
| `analytics/SKILL.md` | Reading analytics |
| `store/SKILL.md` | Products / pricing |
| `ceo/SKILL.md`, `cmo/SKILL.md` | C-suite prompts |
| `blog-writer/SKILL.md`, `copywriting/SKILL.md`, `humanizer/SKILL.md`, `social/SKILL.md`, `social/content-seo.md` | Content production |
| `sales/` | Reserved (empty) |

---

## `.claude/commands/` — slash-command bodies

22 files. Each maps to a user-typed slash command. The command body describes the task and tells Claude which agent + methods to use.

## `.claude-plugin/` — Claude Code plugin manifest

`plugin.json` + `marketplace.json`. Users install via `/plugin install businesskit@businesskitai`.

## `context/` — Brand Foundation (user fills in once)

| File | Role |
|---|---|
| `about-me.md` | Who the user is — agents use for outreach, SEO E-E-A-T |
| `brand-voice.md` | Voice bible — agents read before writing |
| `working-style.md` | How the user wants agents to operate |
| `business.md` | Revenue model, 90-day goals |
| `brand.md` | Brand details |

## Root-level docs

| File | Role |
|---|---|
| `CLAUDE.md` | Session-start rules — read first every time |
| `HEARTBEAT.md` | Current business snapshot — live state |
| `ARCHITECTURE.md` | How the pieces fit together |
| `CODEBASE.md` | This file — per-file inventory |
| `CONVENTIONS.md` | Cheat sheet: profile_id, idempotency, soft-delete, enums |
| `DOMAINS.md` | Which agent writes to which UserDB tables |
| `PLAN.md` | Roadmap, folder map, Phase 1/2/3 |
| `REFERENCE.md` | Full schema details, agent routing, phase-2 swap |
| `SOUL.md` | Repo-level soul — tone, posture |
| `SYSTEM.md` | Runtime system prompts |
| `AGENTS.md`, `GEMINI.md` | Multi-runtime compat |
| `memory.md` | Per-session memory — mirror of agent_memory |
| `PRD-Agent-Harness.md`, `PRD-Agent-Composition.md` | Product notes |

## `businesskit-files/` — app-side schema (reference only)

Copies of the app's `src/lib/*.ts` schema files. Not checked in; consult when you need ground truth on table shape + triggers.

## Do not touch

| File | Reason |
|---|---|
| `agents/_base.ts` without reading its contract in ARCHITECTURE.md | Load-bearing for every agent |
| `lib/db.ts` call shape (`Stmt` type) | 100+ call sites would break |
| `tsconfig.json` `allowImportingTsExtensions` | The whole repo imports with `.ts` extensions |
