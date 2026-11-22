# Agent Repo — Fix Tasks

**Audience**: Claude Sonnet, implementing in the agent repo (`businesskit-agent`).
**Context**: This repo connects to a user's UserDB via Turso token. It never talks to the BusinessKit app. The DB + SQL contract is the only interface. The app-side team is hardening the DB schema in parallel (see `opus-schema-review.md`). Your job is to update the agent side so it plays safely with the new invariants and stops causing the correctness bugs identified in the schema audit.

**Ground truth for this repo**:
- `/Users/2.o/qwik-claw/README-agent.md` — user-facing setup docs
- `/Users/2.o/qwik-claw/PLAN-agent.md` — build plan, phases, agent roster
- Schema contract is defined in the BusinessKit app repo's `src/lib/*.ts` schema files. Treat UserDB as the API.

Read these before starting. The app repo changes land in parallel; coordinate on migrations.

---

## Key constraints (don't violate these)

- **Minimal code.** Raw libSQL, no ORM. One file per agent. BaseAgent handles profile isolation.
- **Per-profile scoping.** Every write gets `profile_id`. Enforced in `_base.ts`, never bypassed in agent files.
- **No hard deletes.** Use `hidden = 1` / `archived = 1` / `status = 'archived'`.
- **No credential leakage.** `credentials` table is read-only from agents; never log raw values.
- **Same codebase, two transports.** Phase 1 (local .env) → Phase 2 (sharedMap from app) must remain a one-line swap via `db.adapter.ts`. Don't fork behaviors.
- **Token-cost discipline.** Skills on demand. KB index (slug + summary) first, content on fetch. No `SELECT *` on large tables. No full-table scans in agent context assembly.

---

## P0 — Safety-critical. Do first.

### P0-1. Add idempotency to every mutating call in `_base.ts`

**Why**: Network blip mid-INSERT + retry = duplicate row = trigger fires twice = UserDB counters drift forever. This is the single biggest correctness bug the agent can cause today.

**How**:

1. Add `generateIdempotencyKey()` helper in `lib/id.ts`:

```ts
// UUID v7 so keys sort lexicographically by time (useful for debugging)
export function generateIdempotencyKey(): string {
  // Minimal UUID v7 impl — timestamp-prefixed
  const ts = Date.now();
  const rand = crypto.getRandomValues(new Uint8Array(10));
  const tsHex = ts.toString(16).padStart(12, '0');
  const randHex = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${tsHex.slice(0,8)}-${tsHex.slice(8,12)}-7${randHex.slice(0,3)}-${randHex.slice(3,7)}-${randHex.slice(7,19)}`;
}
```

2. Refactor every mutating helper in `_base.ts` (insert, publish, archive, addNote, addActivity, addTask, etc.) to:
   - Accept an optional `idempotencyKey` param.
   - Generate one if not supplied.
   - Use `INSERT OR IGNORE` with an `idempotency_key` column.
   - Return `{ inserted: boolean, id: string }` so callers can detect dedup.

3. For every agent command in `.claude/commands/*.md`, document that retries within the same command invocation must reuse the same key. Simplest rule: one command invocation → one key per action.

**Tables that will gain an `idempotency_key TEXT UNIQUE` column (app-side work, coordinate)**:
- `crm_activities`, `crm_tasks`, `crm_notes`, `crm_proposals`, `crm_invoices`
- `social_posts`, `social_queue`
- `community_posts`, `community_comments`
- `agent_notes`, `agent_reports`, `agent_tasks`, `agent_memory`

Until the app ships the columns: BaseAgent can store the key in a `metadata` JSON column if one exists, or defer to Phase 1.5. Don't block agents shipping on this — ship the helper now, wire it as columns land.

### P0-2. Wrap every multi-statement pattern in a transaction

**Why**: `crm.md` L217 (approve-DM flow) shows two separate UPDATEs — `crm_activities` then `crm_contacts`. If the connection drops between them, state is partial and counters drift. Same pattern in proposal-send, invoice-send, reaction logging, deal-won.

**How**: add `BaseAgent.txn()`:

```ts
// lib/db.ts — extend client wrapper
async txn(statements: Array<{ sql: string; args: any[] }>): Promise<void> {
  await this.client.batch(statements, 'write');  // Turso atomic batch
}
```

Refactor these specific flows in agent files to single `txn([...])` calls:

- `agents/growth/crm-agent.ts` (or wherever DM approval lives) — activity UPDATE + contact UPDATE
- Proposal send — proposal UPDATE + activity INSERT
- Invoice send — invoice UPDATE + activity INSERT + reminder scheduling
- Deal won — deal UPDATE (triggers fire) + task INSERT for follow-up
- Reply logged — activity INSERT + contact UPDATE

Update the corresponding `.claude/commands/*.md` to show the transaction pattern. Copy the examples from `crm.md` and convert them in-place.

### P0-3. Implement SQLITE_BUSY retry policy

**Why**: Turso is single-writer. Two agents (or one agent + the app) writing concurrently to the same UserDB → `SQLITE_BUSY`. Today agent writes silently fail at scale.

**How**: add to `lib/db.ts`:

```ts
export async function withRetry<T>(op: () => Promise<T>, maxTries = 5): Promise<T> {
  for (let i = 0; i < maxTries; i++) {
    try { return await op(); }
    catch (e: any) {
      const msg = e?.message ?? '';
      const retryable = /SQLITE_BUSY|database is locked|SQLITE_LOCKED/i.test(msg);
      if (!retryable || i === maxTries - 1) throw e;
      // Exponential backoff with jitter: 50, 100, 200, 400, 800ms
      await new Promise(r => setTimeout(r, 50 * 2 ** i + Math.random() * 50));
    }
  }
  throw new Error('unreachable');
}
```

Wrap every DB mutation in BaseAgent with `withRetry()`. Document the policy in `SYSTEM.md` / `CLAUDE.md` so agents know silent write failures are now impossible; real errors will bubble.

### P0-4. Stop relying on `groups LIKE '%grp_005%'`

**Why**: This query is O(N), un-indexable, AND has a substring-collision bug: `grp_0055` matches `grp_005`. App-side is adding a `crm_contact_groups` junction table.

**How**:

1. Update `agents/growth/crm-agent.ts` helper functions (or wherever group queries live) to use the junction table:

```ts
// Old (delete these)
// WHERE groups LIKE '%grp_005%'

// New
`SELECT c.* FROM crm_contacts c
 JOIN crm_contact_groups ccg ON ccg.contact_id = c.id
 WHERE ccg.group_id = ? AND c.archived = 0`
```

2. Update `.claude/commands/crm.md` examples in this repo to match.

3. For adding a contact to a group:

```ts
// Old (delete)
// UPDATE crm_contacts SET groups = json_insert(groups, '$[#]', 'grp_005') WHERE id = ?

// New
INSERT OR IGNORE INTO crm_contact_groups (contact_id, group_id) VALUES (?, ?)
UPDATE crm_groups SET contact_count = contact_count + 1 WHERE id = ?
```

4. Coordinate with app team: don't switch until the junction table is live in the target UserDB's schema version. Read `_schema_migrations` to detect.

### P0-5. Centralize status enums

**Why**: Today agents generate status strings as free text. A typo (`'Pending_Approval'`) silently no-ops the UserDB trigger and drifts counters. App-side is centralizing enums in `src/lib/enums.ts`.

**How**:

1. Add `lib/enums.ts` in this repo, mirroring the app-side file exactly:

```ts
export const CRM_CONTACT_STATUS = ['lead','prospect','customer','churned'] as const;
export const CRM_ACTIVITY_APPROVAL = ['pending_approval','approved','rejected','auto_sent'] as const;
export const CRM_DEAL_STAGE = ['new','contacted','proposal','negotiation','won','lost'] as const;
export const SOCIAL_POST_STATUS = ['draft','scheduled','queued','publishing','published','failed'] as const;
export const AD_CAMPAIGN_STATUS = ['draft','active','paused','ended','rejected','error','archived'] as const;
export const COMMUNITY_POST_STATUS = ['published','removed','pending'] as const;
export const EMAIL_EVENT_TYPE = ['delivered','opened','clicked','bounced','complained','failed'] as const;
export const FEEDBACK_POST_STATUS = ['open','planned','in_progress','completed','closed','wont_do'] as const;
export const AFFILIATE_COMMISSION_STATUS = ['pending','approved','paid','void'] as const;
// Full list in app repo's src/lib/enums.ts — keep in sync
```

2. Every agent file imports from `lib/enums.ts`. No raw status strings anywhere else in the repo. Lint rule: grep `"'pending_approval'"` etc. at CI time and fail if found outside `lib/enums.ts`.

3. Add a skill file `.claude/skills/enums.md` that lists the allowed values per column. This loads into every conversation so the LLM itself can't invent a new status string.

4. Publish the enum file as the shared contract. When the app adds a new enum value, update BOTH repos in the same PR cycle.

### P0-6. Write to the new `agent_audit` table on every mutation

**Why**: App-side is adding `agent_audit` (append-only in UserDB) with columns `id, ts, agent_type, table_name, row_id, action, diff, idempotency_key`. Every agent write must produce one audit row.

**How**:

1. Add `BaseAgent.audit(action, tableName, rowId, diff)` helper.
2. After every successful mutation in BaseAgent (insert/update/archive), write one audit row in the same transaction:

```ts
await this.txn([
  { sql: `INSERT INTO crm_activities (...) VALUES (...)`, args: [...] },
  { sql: `INSERT INTO agent_audit (id, agent_type, table_name, row_id, action, diff, idempotency_key)
          VALUES (?, ?, 'crm_activities', ?, 'insert', ?, ?)`,
    args: [generateIdempotencyKey(), this.agentType, activityId, JSON.stringify(diff), idempKey] }
]);
```

3. Size the `diff` column: store `{col: [old, new]}` for updates; store `{col: new}` for inserts. Cap diff payload at 4KB — truncate with `{_truncated: true, original_size_bytes: N}` marker.

4. Do NOT audit reads. Only mutations.

5. Document in `SYSTEM.md`: "Every mutation produces an audit row. The audit table is append-only, trigger-enforced, not editable. If you need to 'fix' a past action, insert a correcting action; do not delete."

### P0-7. Respect append-only invariants in the schema

**Why**: App-side is adding BEFORE UPDATE/DELETE triggers on `crm_activities`, `agent_reports`, `email_events`, `clicks_analytics`. After the migration lands, any UPDATE to `crm_activities.body` (for example) raises ABORT.

**How**: audit every agent file for patterns like:

- `UPDATE crm_activities SET body = ?` — DELETE this pattern; insert a new correcting activity instead.
- `DELETE FROM crm_activities` — same.
- `UPDATE agent_reports SET ...` — only `status` will remain mutable.
- `UPDATE crm_proposals SET body = ?` where `status IN ('sent','paid')` — will fail; docs must clarify you can only update a proposal before it's sent.

Update `.claude/commands/*.md` examples accordingly. Grep the whole repo for `UPDATE crm_activities`, `DELETE FROM crm_activities`, `UPDATE email_events`, `UPDATE clicks_analytics` and either remove or gate by column list.

### P0-8. Guard against numeric out-of-bounds writes

**Why**: App-side is adding BEFORE INSERT/UPDATE triggers that raise on:
- `lead_score` outside 0–100
- `probability` outside 0–100
- `*_cents` < 0
- `hot_score` < 0

The agent should catch these at the agent layer before the DB does — faster failure, clearer error.

**How**: add validation helpers in `lib/validate.ts`:

```ts
export function leadScore(n: number): number {
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`lead_score must be 0–100, got ${n}`);
  return Math.round(n);
}
export function probability(n: number): number { /* same 0–100 */ }
export function cents(n: number): number {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) throw new Error(`cents must be non-negative integer, got ${n}`);
  return n;
}
```

Every agent uses these before an UPDATE. Cheap; prevents the retry loop that comes from DB-rejected writes.

---

## P1 — Correctness and hygiene.

### P1-1. Schema-version awareness

**Why**: App-side adds a `_schema_migrations` table in UserDB. Different users' DBs will be at different schema versions during rollouts. Agent must detect and adapt.

**How**:

1. On agent startup (`setup.ts` and first `BaseAgent` construction), `SELECT id FROM _schema_migrations` and cache the version set.
2. If a required migration isn't present (e.g. `crm_add_idempotency_key_v1`), fall back to pre-migration query shape.
3. Expose `this.hasMigration('crm_add_idempotency_key_v1')` helper on BaseAgent.
4. Log once at agent-start: "Connected to UserDB with N migrations applied. Missing expected: X, Y." This makes rollout state visible.

### P1-2. `agent_memory` retention

**Why**: `agent_memory` is designed as "rolling 20-row session log" but the schema has no limit. Over 5 years at 10 writes/week, that's 2600 rows per agent per DB. No cleanup today.

**How**: in BaseAgent's memory-write helper, after INSERT, also:

```ts
DELETE FROM agent_memory
WHERE agent_type = ?
  AND id NOT IN (
    SELECT id FROM agent_memory
    WHERE agent_type = ?
    ORDER BY created_at DESC
    LIMIT 20
  )
```

Same pattern already documented in the repo (line mentions rolling 20). Make it actually happen.

### P1-3. `last_aggregated_at` debounce on analytics views

**Why**: App's lazy-rebuild pattern uses `last_aggregated_at` on analytics tables to avoid rebuilding on every page visit. When agents read analytics (e.g. `/analytics`, `/ceo` briefing), they should respect the debounce — don't trigger a rebuild from the agent side unless explicitly asked.

**How**:

1. For read queries, SELECT from the singleton analytics row directly. Never call the app's rebuild path.
2. If the agent detects `last_aggregated_at` is stale (> 1 hour old), add a note to the output: "Analytics last rebuilt 6 hours ago — run `/analytics refresh` or visit the dashboard to update." Don't rebuild automatically.
3. Document this in `.claude/commands/analytics.md` and `.claude/commands/ceo.md`.

### P1-4. Use Turso read replicas for agent read traffic

**Why**: BaseAgent briefings (CEO, analytics, CRM context) do many reads per invocation. Hitting primary wastes writes capacity. Turso embedded replicas are nearly free per-read once replicated.

**How**:

1. `lib/db.ts`: accept an optional `replicaUrl` in config. If present, create two clients — writer (primary) and reader (replica).
2. Expose `db.read()` and `db.write()` separately. Reads default to replica; writes always to primary.
3. Update `.env.example`: `TURSO_REPLICA_URL=` (optional).
4. Document in `README.md` that users can add a replica URL for faster agent briefings.

### P1-5. FTS5 search against `agent_kb`

**Why**: README advertises `/kb` as a compounding knowledge layer. Currently likely a `LIKE '%query%'` scan. At 10K KB entries per heavy user, this stalls. App-side may add FTS5 virtual tables; agent should use them when present.

**How**:

1. Schema-version check: `hasMigration('agent_kb_fts_v1')`.
2. If present: `SELECT rowid FROM agent_kb_fts WHERE agent_kb_fts MATCH ? LIMIT 20`, then fetch matching rows.
3. If absent: fall back to `LIKE '%?%'` with a hard LIMIT 20.

### P1-6. Skill-loading discipline

**Why**: README claims "$130 → $10" cost reduction via skills-on-demand. Easy to regress.

**How**: audit `.claude/skills/` files. Rules:
- Each skill file ≤ 200 lines, ≤ 4KB.
- Skills that are always needed (brand, business, schema shape) stay in `.claude/skills/` (auto-loaded).
- Skills needed occasionally (schema details per domain, analytics recipes) move to `.claude/skills/on-demand/` and are loaded only when the relevant command runs.
- Add a CI check: total `.claude/skills/*.md` byte count ≤ 20KB.

### P1-7. Agent cannot write to other profiles in same DB

**Why**: UserDB is per-profile, so normally this isn't an issue. But during profile switches or edge cases (one user has multiple profiles in development), agents could cross-write.

**How**: add single-profile guard in BaseAgent constructor:

```ts
const profiles = await client.execute(`SELECT COUNT(*) as n FROM profiles`);
if (Number(profiles.rows[0].n) !== 1) {
  throw new Error('Agent expects UserDB to contain exactly one profile; found ' + profiles.rows[0].n);
}
const row = await client.execute(`SELECT id FROM profiles LIMIT 1`);
this.profileId = row.rows[0].id;
```

Every write uses `this.profileId`. Never accept `profile_id` as a caller argument.

### P1-8. Spectrum / Phase 2 channel readiness

**Why**: PLAN-agent.md Phase 2 mentions Spectrum for iMessage/WhatsApp etc. Before adding that layer, make sure agent-to-DB write shapes are consistent across channels (no "slack shortcut" that skips audit).

**How**: nothing to build today. Add a note to `lib/channels/README.md` (stub) that any future channel MUST go through BaseAgent. No channel bypasses audit + idempotency.

---

## P2 — Nice to have.

- **Agent run report**: each command invocation writes one `agent_reports` row summarizing what it did (how many INSERTs/UPDATEs, which tables touched, token cost estimate). Append-only; shows up in dashboard.
- **Per-agent cost ceiling**: refuse to spend > $0.50 of tokens in one command unless explicitly approved. README pitches cost discipline — enforce it.
- **Dry-run mode**: `--dry` flag on any command prints the SQL it would execute but doesn't run it. Useful for debugging.
- **`.claude/commands/migrate.md`**: a slash command that inspects the connected UserDB's `_schema_migrations`, compares to the latest expected, and tells the user to upgrade their BusinessKit app if out of date.

---

## Ordered work plan

1. **P0-5** enums.ts + skill file. No code moves without this — it's the foundation for enum discipline.
2. **P0-3** SQLITE_BUSY retry wrapper. Small, self-contained, immediately valuable.
3. **P0-8** numeric bounds validation helpers.
4. **P0-1** idempotency key helper + BaseAgent integration. Coordinate with app team for column rollout; ship helper now.
5. **P0-2** transaction helper + refactor existing multi-statement flows.
6. **P0-6** audit writes in BaseAgent. Land after P0-1 (reuses idempotency key).
7. **P0-4** CRM groups junction switch. Gate on schema-migration detection (P1-1).
8. **P0-7** remove UPDATE patterns on append-only tables. Sweep the codebase, update command docs.
9. **P1-1** schema-version detection helper.
10. **P1-2** agent_memory retention.
11. **P1-3** analytics read discipline.
12. **P1-4** replica reader (additive, behind env var).
13. **P1-5** FTS5 when app ships it.
14. **P1-6** skill bloat audit.
15. **P1-7** single-profile guard.
16. **P2-*** whenever.

---

## Testing after each change

- `npm run setup` must pass against a test UserDB.
- `npx tsx cli.ts ceo` should produce a briefing without errors.
- For every agent file touched, run its slash command end-to-end against a dev UserDB. Verify in Turso Studio that rows + audit entries landed.
- Grep for forbidden patterns before PR:
  - `LIKE '%grp_` — should not appear after P0-4
  - `UPDATE crm_activities SET body` — should not appear after P0-7
  - Raw status string literals like `'pending_approval'` outside `lib/enums.ts`

---

## Invariants that must not break

- Phase 1 → Phase 2 swap remains one line (`db.adapter.ts`).
- BaseAgent signature stays backward-compatible; existing agent files keep working.
- Cost discipline: skills on demand, KB index first, no `SELECT *` on large tables.
- profile_id is set by BaseAgent, never by callers.
- Credentials are read-only; never log or export.
- No raw-SQL DDL in this repo; schema is the app's job. This repo only does reads + INSERT/UPDATE on app-provisioned tables.

---

## Coordination with app team

Some of the above depends on app-side migrations landing first. Specifically:

| Task | Depends on app-side |
|---|---|
| P0-1 (idempotency) | `idempotency_key` columns added to tables |
| P0-4 (groups junction) | `crm_contact_groups` table created |
| P0-6 (audit) | `agent_audit` table + triggers |
| P0-7 (append-only) | BEFORE UPDATE/DELETE triggers live |
| P0-8 (numeric bounds) | Schema-side guard triggers live |
| P1-1 (schema versions) | `_schema_migrations` table live |
| P1-5 (FTS5) | `agent_kb_fts` virtual table live |

Coordinate the rollout: agent-repo PRs should detect schema-migration state and fall back gracefully until each app-side migration is present. No hard-cutover.

---

## Out of scope for this pass

- Rewriting any agent prompt files in `.claude/commands/*.md` beyond the specific examples flagged above.
- Adding new agents or commands.
- MCP server (Phase 2, separate effort).
- CF Durable Objects / autonomous mode (Phase 3).
- UI / dashboard work.

Keep the scope tight. The app-side schema hardening is the big change; this repo's job is to stop causing the bugs that schema hardening exists to prevent.
