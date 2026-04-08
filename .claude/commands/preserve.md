---
description: Save current session state to memory before context fills up
---

# /preserve — Preserve Session

Save session state to CC-Session-Logs/. Run before context gets full — not after.
Uses the same structured format as /compress for consistency.

## Steps

1. Infer from conversation (don't ask unless genuinely ambiguous):
   - What was the goal?
   - What did we accomplish?
   - What decisions were made?
   - What's next?

2. Generate topic slug from the work done: `crm-outreach-2026-04` `blog-seo-audit` etc

3. Write to `CC-Session-Logs/YYYY-MM-DD-HH-MM-[topic].md`:

```markdown
# [topic]
Date: [ISO timestamp]
Agent: [agent that was running]

## Goal
[1-2 sentences — what were we doing]

## Constraints & Preferences
- [any user preferences stated this session]

## Progress
### Done
- [list every agent action: table written, post published, contact added]
- Include IDs where possible: post_id: 01JXX, contact_id: 01JYY

### In Progress
- [anything not finished]

## Next Steps
1. [specific next action]
2. [second]

## Files Changed
- [file path]: [what changed]
```

1. Log to agent_memory AND update memory.md preferences section if user stated any:

   ```ts
   await logMemory('session', 'Preserved: [topic]', { file: 'CC-Session-Logs/...' })
   ```

2. Tell user: "Preserved to [filename]. Safe to run /compact now."

## When to run /preserve

- Context bar approaching 70%
- Before switching to a different task
- After any significant batch of work
- Before ending a session

Run /compact AFTER /preserve, never before.
