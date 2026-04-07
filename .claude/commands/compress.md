---
description: Compress session context into a structured log with user-selected items
---

# /compress — Compress and Log Session

Interactive session compression. Saves key items before running /compact.

## Steps

1. Show the user a multi-select checklist:

   ```
   What should I preserve? (type numbers, comma-separated)
   1. Key learnings and discoveries
   2. Solutions and fixes applied
   3. Decisions made and their rationale
   4. Files created or modified
   5. Agent actions taken (DB writes, publishes, etc)
   6. Next steps and open items
   ```

2. Ask: "Anything specific to highlight? (or type 'skip')"

3. Suggest a topic slug from the conversation:
   "Suggested topic: [slug]. Accept or type your own:"

4. Write the log to:

   ```
   CC-Session-Logs/YYYY-MM-DD-HH-MM-[topic].md
   ```

   Only include sections the user selected.
   Always include Summary (used by /resume).

5. Log to agent_memory:

   ```ts
   import { logMemory } from './lib/memory.ts'
   await logMemory('session', 'Compressed: [topic]', { log_file: filename })
   ```

6. Tell user: "Saved to [filename]. Run /compact to compress context."

## Key rule

/resume reads ONLY the Summary section by default — keep it dense and actionable.
Raw session log is there for searchability, never wastes tokens on load.
