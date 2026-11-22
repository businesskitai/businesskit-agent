# BusinessKit Agent: Universal Agent Workspace

Run and operate your entire business from **any agentic CLI or IDE** (Antigravity, Cursor, Claude Code, VS Code Copilot, Gemini CLI, or Codex) using BusinessKit's native Model Context Protocol (MCP) toolbelt.

---

## Why Tools Mode via MCP?

Unlike prototype agent scripts that attempt raw SQL writes into Turso DB, **BusinessKit Agent** communicates directly with your BusinessKit desktop app via MCP (`businesskit --mcp --profile <id>`):

- **Double-Entry Guarantees**: Debits and credits are balanced automatically in `fin_journal_entries`.
- **Append-Only Ledgers**: Physical stock, customer credit (udhar), and loyalty ledgers cannot be corrupted by raw SQL.
- **Credential Protection**: Database tokens never enter the LLM's context window. Credentials stay secured in the OS Keychain and native Rust binary.
- **Prompt Injection Defense**: Incoming emails, customer notes, and webhooks are screened before reaching the agent.

---

## Quick Start (1 Command)

### Run Setup
From inside this directory:
```bash
./bin/businesskit.js
# or: npm run setup
```

The setup script automatically:
1. Detects your installed BusinessKit app (`/Applications/BusinessKit.app` on macOS, or build binary).
2. Connects to your active organization profile (e.g. `4628a5b1-ac05-4156-9d76-04bbd71119a1`).
3. Generates the exact configuration for your agent environment:
   - **Antigravity / Gemini CLI**: registers via `agy mcp add` / `.gemini/mcp_config.json`
   - **Cursor**: generates `.cursor/mcp.json` and `.cursorrules`
   - **Claude Code**: generates `.mcp.json` and `.claude/commands`
   - **VS Code**: generates `.vscode/mcp.json`

---

## Using With Your Favorite Agent

### 1. Claude Code
Open your terminal in this repository:
```bash
claude
```
Claude Code reads `CLAUDE.md`, `.mcp.json`, and `.claude/commands/`. You can invoke commands directly with `/`:
```bash
/write-docs "Getting Started"
/create-page "About Us"
/create-new-bill 5 Box Tellzy 40 Tab @ ₹1258.83 -15%
```

### 2. Antigravity & Gemini CLI
Antigravity connects via the registered `businesskit` MCP server and reads `AGENTS.md`, `commands/`, and `skills/`.
> **Note on Commands in Antigravity**: While Claude Code uses `/` for terminal macro commands, Antigravity uses **intent-based chat triggers**. You can type slash commands like `/write-docs "Pages"` or simply ask in natural language (*"Write a docs article for Pages architecture"*). Antigravity matches your intent to the matching command spec in `commands/` and executes the exact MCP tool sequence.

### 3. Cursor
Open this folder in Cursor (`cursor .`). Cursor detects `.cursorrules` and `.cursor/mcp.json`. Use natural language or slash commands with the agent:
> "Draft an invoice for Acme Corp with 10 units of consulting"
> "Publish a new documentation article about Pages under category cat_32"

---

## Universal Commands Directory (`commands/`)

All 23 universal commands match the BusinessKit in-app commands 1:1:

| Domain | Command | Description |
| :--- | :--- | :--- |
| **Docs & CMS** | `/write-docs` | Write structured documentation or knowledge base article (`cat_32`) |
| | `/write-blog` | Draft or publish a blog post with clean TipTap HTML (`cat_35`) |
| | `/write-guide` | Step-by-step how-to guide with prerequisites and FAQs (`cat_36`) |
| | `/write-newsletter` | Conversational email newsletter issue with sections and CTA (`cat_20`) |
| | `/list-content` | List published and draft articles across hubs |
| | `/update-content` | Edit body HTML, metadata, collection, or publish status |
| | `/seo-audit` | Audit SEO titles, meta descriptions, and keywords |
| **Pages & Web** | `/create-page` | Assemble a complete landing page using native visual sections |
| | `/update-page` | Update sections, copy, or settings on an existing page |
| | `/publish-page` | Toggle page live/published status |
| | `/list-pages` | List all website pages and publication statuses |
| | `/create-component` | Generate a bespoke custom component in `user_components` |
| | `/list-components` | List custom components stored in `user_components` |
| **Shop & POS** | `/create-new-bill` | Immediate POS billing receipt, natural language or handwritten bill |
| | `/create-invoice` | Draft a formal itemized B2B customer invoice |
| | `/send-invoice` | Send customer invoice via email and generate payment link |
| | `/update-price` | Update retail selling price, cost, or discount floor |
| **Inventory** | `/add-inventory-from-invoice` | Scan purchase invoice to restock items and post accounting |
| | `/check-stock` | Query on-hand inventory levels and low-stock alerts |
| | `/adjust-stock` | Record damage, shrinkage, or audit count variances |
| **CRM** | `/add-contact` | Register a new client, lead, or supplier in CRM |
| | `/update-contact` | Update contact information, company, or tags |
| **System** | `/capabilities` | Discover active modules, profile settings, and tools |

---

## Declarative Skills (`skills/`)

- [`skills/docs-cms/SKILL.md`](./skills/docs-cms/SKILL.md) — Technical documentation (`cat_32`), guides, and blog articles (with `references/how-to.md`).
- [`skills/pages/SKILL.md`](./skills/pages/SKILL.md) — Visual site builder, section schemas, and custom HTML/CSS components (with `references/sections-catalog.json`).
- [`skills/billing/SKILL.md`](./skills/billing/SKILL.md) — POS bills, B2B invoices, and payment tracking.
- [`skills/inventory/SKILL.md`](./skills/inventory/SKILL.md) — Stock levels, purchase invoices, and price lists.
- [`skills/crm/SKILL.md`](./skills/crm/SKILL.md) — Contacts, leads, and customer tags.
- [`skills/inbox/SKILL.md`](./skills/inbox/SKILL.md) — Triage, 2FA code extraction, and reply drafting.
- [`skills/brand/SKILL.md`](./skills/brand/SKILL.md) — Brand identity, voice guidelines, and store context.
- [`skills/humanizer/SKILL.md`](./skills/humanizer/SKILL.md) — De-AI patterns and voice polishing.
- [`skills/copywriting/SKILL.md`](./skills/copywriting/SKILL.md) — High-converting sales page copywriting.
- [`skills/social/SKILL.md`](./skills/social/SKILL.md) — Multi-platform social copy and threads.

---

## Safety Invariants

1. **Tool-First**: Agents never write raw SQL.
2. **Drafts First**: External communications, invoices, and emails are saved as drafts. A human confirms and sends.
3. **Audit Trail**: All generated deliverables and reports are placed in `./output/`.
