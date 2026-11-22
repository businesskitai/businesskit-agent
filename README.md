# BusinessKit Agent

The universal autonomous agent workspace for **BusinessKit**. Operate, manage, and automate your entire business from any AI assistant or coding agent—including **Claude Code**, **Cursor**, **Antigravity**, **VS Code Copilot**, and **Gemini CLI**.

---

## What is BusinessKit Agent?

BusinessKit Agent connects your favorite AI agent directly to your local BusinessKit desktop app through the **Model Context Protocol (MCP)**. 

Instead of switching back and forth between apps and forms, your AI assistant can execute real business operations on your behalf:
- **Billing & POS**: Create walk-in POS receipts, parse handwritten bills, and draft formal customer invoices.
- **Inventory & Purchasing**: Scan supplier purchase invoices, automatically restock items, update moving average cost, and adjust inventory.
- **Website & Landing Pages**: Assemble responsive landing pages with native modular sections or create bespoke custom components.
- **Docs & Publishing**: Write and publish technical documentation, guides, newsletters, and SEO-optimized blog posts.
- **CRM & Contacts**: Register and organize clients, suppliers, and leads with tags and contact info.
- **Support Inbox**: Triage customer threads, extract 2FA verification codes, and draft email replies.

---

## How It Works

```
AI Assistant / IDE
(Claude Code / Cursor / Antigravity / VS Code)
  │
  ├─ Reads Universal Commands & Skills (`commands/` & `skills/`)
  │    └─ Editorial rules, page layouts, accounting workflows
  │
  └─ Calls BusinessKit MCP Server (`businesskit --mcp --profile <id>`)
       │
       └─ Native BusinessKit Engine
            ├─ Automatic double-entry ledger balancing (`fin_journal_entries`)
            ├─ Append-only stock & customer credit ledgers
            ├─ Isolated local profile database
            └─ Zero credential exposure (keys stay in OS Keychain)
```

All business logic, financial ledger balancing, inventory calculations, and database operations are executed safely inside the native BusinessKit engine. Your database credentials never leak into LLM prompts.

---

## Quick Start

### Option A: Install via Agent CLI / Marketplace

**Claude Code**:
```bash
claude plugin add https://github.com/businesskitai/businesskit-agent
```

**Antigravity / Gemini CLI**:
```bash
agy plugin install https://github.com/businesskitai/businesskit-agent
```

**SuperConsole AI**:
In SuperConsole, go to **Customize** → **Plugins** → **Add from URL** and paste:
```
https://github.com/businesskitai/businesskit-agent/blob/main/.superconsole-plugin/plugin.json
```

### Option B: Run Universal Setup (All IDEs & Agents)
From inside this directory:
```bash
./bin/businesskit.js
# or: npx @businesskit/agent
# or: npm run setup
```

The setup script automatically:
1. Detects your installed BusinessKit app (`/Applications/BusinessKit.app` on macOS, or build binary).
2. Connects to your active organization profile.
3. Configures your agent environment:
   - **Claude Code**: generates `.mcp.json` and `.claude/commands`
   - **Cursor**: generates `.cursor/mcp.json` and `.cursorrules`
   - **Antigravity / Gemini CLI**: registers via `agy mcp add` / `.gemini/mcp_config.json`
   - **VS Code**: generates `.vscode/mcp.json`

---

## Using With Your Agent

### Claude Code
Open your terminal in this repository and start Claude:
```bash
claude
```
Type any slash command directly:
```bash
/write-docs "Getting Started"
/create-page "About Us"
/create-new-bill 5 Box Tellzy 40 Tab @ ₹1258.83 -15%
```

### Antigravity & Gemini CLI
Install the plugin directly:
```bash
agy plugin install https://github.com/businesskitai/businesskit-agent
```
Antigravity automatically discovers `plugin.json`, `rules/AGENTS.md`, `mcp_config.json`, and `skills/`.
You can use natural language or slash triggers:
- *"Draft a customer invoice for Acme Corp with 10 units of consulting"*
- `/write-docs "Pages Architecture"`
- *"Restock items from this supplier bill"*

### Cursor
Open this folder in Cursor (`cursor .`). Cursor detects `.cursorrules` and `.cursor/mcp.json`. Use natural language or slash commands with the agent:
- *"Create a landing page for our Black Friday Sale with hero, features, and pricing"*
- *"Check stock levels for Tellzy 40"*

### SuperConsole AI
In SuperConsole:
1. Navigate to **Customize** → **Plugins**.
2. Click **Add from GitHub URL**.
3. Paste:
   ```
   https://github.com/businesskitai/businesskit-agent/blob/main/.superconsole-plugin/plugin.json
   ```
4. Click **Install**. All skills and commands are activated.

---

## Universal Commands (`commands/`)

All 23 universal commands match the BusinessKit in-app commands 1:1:

| Domain | Command | Description |
| :--- | :--- | :--- |
| **Docs & CMS** | `/write-docs` | Write structured documentation or knowledge base articles (`cat_32`) |
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

## Workflow Skills (`skills/`)

- [`skills/cms/SKILL.md`](./skills/cms/SKILL.md) — Universal CMS publishing (Blog, Newsletter, Guides, Notes, custom hubs) with [`references/html-blocks.md`](./skills/cms/references/html-blocks.md).
- [`skills/docs/SKILL.md`](./skills/docs/SKILL.md) — Technical documentation and knowledge base hierarchy (`cat_32`) with [`references/how-to.md`](./skills/docs/references/how-to.md).
- [`skills/pages/SKILL.md`](./skills/pages/SKILL.md) — Visual site builder, section schemas, and custom HTML/CSS components (with `references/sections-catalog.json`).
- [`skills/billing/SKILL.md`](./skills/billing/SKILL.md) — POS bills, B2B invoices, and payment tracking.
- [`skills/inventory/SKILL.md`](./skills/inventory/SKILL.md) — Stock levels, purchase invoices, and price lists.
- [`skills/crm/SKILL.md`](./skills/crm/SKILL.md) — Contacts, leads, and customer tags.
- [`skills/inbox/SKILL.md`](./skills/inbox/SKILL.md) — Triage, 2FA code extraction, and reply drafting.
- [`skills/brand/SKILL.md`](./skills/brand/SKILL.md) — Brand identity, voice guidelines, and store context.
- [`skills/humanizer/SKILL.md`](./skills/humanizer/SKILL.md) — De-AI writing patterns and voice polishing.
- [`skills/copywriting/SKILL.md`](./skills/copywriting/SKILL.md) — High-converting sales page copywriting.
- [`skills/social/SKILL.md`](./skills/social/SKILL.md) — Multi-platform social copy and threads.

---

## Operating Principles

1. **Native Engine Execution**: All operations run through verified BusinessKit tools with atomic database transactions.
2. **Drafts First**: External communications, customer invoices, and emails are prepared as drafts for human review before transmission.
3. **Structured Outputs**: All deliverables, exports, and generated files are organized in `./output/`.
