---
description: Compress session context into a structured log before /compact
---

# /compress — Compress and Save Session

Save what matters before running /compact. Uses pi's proven compaction format.

## Steps

1. Ask the user what to keep (or infer from conversation):

   ```
   What should I save? (numbers, comma-separated — or 'all')
   1. Goal and what we were trying to accomplish
   2. Decisions made and why
   3. Agent actions taken (posts published, contacts added, etc)
   4. Files or DB rows changed
   5. Next steps
   6. Open questions
   ```

2. Ask: "Anything specific to highlight? (or 'skip')"

3. Suggest a topic from the conversation: "Suggested: [slug]. Accept or rename:"

4. Write to `CC-Session-Logs/YYYY-MM-DD-HH-MM-[topic].md`:

```markdown
# [topic]
Date: [ISO timestamp]
Agent: [which agent was active]

## Goal
[What we were trying to accomplish — 1-2 sentences]

## Constraints & Preferences
- [user said: always/never do X]
- [preference discovered this session]

## Progress
### Done
- [specific action with IDs or file paths]
- [DB writes: table, id, what changed]

### In Progress
- [anything mid-way]

## Next Steps
1. [most important — be specific]
2. [second]

## Open Questions
- [unresolved]

---
Raw Log
[optional: paste key exchanges for searchability]
```

1. Log to agent_memory:

   ```ts
   import { logMemory } from './lib/memory.ts'
   await logMemory('session', 'Compressed: [topic]', { file: 'CC-Session-Logs/...' })
   ```

2. Tell user: "Saved to [filename]. Run /compact now."

## Key rule

/resume reads ONLY the sections above "---\nRaw Log" — make them dense and actionable.
Raw log is for search, never loaded into context.
