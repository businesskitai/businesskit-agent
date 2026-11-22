# Gemini CLI & Antigravity Configuration for BusinessKit

Always read and follow [AGENTS.md](./AGENTS.md) for operating rules, safety invariants, and tool usage.

## Setup
To connect Antigravity / Gemini CLI to your BusinessKit desktop app:
1. Ensure the BusinessKit app is installed and signed in.
2. Run `./scripts/setup.sh` (or `agy mcp add businesskit ...`).
3. Launch your assistant.

## Core Invariants
- Use BusinessKit MCP tools (`system_get_capabilities`, `shop_create_new_bill`, `blog_post_create`, etc.).
- Never attempt direct SQL writes into Turso DB.
- Save exports and deliverables into `./output/`.
