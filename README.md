# BusinessKit MCP Server & Agent Kit

The official **Model Context Protocol (MCP)** server and autonomous agent toolbelt for **BusinessKit**. Operate, manage, and automate your entire business from any MCP-compatible AI client—including **Claude Desktop**, **Claude Code**, **Cursor**, **Antigravity**, **OpenAI Codex**, **VS Code**, and **Glama**.

[![npm version](https://img.shields.io/npm/v/@businesskit/agent.svg)](https://www.npmjs.com/package/@businesskit/agent)
[![MCP Compatible](https://img.shields.io/badge/MCP-2024--11--05-blue.svg)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What is BusinessKit MCP Server?

This repository contains a standalone, runnable TypeScript Model Context Protocol (MCP) server that provides AI agents with 36 native business tools across:
- **Billing & POS**: Create walk-in sales receipts, record custom rates/discounts, and draft formal customer invoices.
- **Inventory & Purchasing**: Process supplier purchase invoices, auto-create missing products with clean alphanumeric SKUs, update cost and selling prices, and maintain double-entry stock ledgers.
- **Website & Landing Pages**: Create and publish pages with modular responsive sections (`sc_navbar`, `sc_hero`, `pricing`, `faq`, `sc_footer`) or create custom HTML/CSS components.
- **Docs & Publishing (CMS)**: Draft and publish documentation, guides, newsletters, and SEO-optimized blog posts with rich TipTap/HTML blocks.
- **CRM & Contacts**: Create and update customer leads and contacts with tags, notes, and outreach status.
- **Support Inbox**: Triage email threads, classify categories, manage thread states, extract OTP verification codes, and draft agent replies.
- **Domains**: Track domain expiration horizons, monitor RDAP statuses, and save agent renewal reminders.

---

## Quick Start: Running the MCP Server

### 1. Environment Configuration

The MCP server connects directly to your Turso database. Create a `.env` file in your working directory (or set environment variables):

```env
# Turso Database Connection
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Optional: active profile ID (auto-detected if omitted)
PROFILE_ID=
```

> **Note**: Even without database credentials configured, the MCP server cleanly boots and serves `initialize` and `tools/list` with complete JSON schemas, allowing MCP clients and registries to inspect capabilities immediately.

### 2. Connect to Your MCP Client

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

## MCP Tools Reference (36 Tools)

### 🛒 Shop, Inventory & Billing
| Tool | Description |
| :--- | :--- |
| `inventory_receive_purchase_invoice` | Process supplier purchase invoices, auto-create catalog items, update cost/selling prices, and append to stock ledger with movement_type `purchase`. |
| `product_update_pricing` | Directly update selling price, cost price, markup %, MRP, or discounts for an existing SKU or item. |
| `inventory_add_stock` | Adjust inventory stock levels with movement_type `purchase` or `adjustment`. |
| `inventory_get_levels` | Query on-hand inventory levels and stock balances, optionally filtered by SKU or category. |
| `invoice_create` | Draft customer sales invoices with line items, quantities, and due dates. |
| `invoice_send` | Mark a sales invoice as issued and ready for customer dispatch. |
| `shop_create_new_bill` | Create a customer POS sales bill (`SAL-XXXX`), apply line or bill-level discounts, deduct stock ledger, and record customer details. |

### 👥 CRM & Contacts
| Tool | Description |
| :--- | :--- |
| `contact_create` | Add new leads, clients, or suppliers with first/last name, email, phone, and tags. |
| `contact_update` | Modify existing contact information, notes, company, or outreach status. |

### 📝 CMS & Content Publishing
| Tool | Description |
| :--- | :--- |
| `blog_post_create` | Publish rich HTML blog posts, docs, newsletters, or guides with SEO metadata, excerpt, and word count. |
| `content_list` | List existing content articles, docs, or newsletters filtered by hub or publish status. |
| `content_get` | Fetch complete HTML content and metadata by ID or slug. |
| `content_update` | Update HTML body, title, slug, collection, or publish status on existing articles. |

### 🌐 Pages & Custom UI Components
| Tool | Description |
| :--- | :--- |
| `page_create` | Create a full website page with title, slug, SEO tags, and visual section blocks (`sc_navbar`, `sc_hero`, `pricing`, `faq`, `sc_footer`). |
| `page_get` | Fetch website page sections, FAQ items, and metadata by ID or slug. |
| `page_update` | Update page title, slug, sections, FAQ, or SEO metadata. |
| `page_publish` | Toggle published or draft status for a website page. |
| `page_list` | List website pages, URLs, and publication statuses. |
| `component_create` | Create bespoke custom HTML/CSS/JS section components with editable fields schema. |
| `component_list` | List custom components stored for the active profile. |
| `component_get` | Fetch custom component source (HTML, CSS, JS, and slideover schema). |
| `page_get_section_schema` | Inspect JSON blueprints and reference HTML/CSS for all native website sections. |

### 📬 Inbox & Customer Communication
| Tool | Description |
| :--- | :--- |
| `inbox_tool_set_category` | Categorize an email thread (`billing`, `support`, `sales`, `spam`). |
| `inbox_tool_set_state` | Transition thread state (`open`, `snoozed`, `closed`, `archived`). |
| `inbox_tool_add_label` | Append labels/tags to an email thread. |
| `inbox_tool_link_entity` | Link an email thread to a CRM contact, order, or deal. |
| `inbox_tool_draft_reply` | Draft outbound replies stored with `author='agent'` for human review. |
| `inbox_tool_schedule_send` | Schedule outbound draft emails at a specified Unix timestamp. |
| `inbox_tool_archive` | Archive an email thread upon resolution. |
| `inbox_tool_extract_verification_code` | Extract OTP or verification PIN codes from latest inbound message. |
| `inbox_tool_save_attachments` | File inbound email attachments into the media library. |

### 🌍 Domains
| Tool | Description |
| :--- | :--- |
| `domain_list_expiring` | List domain names expiring within N days with renewal prices and auto-renew status. |
| `domain_set_agent_notes` | Store agent recommendations or renewal reminders on a domain without overwriting user notes. |

### ⚙️ System & Profiles
| Tool | Description |
| :--- | :--- |
| `system_get_capabilities` | Introspect BusinessKit capabilities, domain summaries, and tool counts. |
| `profile_list` | List available organization profiles and check active profile. |
| `profile_switch` | Switch active organization profile for the MCP session. |

---

## Local Development & Building

Clone the repository and install dependencies:
```bash
git clone https://github.com/businesskitai/businesskit-agent.git
cd businesskit-agent
npm install
```

Build the production bundle:
```bash
npm run build
```

Run the server locally over stdio:
```bash
node dist/server.js
# or during development:
npm run dev
```

Run CLI setup or update:
```bash
./bin/businesskit.js setup
./bin/businesskit.js update
```

---

## Safety & Architecture Guarantees

- **No Non-JSON on Stdout**: The MCP server strictly directs all logging, diagnostics, and notifications to `stderr`. `stdout` is reserved exclusively for JSON-RPC 2.0 messages.
- **Zero Credential Leakage**: Database tokens and secrets remain safely in your `.env` or system environment; they are never reflected into tool responses or prompts.
- **Fail-Safe Offline Inspection**: Registry validators and MCP inspectors can verify tool catalogs and schemas without requiring database credentials.
- **Append-Only Ledgers**: All stock adjustments and invoicing write immutable ledger entries, preventing accounting discrepancies.

---

## License

MIT License. Copyright (c) 2026 BusinessKit AI.
