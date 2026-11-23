---
id: "cmd_update_agent"
name: "Update BusinessKit Agent"
slash: "/update-agent"
description: "Safely updates BusinessKit Agent to the latest upstream release while preserving user context, memory, and custom skills"
domain_tags: ["system", "maintenance"]
required_tools: []
---

# Update BusinessKit Agent (`/update-agent`)

Fetches the latest skills, declarative slash commands, and rules from the canonical [businesskit-agent](https://github.com/businesskitai/businesskit-agent) repository, updating your workspace without removing your personalized business/brand context, memory logs, or custom skills.

## Accepted Arguments
- `/update-agent`
- `/update`

## How it works
1. **Preserves Custom Context**: Snapshots `context/*.md` (`business.md`, `brand.md`, `brand-voice.md`) in memory before updating.
2. **Pulls Latest Release**: Pulls the latest commits/tags from `https://github.com/businesskitai/businesskit-agent`.
3. **Preserves Custom Skills**: Any untracked custom skills (e.g. `skills/my-skill/`) or custom commands (`commands/my-command.md`) are strictly untouched.
4. **Restores User Context**: Restores your business details and tone settings.
5. **Refreshes Config**: Regenerates `.mcp.json`, `.cursor/`, and `.gemini/` configurations.

## Terminal Command
You can also run this command directly in your terminal at any time:
```bash
npm run update
# or
npx @businesskit/agent update
# or
./scripts/update.sh
```
