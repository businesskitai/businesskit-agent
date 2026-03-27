# /deep — Deep Mode

Activates multi-step autonomous planning. CEO takes control and delegates to the full agent team.

## What happens

1. Read `progress.md` via `readProgress()` — understand what was done last session
2. CEO calls `analyticsAgent.snapshot()` — get current state of the business
3. CEO writes a structured todo plan based on: open items from progress.md + analytics gaps + user's request
4. Execute each todo by delegating to the right agent:
   - Content → Blog Writer, Newsletter Writer, Course Creator, Store Manager
   - Distribution → Social Agent, Newsletter Writer
   - Intelligence → Analytics Agent, SEO Agent
   - Pipeline → COO (publish queue), Scheduler
5. After each completed action: `logAction(description)` to update progress.md
6. At end of session: `setOpenItems([...])` to record what's left for next time

## Todo format

```
[ ] Read analytics + progress summary (CEO)
[ ] Fix 3 posts missing SEO excerpts (SEO Agent)
[ ] Draft blog post: "Email Marketing Tips" (Blog Writer)
[ ] Audit all live products for copy quality (Copywriter)
[ ] Schedule drafted post for Monday 9am (COO)
[ ] Post product launch to LinkedIn + X (Social Agent)
```

## Delegation pattern

CEO delegates to sub-agents with focused context — not the full history.
Each sub-agent gets: the task description + just what it needs (brand context, relevant data).
Results come back to CEO, logged to progress.md, todo marked complete.

## Ask user when

- Approval needed before publishing or sending
- Ambiguous brief ("write a post about our product" — which product?)
- Price or schedule decision needed
- Something unexpected found in analytics

## Harness mode

For structured workflows (publish post, launch product, send newsletter) activate the harness:

- `/blog-writer publish` → enforced 7-phase publish harness
- `/store-manager launch` → enforced 7-phase launch harness
- `/newsletter-writer send` → enforced 5-phase send harness

See PRD-Agent-Harness.md for full harness architecture.
