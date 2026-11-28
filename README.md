# BusinessKit MCP Server & Agent Kit

The official **Model Context Protocol (MCP)** server and autonomous agent toolbelt for **BusinessKit**. Operate, manage, and automate your business from any MCP-compatible AI client—including **Claude Desktop**, **Claude Code**, **Cursor**, **Antigravity**, **OpenAI Codex**, **VS Code**, and **Glama**.

[![npm version](https://img.shields.io/npm/v/@businesskit/agent.svg)](https://www.npmjs.com/package/@businesskit/agent)
[![MCP Compatible](https://img.shields.io/badge/MCP-2024--11--05-blue.svg)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Two Connection Modes

### Mode 1: With BusinessKit App (macOS, Windows, Linux) — Zero Config
If the BusinessKit desktop app is installed on your machine, **you do not need a `.env` file**. Run the universal setup:

```bash
npx @businesskit/agent setup
# or: npm run setup
```

The setup wizard automatically locates the installed app binary, connects to your active organization profile, and pairs with your agent environment with zero manual configuration.

---

### Mode 2: Standalone / Cloud / Headless (No App Required)
Run anywhere Node.js is available (remote server, VPS, Glama, Docker, or machine without the desktop app):

1. **Configure `.env`** (see [`.env.example`](./.env.example)):
   ```env
   TURSO_DATABASE_URL=libsql://your-database.turso.io
   TURSO_AUTH_TOKEN=your-turso-auth-token
   ```

2. **Read-Only Mode Option**:
   To grant your AI agent safe read-only access (query inventory, check stock, inspect pages, and read CMS content without permitting writes), supply a read-only token instead:
   ```env
   TURSO_DATABASE_URL=libsql://your-database.turso.io
   TURSO_READ_ONLY_TOKEN=your-read-only-token
   ```

> **Note**: Tool discovery (`initialize` and `tools/list`) succeeds out-of-the-box even before `.env` is configured, allowing MCP registries (Glama, Smithery) and IDE clients to inspect schemas immediately.

---

## MCP Client Configuration

#### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "businesskit": {
      "command": "npx",
      "args": ["-y", "@businesskit/agent"],
      "env": {
        "TURSO_DATABASE_URL": "libsql://your-database.turso.io",
        "TURSO_AUTH_TOKEN": "your-turso-auth-token"
      }
    }
  }
}
```

#### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "businesskit": {
      "command": "npx",
      "args": ["-y", "@businesskit/agent"],
      "env": {
        "TURSO_DATABASE_URL": "libsql://your-database.turso.io",
        "TURSO_AUTH_TOKEN": "your-turso-auth-token"
      }
    }
  }
}
```

#### Claude Code
```bash
claude mcp add businesskit npx -y @businesskit/agent
```

#### Antigravity / Gemini CLI (`.gemini/mcp_config.json`)
```json
{
  "mcpServers": {
    "businesskit": {
      "command": "npx",
      "args": ["-y", "@businesskit/agent"],
      "env": {
        "TURSO_DATABASE_URL": "libsql://your-database.turso.io",
        "TURSO_AUTH_TOKEN": "your-turso-auth-token"
      }
    }
  }
}
```

---

## Documentation & References

Capabilities and workflows are organized in modular reference files:

- **Agent Operating Rules & Directives**: [`AGENTS.md`](./AGENTS.md) — Multi-profile operations, ledger invariants, and draft-first safeguards.
- **Workflow Skills**: [`skills/`](./skills/)
  - [`skills/billing/SKILL.md`](./skills/billing/SKILL.md) — POS bills, B2B invoices, and payment tracking.
  - [`skills/inventory/SKILL.md`](./skills/inventory/SKILL.md) — Stock levels, purchase invoices, and price lists.
  - [`skills/cms/SKILL.md`](./skills/cms/SKILL.md) — Multi-hub CMS publishing (Blog, Newsletter, Guides, Notes).
  - [`skills/pages/SKILL.md`](./skills/pages/SKILL.md) — Visual site builder, section schemas, and custom components.
  - [`skills/crm/SKILL.md`](./skills/crm/SKILL.md) — Contact cards, lead tracking, and tags.
  - [`skills/inbox/SKILL.md`](./skills/inbox/SKILL.md) — Thread triage, 2FA OTP code extraction, and reply drafting.
  - [`skills/domains/SKILL.md`](./skills/domains/SKILL.md) — Expiry horizons and renewal reminders.
- **Universal Slash Commands**: [`commands/`](./commands/) — 23 ready-to-run agent commands (`/create-new-bill`, `/write-docs`, `/create-page`, `/add-inventory-from-invoice`, etc.).
- **MCP Server Source**: [`src/server.ts`](./src/server.ts) and [`src/tools/`](./src/tools/) — Typed tool implementations and schemas.

---

## Updating

Update the local agent workspace to the latest release while keeping your custom `context/`, `memory/`, and custom skills intact:

```bash
npx @businesskit/agent update
# or inside agent chat:
/update-agent
```

- If you have a big idea you'd like us to consider, feel free to [open a discussion](https://github.com/businesskitai/businesskit-agent/discussions) about it.

---

## License

[MIT](LICENSE) © BusinessKit AI
