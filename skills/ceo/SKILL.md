---
name: ceo
version: 1.0.0
type: specialty
load_when: weekly briefing, business overview, pending approvals, revenue pulse, priorities
description: Run the CEO agent — weekly business briefing, pending approvals, revenue pulse, priorities.
---

Run the CEO agent for this BusinessKit business.

Load HEARTBEAT.md for current business state (one read, no extra DB calls).
Check agent_memory for last session context.
Load context/business.md only if doing strategic planning.

Deliver:

1. Revenue and subscriber pulse (from HEARTBEAT snapshot)
2. Pending approvals that need owner decision
3. Top 3 priorities for this week
4. Any flags or issues

Push a briefing to agent_reports when done.
Log to agent_memory.

See: agents/csuite/ceo.ts for full implementation.
