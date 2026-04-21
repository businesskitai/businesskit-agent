# /crm — Agent-First CRM

Full contact management, deal pipeline, outreach, proposals, invoices, and analytics.
Reads/writes directly to Turso UserDB. DB triggers keep analytics accurate automatically.

---

## Architecture

```
You/Agent writes → Turso DB → Triggers fire → crm_analytics always accurate
                                             → No app server needed
```

**13 DB triggers** handle all scalar analytics in real-time:

- Contact insert/convert/archive → funnel counts
- Activity insert/approve/reject → agent metrics + approval queue
- Deal insert/won/lost/update    → pipeline + forecast

**JSON breakdowns** (7d/30d/12m/lifetime/utm) aggregate on analytics page visit.

---

## Tables

| Table | Purpose |
|---|---|
| `crm_contacts` | Leads, prospects, customers + full agent state |
| `crm_deals` | Pipeline opportunities |
| `crm_activities` | Append-only timeline (DMs, emails, calls, purchases) |
| `crm_tasks` | Follow-up to-dos |
| `crm_notes` | Rich-text notes per contact |
| `crm_groups` | Named groups (Investors, Clients, VIP etc) |
| `crm_templates` | Outreach templates with reply rate tracking |
| `crm_proposals` | Client proposals with e-sign + payment |
| `crm_invoices` | Invoices with line items |
| `crm_analytics` | 1 row per profile, always current |

---

## Session start

```
/crm
```

Always run this first:

```ts
// 1. Pipeline summary
SELECT * FROM crm_analytics LIMIT 1
// → total_contacts, open_deals, total_pending_approvals, forecast_this_month_cents

// 2. Pending approvals (show these first — agent is waiting on you)
SELECT a.*, c.first_name, c.last_name, c.platform
FROM crm_activities a
JOIN crm_contacts c ON c.id = a.contact_id
WHERE a.approval_status = 'pending_approval'
ORDER BY a.approval_requested_at DESC
LIMIT 10

// 3. Follow-ups due today
SELECT t.*, c.first_name, c.last_name
FROM crm_tasks t
JOIN crm_contacts c ON c.id = t.contact_id
WHERE t.status = 'open' AND t.due_at <= strftime('%s','now')
ORDER BY t.due_at ASC
LIMIT 10

// 4. Hot leads ready for outreach
SELECT id, first_name, last_name, company, platform, lead_score,
       pain_point, suggested_dm, outreach_status, agent_status
FROM crm_contacts
WHERE agent_status = 'outreach_ready'
  AND outreach_status = 'new'
  AND archived = 0
ORDER BY lead_score DESC
LIMIT 10
```

---

## Contacts

### Add a contact (manual)

```ts
INSERT INTO crm_contacts (
  id, profile_id, first_name, last_name, email, company,
  platform, status, source, contact_type
) VALUES (?, ?, ?, ?, ?, ?, ?, 'lead', 'manual', 'professional')
// trigger fires → crm_analytics.total_contacts + 1, total_leads + 1
```

### Research a lead (agent)

```ts
// 1. Read existing context before acting
SELECT * FROM crm_contacts WHERE id = ?

// 2. Check agent_paused
// if agent_paused = 1 AND (agent_paused_until IS NULL OR agent_paused_until > now()) → SKIP

// 3. Check agent_instructions for per-contact overrides

// 4. Update with research findings
UPDATE crm_contacts SET
  bio = ?,
  recent_post = ?,
  recent_post_url = ?,
  pain_point = ?,
  audience_size = ?,
  company_size = ?,
  industry = ?,
  lead_score = ?,
  lead_score_reason = ?,
  icp_match = ?,         -- 'strong'|'moderate'|'weak'|'unknown'
  urgency = ?,
  buying_intent = ?,
  social_links = ?,      -- JSON [{platform, url, username, followers}]
  agent_status = 'enriched',
  agent_context = ?,     -- JSON {summary, tone, preferred_channel, do_not_mention[]}
  agent_last_run_at = strftime('%s','now'),
  enriched_at = strftime('%s','now'),
  enrichment_source = 'agent',
  updated_at = strftime('%s','now')
WHERE id = ?
```

### List contacts

```
"Show my top leads"
→ SELECT ... WHERE agent_status = 'enriched' ORDER BY lead_score DESC LIMIT 20

"Show leads ready for outreach"
→ SELECT ... WHERE agent_status = 'outreach_ready' AND outreach_status = 'new'

"Show who replied"
→ SELECT ... WHERE outreach_status = 'replied'

"Show prospects in Investors group"
→ SELECT ... WHERE groups LIKE '%grp_005%'

"Show contacts from Twitter"
→ SELECT ... WHERE platform = 'twitter'
```

### Score a lead

```ts
UPDATE crm_contacts SET
  lead_score = ?,           -- 0-100
  lead_score_reason = ?,
  icp_match = ?,
  urgency = ?,
  buying_intent = ?,
  agent_status = 'outreach_ready',
  updated_at = strftime('%s','now')
WHERE id = ?
```

### Update contact status

```ts
UPDATE crm_contacts SET
  status = 'customer',      -- trigger fires → total_customers+1, total_leads-1
  updated_at = strftime('%s','now')
WHERE id = ?
```

---

## Outreach

### Draft a DM (agent, needs approval)

```ts
// 1. Pull full context first
SELECT c.*,
  (SELECT body FROM crm_activities WHERE contact_id = c.id ORDER BY occurred_at DESC LIMIT 1) as last_message,
  (SELECT title FROM crm_tasks WHERE contact_id = c.id AND status = 'open' ORDER BY due_at ASC LIMIT 1) as next_task
FROM crm_contacts c WHERE c.id = ?

// 2. Read agent_context + agent_instructions
// 3. Pick best template
SELECT * FROM crm_templates
WHERE type = 'dm'
  AND (platform = ? OR platform IS NULL)
ORDER BY reply_rate_pct DESC LIMIT 3

// 4. Generate DM filling {{first_name}} {{company}} {{pain_point}} variables

// 5. Save draft + log activity
UPDATE crm_contacts SET
  suggested_dm = ?,
  outreach_status = 'dm_drafted',
  updated_at = strftime('%s','now')
WHERE id = ?

INSERT INTO crm_activities (
  id, profile_id, contact_id,
  type, direction, sender,
  body, metadata, searchable_context,
  approval_status, approval_requested_at
) VALUES (
  ?, ?, ?,
  'dm', 'outbound', 'agent',
  ?, '{"platform":"twitter"}', ?,
  'pending_approval', strftime('%s','now')
)
// trigger fires → total_pending_approvals + 1
```

### Approve a DM (you)

```ts
UPDATE crm_activities SET
  approval_status = 'approved',
  approved_at = strftime('%s','now')
WHERE id = ?
// trigger fires → total_pending_approvals - 1, total_approved + 1

UPDATE crm_contacts SET
  dm_sent = 1,
  dm_sent_at = strftime('%s','now'),
  outreach_status = 'dm_sent',
  last_contacted_at = strftime('%s','now'),
  last_activity_at = strftime('%s','now'),
  updated_at = strftime('%s','now')
WHERE id = ?
```

### Reject a DM (you)

```ts
UPDATE crm_activities SET
  approval_status = 'rejected'
WHERE id = ?
// trigger fires → total_pending_approvals - 1, total_rejected + 1
```

### Auto-approve mode (contact level)

```ts
// Enable for a contact (agent sends without asking)
UPDATE crm_contacts SET auto_approve = 1 WHERE id = ?

// When auto_approve = 1, use approval_status = 'auto_sent' instead of 'pending_approval'
// trigger fires → total_agent_actions + 1, but NOT total_pending_approvals
```

### Log a reply (contact replied)

```ts
INSERT INTO crm_activities (
  id, profile_id, contact_id,
  type, direction, sender,
  body, metadata, searchable_context,
  approval_status
) VALUES (
  ?, ?, ?,
  'dm', 'inbound', 'contact',
  ?, '{"platform":"twitter"}', ?,
  'auto_sent'
)
// trigger fires → total_replies + 1

UPDATE crm_contacts SET
  outreach_status = 'replied',
  reply_sentiment = ?,          -- 'positive'|'neutral'|'negative'
  last_reply_at = strftime('%s','now'),
  last_reply_channel = 'dm',
  last_activity_at = strftime('%s','now'),
  conversation_thread = json_patch(conversation_thread, ?),
  updated_at = strftime('%s','now')
WHERE id = ?
```

### Pause agent for a contact

```ts
UPDATE crm_contacts SET
  agent_paused = 1,
  agent_paused_until = strftime('%s','now','+7 days'),  -- NULL = forever
  updated_at = strftime('%s','now')
WHERE id = ?
```

---

## Deals

### Create a deal

```ts
INSERT INTO crm_deals (id, profile_id, contact_id, title, value_cents, stage, probability)
VALUES (?, ?, ?, ?, ?, 'proposal', 70)
// trigger fires → total_deals+1, open_deals+1, total_deal_value_cents + value
```

### Move deal stage

```ts
UPDATE crm_deals SET
  stage = 'won',              -- trigger fires → won_deals+1, open_deals-1
  closed_at = strftime('%s','now'),
  updated_at = strftime('%s','now')
WHERE id = ?
```

### Update deal for forecast

```ts
UPDATE crm_deals SET
  probability = 85,           -- trigger fires → forecast recalculated
  expected_close_at = ?,
  value_cents = ?,
  updated_at = strftime('%s','now')
WHERE id = ?
```

### Show pipeline

```ts
SELECT d.*, c.first_name, c.last_name, c.company, c.avatar_url
FROM crm_deals d
JOIN crm_contacts c ON c.id = d.contact_id
WHERE d.profile_id = ?
  AND d.stage NOT IN ('won','lost')
ORDER BY d.value_cents DESC
```

---

## Tasks

### Create a follow-up task

```ts
INSERT INTO crm_tasks (id, profile_id, contact_id, deal_id, title, due_at, priority)
VALUES (?, ?, ?, ?, ?, strftime('%s','now','+2 days'), 'high')
```

### Complete a task

```ts
UPDATE crm_tasks SET
  status = 'done',
  completed_at = strftime('%s','now'),
  updated_at = strftime('%s','now')
WHERE id = ?
```

### Tasks due today

```ts
SELECT t.*, c.first_name, c.last_name
FROM crm_tasks t
JOIN crm_contacts c ON c.id = t.contact_id
WHERE t.profile_id = ?
  AND t.status = 'open'
  AND t.due_at <= strftime('%s','now')
ORDER BY t.priority DESC, t.due_at ASC
```

---

## Proposals

### Create a proposal

```ts
// 1. Get next proposal number
UPDATE settings SET proposal_sequence = proposal_sequence + 1;
SELECT proposal_sequence FROM settings LIMIT 1;

INSERT INTO crm_proposals (
  id, profile_id, contact_id, deal_id,
  title, body, excerpt, public_slug,
  status, client_name, client_email, client_company,
  payment_required, payment_amount_cents, payment_currency,
  payment_processor, cta_label, cta_url,
  ai_generated, next_reminder_at
) VALUES (
  ?, ?, ?, ?,
  ?, ?, ?, ?,           -- slug = crypto.randomUUID().slice(0,8)
  'draft', ?, ?, ?,
  1, ?, 'usd',
  'stripe', 'Schedule Kickoff Call', ?,
  1, strftime('%s','now','+3 days')
)
```

### Send a proposal

```ts
UPDATE crm_proposals SET
  status = 'sent',
  sent_at = strftime('%s','now'),
  payment_url = ?,              -- Stripe/Paddle checkout URL
  payment_url_expires_at = strftime('%s','now','+24 hours'),
  updated_at = strftime('%s','now')
WHERE id = ?

// Log activity
INSERT INTO crm_activities (id, profile_id, contact_id, type, direction, sender, subject, body, metadata, approval_status)
VALUES (?, ?, ?, 'email', 'outbound', 'agent', 'Proposal sent', ?, '{"proposal_id":"?"}', 'auto_sent')
```

### Show proposals

```ts
"Show all sent proposals"
→ SELECT p.*, c.first_name, c.last_name FROM crm_proposals p
  JOIN crm_contacts c ON c.id = p.contact_id
  WHERE p.profile_id = ? AND p.status = 'sent'
  ORDER BY p.sent_at DESC

"Show proposals awaiting signature"
→ WHERE p.status IN ('sent','viewed')

"Show paid proposals"
→ WHERE p.status = 'paid'
```

---

## Invoices

### Create an invoice

```ts
// 1. Get next invoice number
UPDATE settings SET invoice_sequence = invoice_sequence + 1;
SELECT invoice_sequence FROM settings LIMIT 1;
// format as INV-0001 (padded to 4 digits)

INSERT INTO crm_invoices (
  id, profile_id, contact_id, deal_id, proposal_id,
  invoice_number, public_slug, status,
  client_name, client_email, client_company,
  line_items, subtotal_cents, total_cents, currency,
  issued_at, due_at, next_reminder_at, memo
) VALUES (
  ?, ?, ?, ?, ?,
  ?, ?, 'draft',
  ?, ?, ?,
  ?, ?, ?, 'usd',
  strftime('%s','now'), strftime('%s','now','+30 days'),
  strftime('%s','now','+3 days'), ?
)
```

---

## Groups

### Create a group

```ts
INSERT INTO crm_groups (id, profile_id, name, icon, color)
VALUES (?, ?, 'Investors', '🤑', '#22c55e')
```

### Add contact to group

```ts
// Read existing groups
SELECT groups FROM crm_contacts WHERE id = ?
// Append group ID to JSON array
UPDATE crm_contacts SET
  groups = json_insert(groups, '$[#]', 'grp_005'),
  updated_at = strftime('%s','now')
WHERE id = ?

// Increment group counter
UPDATE crm_groups SET contact_count = contact_count + 1 WHERE id = 'grp_005'
```

### List contacts in group

```ts
SELECT * FROM crm_contacts
WHERE profile_id = ?
  AND groups LIKE '%grp_005%'
  AND archived = 0
ORDER BY lead_score DESC
```

---

## Analytics

### Read analytics (instant — always current)

```ts
SELECT * FROM crm_analytics WHERE profile_id = ? LIMIT 1
```

Returns:

- `total_contacts`, `total_leads`, `total_customers` — contact funnel
- `open_deals`, `won_deals`, `total_deal_value_cents` — deal pipeline
- `forecast_this_month_cents`, `forecast_next_month_cents` — weighted forecast
- `total_agent_actions`, `total_pending_approvals` — agent metrics
- `total_replies`, `reply_rate_pct` — outreach performance

### Drift recovery (if analytics look wrong)

```ts
// Run CRM_ANALYTICS_RESYNC_SQL from crm.ts
// Or POST /api/crm/resync
```

---

## Context API (Sondex equivalent)

Before every agent action on a contact, pull full context in one query:

```ts
const [contact, activities, tasks, deals] = await Promise.all([
  db.execute({ sql: `SELECT * FROM crm_contacts WHERE id = ?`, args: [contactId] }),
  db.execute({
    sql: `SELECT type, sender, direction, body, subject, occurred_at, searchable_context
          FROM crm_activities WHERE contact_id = ?
          ORDER BY occurred_at DESC LIMIT 20`,
    args: [contactId]
  }),
  db.execute({
    sql: `SELECT title, due_at, priority FROM crm_tasks
          WHERE contact_id = ? AND status = 'open'
          ORDER BY due_at ASC LIMIT 5`,
    args: [contactId]
  }),
  db.execute({
    sql: `SELECT title, stage, value_cents, probability FROM crm_deals
          WHERE contact_id = ? AND stage NOT IN ('won','lost')`,
    args: [contactId]
  })
])

// Build context for LLM
const context = {
  contact: contact.rows[0],
  recent_activities: activities.rows,
  open_tasks: tasks.rows,
  open_deals: deals.rows,
  agent_context: JSON.parse(contact.rows[0].agent_context || '{}'),
  agent_instructions: contact.rows[0].agent_instructions,
  auto_approve: contact.rows[0].auto_approve
}
```

---

## Agent Rules

1. **Always check `agent_paused`** before acting on a contact
2. **Always check `agent_instructions`** for per-contact overrides
3. **Always read context** before drafting (last 20 activities via `searchable_context`)
4. **Always set `sender` + `direction`** on activity insert (triggers depend on these)
5. **Always set `status`** on contact insert (trigger branches on this)
6. **Always update `last_activity_at`** on contact after activity insert
7. **Use `pending_approval`** unless `contact.auto_approve = 1`
8. **Use `auto_sent`** when `contact.auto_approve = 1` or you manually triggered it
9. **Never edit `crm_activities`** — append only, insert new rows
10. **Use `searchable_context`** for plain text summaries — avoids JSON parse on every query

---

## Connecting CRM to other tables

```ts
// Contact → Purchases (by email)
SELECT * FROM purchases WHERE email = ? ORDER BY created_at DESC

// Contact → Subscribers (by email)
SELECT * FROM subscribers WHERE email = ?

// Contact → Form submissions (by email match)
SELECT * FROM submissions WHERE answers LIKE '%' || ? || '%' LIMIT 10

// Contact → Community member (by user_id)
SELECT * FROM community_members WHERE user_id = ?

// All cross-table joins use email or user_id as the bridge
// user_id is identical in Central DB and UserDB (same ID, generated once)
```
