# Allowed status values

Single source of truth: `lib/enums.ts`. Never invent new status strings in agent code or SQL literals — a typo silently no-ops the UserDB triggers and drifts counters (P0-5).

Import, don't literal:

```ts
import { CRM_ACTIVITY_APPROVAL, CRM_DEAL_STAGE } from '../../lib/enums.ts'
// Use: CRM_ACTIVITY_APPROVAL[0]  →  'pending_approval'
```

## Allowed values per column

| Column | Allowed values |
|---|---|
| `crm_contacts.status` | `lead`, `prospect`, `customer`, `churned`, `archived` |
| `crm_activities.approval_status` | `pending_approval`, `approved`, `rejected`, `auto_sent` |
| `crm_deals.stage` | `new`, `contacted`, `proposal`, `negotiation`, `won`, `lost` |
| `social_posts.status` | `draft`, `scheduled`, `queued`, `publishing`, `published`, `failed`, `cancelled` |
| `agent_notes.status` | `inbox`, `processing`, `done`, `archived` |
| `agent_tasks.status` | `pending`, `active`, `running`, `done`, `paused`, `failed`, `cancelled` |
| `agent_kb.entry_type` | `entity`, `concept`, `source`, `synthesis`, `index` |
| `community_posts.status` | `published`, `removed`, `pending` |
| `email_tracking_events.type` | `delivered`, `opened`, `clicked`, `bounced`, `complained`, `failed` |
| `affiliate_commissions.status` | `pending`, `approved`, `paid`, `void` |

Also: soft-delete flags — `hidden=1`, `archived=1`, or `status='archived'`. Never hard-delete.

Numeric bounds: `lead_score` 0-100, `probability` 0-100, `*_cents` ≥ 0 integer. Use `lib/validate.ts` helpers before writes.

Groups: use `lib/groups.ts` junction-table helpers. Never `WHERE groups LIKE '%grp_x%'` (P0-4).

Append-only (never UPDATE/DELETE): `crm_activities`, `agent_reports`, `email_events`, `clicks_analytics`. Insert a correcting row instead.
