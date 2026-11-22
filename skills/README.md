# BusinessKit Agent Skills

Declarative workflow skills that guide agents in using BusinessKit's native Model Context Protocol (MCP) server.

Skills load on demand based on task context—never load all skills simultaneously.

## Domain Workflow Skills (MCP Tools)

| Skill | Directory | Core MCP Tools | Purpose |
| :--- | :--- | :--- | :--- |
| **Universal CMS** | `cms/` | `blog_post_create`, `content_list`, `content_get`, `content_update` | Blog posts, newsletters, guides, notes, and custom hubs with universal TipTap HTML blocks. |
| **Docs & Knowledge Base** | `docs/` | `blog_post_create`, `content_list`, `content_get`, `content_update` | Technical documentation, nested collection hierarchy, and knowledge base articles (`cat_32`). |
| **Visual Pages** | `pages/` | `page_create`, `page_update`, `page_publish`, `component_create`, `page_get_section_schema` | Storefront and landing pages using native modular sections and custom components. |
| **Billing & POS** | `billing/` | `shop_create_new_bill`, `invoice_create`, `invoice_send` | Rapid POS sales receipts, handwritten bill parsing, and B2B invoices. |
| **Inventory** | `inventory/` | `inventory_receive_purchase_invoice`, `inventory_add_stock`, `inventory_get_levels` | Supplier purchase bills, automated restocking, stock adjustments, and moving average cost. |
| **CRM** | `crm/` | `contact_create`, `contact_update` | Customer, client, and vendor directory management and tagging. |
| **Inbox** | `inbox/` | `inbox_tool_set_category`, `inbox_tool_draft_reply`, `inbox_tool_schedule_send` | Email/DM triage, prompt-injection screening, draft replies, and approval gates. |

## Content Craft & Brand Skills

| Skill | Directory | Purpose |
| :--- | :--- | :--- |
| **Brand Identity** | `brand/` | Calibrate brand voice, tone compass, and store context via `system_get_capabilities`. |
| **Humanizer** | `humanizer/` | De-AI patterns, remove repetitive AI writing signatures, and restore genuine human voice. |
| **Copywriting** | `copywriting/` | High-converting sales page copywriting with internal hostile validation. |
| **Social Content** | `social/` | Multi-platform social copy, thread creation, and engagement optimization. |
