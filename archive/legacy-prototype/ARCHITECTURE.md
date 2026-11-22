# ARCHITECTURE.md

## Identity

- **Product**: `businesskit-agent` — the agent runtime for [BusinessKit](https://businesskit.io).
- **Role**: Users clone this repo (or install the Claude Code plugin), point it at their own Turso UserDB via `TURSO_URL` + `TURSO_TOKEN`, and get 17 domain agents (CEO, sales, content, seo, social, analytics, …) that read and write directly to their database.
- **Runs in**: Claude Code, Claude Cowork, Gemini CLI, Codex, bare `npx tsx cli.ts <agent>`. Same TypeScript, four runtimes.
- **Does NOT run**: the BusinessKit app. No HTTP server, no Qwik, no CF Worker. The app publishes only the UserDB schema contract.

## The Deal

> Bring your own credentials, use our platform.

BusinessKit provisions a hyper-isolated Turso DB per user ("UserDB") and encrypts the token in its central DB. The user can copy that token into this repo, and the agents do whatever the dashboard does — but from their terminal, via Claude, at a fraction of the token cost.

## Request Flow

```
User → "claude /ceo"  (or /crm, /blog-writer, etc.)
  ↓
Claude reads CLAUDE.md → routes to agent folder
  ↓
.claude/commands/<cmd>.md instructs Claude what to do
  ↓
Claude calls agents/<folder>/<folder>.ts methods (or writes SQL directly)
  ↓
lib/db.ts Turso client (withRetry, reader/writer split) → UserDB
  ↓
DB triggers maintain analytics scalars; JSON aggregation is app-side (lazy)
```

## Database — two layers, one API surface

| Layer | Where | What agents see |
|---|---|---|
| **Central DB** | Our Turso | Not visible to agents. App-only. |
| **UserDB** | User's Turso | This is the entire API. Every table, every trigger. |

The agent never talks to the app. The UserDB is the contract. Schema lives in the app repo (`src/lib/*.ts`) but the SQL shape is documented in `businesskit-files/` (ignored copies of the app-side schema definitions, for reference).

### Key UserDB tables the agents care about

- **profiles / users / settings / credentials** — loaded once via `getBrandContext()` (`lib/profile.ts`)
- **content + cms + content_analytics + cms_analytics** — unified CMS (blog, guides, notes, newsletter, compare, alternative, prompt, skills). Triggers maintain counts.
- **products / product_analytics / purchases** — commerce
- **crm_***  — 11 tables (contacts, deals, activities, tasks, notes, groups, contact_groups, templates, proposals, invoices, imports, analytics); 13 triggers key on approval_status + stage
- **social_accounts / social_posts / social_queue / social_inbox** — outbound
- **agent_***  — repo ↔ dashboard sync surface: agent_memory, agent_notes, agent_tasks, agent_reports, agent_kb, agent_skills, agent_files, agent_conversations, agent_audit
- **doc_collections / doc_articles / doc_analytics** — knowledge base (AUTOINCREMENT IDs)

## BaseAgent Contract

Every agent extends `BaseAgent` from `agents/_base.ts`. The base class owns:

```
this.profileId                 — set by init(), never by callers
this.userId                    — from profiles.user_id
this.ctx                       — { profile, settings, credentials }
this.init()                    — lazy load brand context

this.insert({ table, cols })   — INSERT OR IGNORE + audit, one txn, idempotency key
this.update({ table, id, cols }) — UPDATE + audit, APPEND_ONLY guard
this.archive(table, id)        — hidden=1 (never DELETE)
this.publish(table, id)        — published=1

this.txn(stmts)                — atomic batch via Turso batch API
this.auditStmt(...)            — private: builds agent_audit rows
this.pushReport(...)           — append-only agent_reports row
this.logMemory(action, meta)   — trims to last 20 rows per agent
this.createAgentTask / updateTaskStatus / listAgentTasks — kanban API
this.hasMigration(id)          — reads _schema_migrations once per process
```

## Invariants — never break these

1. **Every read and write filters by `profile_id`.** No exceptions. `BaseAgent` enforces it on `insert/update/archive`; other call sites must add `WHERE profile_id=?` themselves.
2. **Never hard DELETE.** Use `hidden=1`, `archived=1`, or `status='archived'`. Hard deletes fire `trg_*_delete` triggers that decrement counters.
3. **Never write to `*_analytics` tables.** They're trigger-maintained. Agents read them, they never write.
4. **Credentials are read-only from agents.** Never log or echo values from the `credentials` table.
5. **Status enums are the source of truth in `lib/enums.ts`.** Never literal `'pending_approval'` etc. in agent code — typos silently no-op triggers.
6. **`crm_activities` is append-only for body/type/direction.** `approval_status` and `read_at` updates are allowed (approval flow needs them). DELETE is blocked by trigger.
7. **Append-only-for-real tables: `agent_reports`, `email_events`, `clicks_analytics`.** `BaseAgent.update` throws before DB trigger does.
8. **Never trigger analytics JSON rebuilds from the agent.** Dashboard aggregates with `last_aggregated_at` throttle; agent reads as-is and surfaces "stale" note if needed.
9. **`profile_id` selection.** Single-profile UserDB → auto-pick. Multi-profile → `PROFILE_ID` env var required. `lib/profile.ts` throws with guidance.
10. **Phase 1 → Phase 2 swap is one line in `lib/db.adapter.ts`.** No forked behavior between transports.

## Phase 1 → Phase 2 → Phase 3

- **Phase 1 (now)**: local repo, `.env` credentials, agents via Claude Code / CLI. Where we are.
- **Phase 2**: same agents imported into the BusinessKit Qwik app, `lib/db.adapter.ts` injects `sharedMap["userClient"]` instead of reading `.env`. One-line swap. `createAgentDB(event)` replaces `db`.
- **Phase 3**: CF Workflows / Durable Objects run scheduler + CEO briefings on cron. Spectrum bridges iMessage/WhatsApp/Slack → agent calls. No schema changes, just new transports.

## Cost discipline

- Skills load on demand (not `.claude/skills/*` — that's auto-loaded by Claude Code and contradicts this rule).
- KB index scan first (slug + summary), content on demand.
- Never `SELECT *` on analytics tables.
- `HEARTBEAT.md` is a one-read snapshot of current business state.
