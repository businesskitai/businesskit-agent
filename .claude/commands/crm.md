# /crm — Agent-First CRM

Manages contacts, deals, outreach pipeline, tasks, and activities.
Reads/writes `crm_contacts`, `crm_deals`, `crm_activities`, `crm_tasks` in Turso.

## Session start
1. `crmAgent.pipelineSummary()` — funnel stats, pending approvals, follow-ups due
2. `crmAgent.hotLeads(10)` — top scored leads ready for outreach

## Contacts
```
"Add a lead: John Smith, LinkedIn @johnsmith, founder at Acme"
→ crmAgent.createContact({ first_name, last_name, platform, platform_username, company })

"Show my top leads"
→ crmAgent.listContacts({ order_by: 'lead_score', limit: 20 })

"Show leads ready for outreach"
→ crmAgent.listContacts({ agent_status: 'outreach_ready' })

"Show who replied"
→ crmAgent.listContacts({ outreach_status: 'replied' })
```

## Enrichment + Scoring
```
"Score this lead"
→ crmAgent.scoreContact(id, score, reason, icpMatch)

"Enrich with research"
→ crmAgent.enrichContact(id, { pain_point, industry, company_size, audience_size })
```

## Outreach
```
"Draft a DM for this lead"
→ crmAgent.draftDM(id, message)
  → stores in suggested_dm
  → creates crm_activity with approval_status='pending' (or 'auto_sent' if auto_approve=1)

"Draft a cold email"
→ crmAgent.draftEmail(id, subject, body)

"Mark DM as sent"
→ crmAgent.markDMSent(id)

"They replied positively"
→ crmAgent.logReply(id, 'dm', content, 'positive')
```

## Deals
```
"Create a deal: $5,000 consulting project"
→ crmAgent.createDeal(contactId, { title, value_cents: 500000 })

"Move deal to proposal stage"
→ crmAgent.updateDealStage(dealId, 'proposal')

"Show my pipeline"
→ crmAgent.listDeals()
```

## Tasks
```
"Remind me to follow up with John next Monday"
→ crmAgent.createTask({ title, contact_id, due_at: unixTimestamp, priority: 'high' })

"What tasks are due today?"
→ crmAgent.listTasks({ due_today: true })

"Mark task done"
→ crmAgent.completeTask(taskId)
```

## Approval flow
Activities with `approval_status='pending'` need user review before sending.
Show pending items at session start: `pipelineSummary().pendingApprovals`
After user confirms → `markDMSent()` or `markEmailSent()`

## Agent memory per contact
Each contact has `agent_context` JSON blob — the agent's scratchpad.
Update after research: `crmAgent.updateAgentContext(id, { researched_at, notes, next_action })`