# CONVENTIONS.md

Cheat sheet — patterns that must be followed across every agent.

---

## profile_id — on every read and every write

```ts
// ❌ NO — unscoped
await db.execute('SELECT * FROM crm_contacts WHERE email=?', [email])

// ✅ YES
await db.execute({
  sql: 'SELECT * FROM crm_contacts WHERE profile_id=? AND email=?',
  args: [this.profileId, email],
})

// ✅ YES — updates scope by profile_id AND id
await db.write({
  sql: 'UPDATE crm_deals SET stage=? WHERE id=? AND profile_id=?',
  args: [stage, dealId, this.profileId],
})
```

`BaseAgent.insert/update/archive` enforce this for you; raw `db.execute/write` calls do not.

---

## Never hard DELETE

```ts
// ❌ NO — fires trg_content_delete, decrements counters
await db.execute('DELETE FROM content WHERE id=?', [id])

// ✅ YES — soft archive
await db.write({
  sql: 'UPDATE content SET hidden=1, updated_at=? WHERE id=? AND profile_id=?',
  args: [iso(), id, this.profileId],
})
```

App-side triggers enforce this for `products`, `purchases`, `subscribers`, `crm_activities`, `agent_reports`, `email_events`, `clicks_analytics`, `agent_audit`.

---

## Idempotency keys on retryable mutations

Tables with `idempotency_key TEXT` + unique partial index:
- `crm_activities`, `crm_tasks`, `crm_notes`, `crm_proposals`, `crm_invoices`
- `agent_memory`, `agent_notes`, `agent_tasks`, `agent_reports`, `agent_audit`

```ts
import { generateIdempotencyKey } from '../../lib/id.ts'
const ikey = input.idempotency_key ?? generateIdempotencyKey()

await db.write({
  sql: `INSERT OR IGNORE INTO crm_activities (..., idempotency_key) VALUES (..., ?)`,
  args: [..., ikey],
})
```

Retries within the same command invocation **must reuse the same key**. Simplest rule: one command invocation → one key per action.

---

## Never write to analytics tables

```ts
// ❌ NO
await db.write({ sql: 'UPDATE crm_analytics SET total_replies = ...' })

// ✅ YES — triggers maintain it
await this.logActivity(id, 'email', 'inbound', 'contact', reply)  // trigger fires
```

If JSON breakdowns (`contacts_30d`, `utm_source_breakdown`, etc.) look stale, do not rebuild. Tell the user: *"Analytics last rebuilt Xh ago — visit /dashboard/contacts/analytics to refresh."*

---

## Enums — never literal

```ts
// ❌ NO — typos silently no-op triggers (this was a real bug)
approval_status: 'pending'

// ✅ YES
import { CRM_ACTIVITY_APPROVAL } from '../../lib/enums.ts'
approval_status: 'pending_approval'  // or CRM_ACTIVITY_APPROVAL[0]
```

Source of truth: `lib/enums.ts`. Reference table: `skills/schema/SKILL.md`.

---

## Approval gate on outbound sends

All outbound communications (DM, email, proposal send) default to `approval_status='pending_approval'` unless `contact.auto_approve=1`.

```ts
const approval = contact.auto_approve ? 'auto_sent' : 'pending_approval'
```

Never flip to `'approved'` from the agent side — that's the user's action.

---

## Numeric bounds before DB triggers

```ts
import { leadScore, probability, cents } from '../../lib/validate.ts'

const score = leadScore(input.score)      // throws if outside 0-100
const prob  = probability(input.prob)     // 0-100 integer
const value = cents(input.value_cents)    // non-negative integer
```

Better to throw from the agent layer than wait for the DB trigger to ABORT.

---

## Timestamps

| Column type | Helper | Example |
|---|---|---|
| INTEGER unix epoch | `now()` | `1_714_000_000` |
| TEXT ISO | `iso()` | `'2026-05-08T17:30:00Z'` |

Pick the one that matches the column. `content.created_at` is ISO; `products.created_at` is unix. Look at the schema.

---

## CRM groups — junction table, never LIKE

```ts
// ❌ NO — O(N), un-indexable, substring-collides (grp_0055 matches grp_005)
`WHERE groups LIKE '%grp_005%'`

// ✅ YES — via lib/groups.ts
import { getContactsByGroup, addContactToGroup } from '../../lib/groups.ts'
await addContactToGroup(profileId, contactId, 'grp_005')
```

---

## Memory / reports / tasks — use BaseAgent helpers

```ts
await this.logMemory('Published blog post', { id, slug })  // trims to 20
await this.pushReport({ title, type: 'briefing', content }) // append-only
await this.createAgentTask({ title, command: 'weeklyBriefing', schedule: '0 8 * * 1' })
await this.updateTaskStatus(taskId, 'done')
```

Never INSERT into `agent_memory.id` — it's AUTOINCREMENT. `BaseAgent.logMemory` handles this correctly.

---

## Multi-profile UserDBs

Default: one profile per UserDB, auto-picked.

If a UserDB has ≥2 profiles, set `PROFILE_ID=<id>` in `.env`. `lib/profile.ts` throws with guidance when ambiguous.

`BaseAgent.create()` is the safe factory; it delegates the check to `init()`.

---

## Phase 1 ↔ Phase 2 — one-line swap

```ts
// Phase 1 (this repo, local .env)
import { db } from './lib/db.ts'

// Phase 2 (BusinessKit app, Qwik routeAction$)
import { createAgentDB } from './lib/db.adapter.ts'
const db = createAgentDB(event)  // reads sharedMap["userClient"]
```

`db.execute`, `db.write`, `db.txn`, `db.batch` work identically in both.

No agent file should ever know which phase it's running in.

---

## Cost discipline

- Load skills on demand. Never all at once. Never "just in case".
- `agent_kb` index (slug + summary) first; content on fetch.
- No `SELECT *` on large tables — name the columns.
- `HEARTBEAT.md` is a one-read snapshot; use it instead of re-querying analytics.
- Reports pushed mid-session via `pushReport()` so context is never lost.
