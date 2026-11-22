# Claude Code Configuration for BusinessKit

Always read and follow [AGENTS.md](./AGENTS.md) for operating rules, safety invariants, and tool usage.

## Setup
To connect Claude Code to your BusinessKit desktop app:
1. Ensure the BusinessKit app is installed and signed in.
2. Run `./scripts/setup.sh` to generate `.mcp.json`.
3. Launch Claude Code: `claude`

## Core Invariants
- Use BusinessKit MCP tools (`mcp__businesskit__*` or bare tool names). Never write raw SQL.
- Draft customer communications and invoices; do not send autonomously.
- Save exports and deliverables into `./output/`.
