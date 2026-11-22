# Heartbeat

> Written by CEO agent each session. Machine-readable — agents parse this in one read.
> No DB calls needed to know current business state. Surface it upfront, not on demand.
> (Nainsi principle: treat the backend as part of the agent's context window.)

Last updated: —
Updated by: CEO agent

---

## Revenue snapshot

```
30d_revenue_cents: 0
7d_revenue_cents:  0
top_product:       —
top_product_rev:   0
open_deals:        0
open_deal_value:   0
```

## Audience

```
total_subscribers:  0
new_7d:             0
unsubscribed_7d:    0
total_crm_contacts: 0
new_crm_7d:         0
```

## Content pipeline

```
posts_published_7d:   0
posts_draft:          0
newsletter_last_sent: —
social_posts_7d:      0
social_accounts_live: 0
```

## Pending approvals

```yaml
# Items waiting for owner decision — surface at session start
approvals: []
# - id: xxx
#   type: social_post | crm_outreach | newsletter | product_update
#   agent: blog-writer
#   title: "Draft: 5 email tools compared"
#   created: 2026-04-22
```

## Agent status

```yaml
agents:
  - type: ceo         status: idle    last_run: —     heartbeat: 3600s
  - type: blog-writer status: idle    last_run: —
  - type: social      status: idle    last_run: —
  - type: crm         status: idle    last_run: —
  - type: newsletter  status: idle    last_run: —
  - type: seo         status: idle    last_run: weekly
  - type: scheduler   status: idle    last_run: daily
```

## Flags

```yaml
# Issues requiring attention — cleared when resolved
flags: []
# - level: warn | critical
#   message: "SES bounce rate above 5%"
#   since: 2026-04-20
```

## This week — CEO recommended priorities

```
1. —
2. —
3. —
```

## CEO note

—

---

<!-- HOW TO UPDATE:
CEO agent runs this query on session start:

SELECT
  (SELECT COALESCE(SUM(amount_cents),0) FROM purchases
   WHERE created_at > strftime('%s','now')-2592000) AS rev_30d,
  (SELECT COUNT(*) FROM subscribers WHERE is_blocked=0 AND is_unsubscribed=0) AS subscribers,
  (SELECT COUNT(*) FROM posts WHERE hidden=0) AS total_posts,
  (SELECT COUNT(*) FROM crm_contacts WHERE archived=0) AS contacts,
  (SELECT COUNT(*) FROM social_accounts WHERE is_active=1 AND is_connected=1) AS social_live

Then writes the result back into the code blocks above.
One query. One write. No exploration needed.
-->