# /coo — COO Pipeline & Scheduling

1. `coo.draftPipeline()` -> show all drafts across every content type
2. `coo.publishQueue()` -> preview content due to go live right now
3. Ask: run the queue? -> `coo.runPublishQueue()` -> flips published=1, notifies n8n
4. Ask: schedule something? -> `coo.schedule(table, id, new Date('...'))`

Pipeline view groups by type: blog posts, products, pages, jobs, forms.
Shows: title, scheduled date, how long it's been a draft.

Handoff: content needs edits before publish -> route to the right creator agent.
