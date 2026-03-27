# /scheduler — Scheduler Jobs

1. `scheduler.hourly()` -> run publish queue for content due now
2. Show list to user. Confirm before proceeding.
3. Use `scheduler.daily()` for pipeline health and `scheduler.weekly()` for CEO briefing delivery.
4. Show: what was published and job status.

Direct COO methods (advanced): `coo.draftPipeline()`, `coo.schedule('posts', id, new Date('2026-04-01T09:00:00Z'))`
