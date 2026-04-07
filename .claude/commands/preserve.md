---
description: Save current session state to memory and log file
---

# /preserve — Save Session State

Save what happened this session before context fills up.

## Steps

1. Ask the user (or infer from conversation):
   - What was accomplished?
   - What files were created or modified?
   - What decisions were made and why?
   - What's still in progress or blocked?
   - What should happen next session?

2. Write a session log file:

   ```
   CC-Session-Logs/YYYY-MM-DD-HH-MM-topic.md
   ```

   Format:

   ```markdown
   # Session: [topic]
   Date: [ISO timestamp]
   Agent: [which agent was active]

   ## Summary
   [2-3 sentences — loaded by /resume, must be dense and actionable]

   ## Accomplished
   - [specific thing done with file paths or IDs]

   ## Decisions Made
   - [decision]: [reason]

   ## Files Changed
   - [file path]: [what changed]

   ## Next Steps
   1. [most important next action]
   2. [second action]

   ## Open Questions
   - [anything unresolved]

   ---
   Raw Session Log
   [paste key exchanges here if useful for search]
   ```

3. Log to agent_memory:

   ```ts
   import { logMemory } from './lib/memory.ts'
   await logMemory('session', 'Preserved session: [topic]', { log_file: 'CC-Session-Logs/...' })
   ```

4. Tell the user: "Session preserved to CC-Session-Logs/[filename]. Run /resume next session to reload context."

## Note

Run `/compact` after `/preserve` to compress the context window.
/preserve saves BEFORE compact so nothing is lost.
