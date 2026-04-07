---
description: Restore context from last session log and agent memory
---

# /resume — Resume Last Session

Reload context at the start of a new session. Run this first.

## Steps

1. Load agent memory from Turso:

   ```ts
   import { sessionContext } from './lib/memory.ts'
   const { memory, skills } = await sessionContext()
   ```

2. Find the most recent session log:

   ```
   CC-Session-Logs/
   ```

   Read the most recent file (by date in filename).
   Load ONLY the Summary section (everything above "---\nRaw Session Log").
   Never load the raw log — it wastes tokens.

3. If user specifies a topic:

   ```
   /resume api-auth-refactor
   ```

   Find the log file matching that topic slug.

4. Display the restored context:

   ```
   ══════════════════════════════════════════════
   RESUMING: [topic]
   ══════════════════════════════════════════════
   LAST SESSION: [date]

   [Summary content]

   RECENT MEMORY:
   [last 5 agent_memory entries]

   READY. What would you like to continue?
   ```

5. If no session logs exist, read memory.md preferences section and agent_memory.

## Folder structure

```
businesskit-agent/
├── CC-Session-Logs/          ← session logs live here (gitignored)
│   ├── 2026-04-07-09-00-crm-outreach.md
│   ├── 2026-04-06-14-30-blog-seo-audit.md
│   └── ...
└── memory.md                 ← preferences (always loaded)
```

## Add CC-Session-Logs/ to .gitignore

Session logs are local only — they contain session-specific context, not committed.
