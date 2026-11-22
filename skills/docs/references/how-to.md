# How-To: Structuring & Publishing BusinessKit Documentation

This guide documents the hierarchy, collection mapping, semantic rules, and MCP tool workflows used to author, format, and organize documentation and knowledge base articles for **BusinessKit**.

---

## 1. Operating Rules & Core Constraints

Whenever authoring or publishing documentation, these constraints must always be respected:

| Constraint | Value / Rule | Why / Notes |
| :--- | :--- | :--- |
| **Category ID** | `cat_32` | Canonical identifier for the **docs** category. All documentation articles and subcollections must have `category_id = "cat_32"`. |
| **Doc Title** | **$\le$ 3 words strictly** | E.g., `What Are Pages`, `Create New Page`, `Visual Page Editor`, `Install BusinessKit`. |
| **SEO Title** | Prefixed with Domain | E.g., `Pages: Visual Drag and Drop Canvas Editor`, `Deploy: Connect Cloudflare Pages`. |
| **No `<h1>` in HTML** | Prohibited in body | The article title is rendered by the layout as the primary `<h1>`. Body headings must start with `<h2>` then `<h3>`. |
| **Status Field** | `published: 1` | `1` = published live, `0` = saved as draft. |

---

## 2. Document Hierarchy & Collections

Docs are organized into root domains and nested subcollections:

### Canonical Root Collections:
1. `col_docs_1` — Getting Started (`getting-started`)
2. `col_apps` — Apps (`apps`)
3. `col_dashboard` — Dashboard (`dashboard`)
4. `col_shop` — Shop (`shop`)
5. `col_products_inventory` — Products & Inventory (`products-inventory`)
6. `col_restaurant_cafe` — Restaurant & Café (`restaurant-cafe`)
7. `col_hotel_stays` — Hotel & Stays (`hotel-stays`)
8. `col_tax` — Tax (`tax`)
9. `col_accounts` — Accounts (`accounts`)
10. `col_link_in_bio` — Link in Bio (`link-in-bio`)
11. `col_website` — Website & Pages (`pages`)
12. `col_deploy` — Deploy (`deploy`)
13. `col_crm` — CRM (`crm`)
14. `col_social` — Social Media (`social`)
15. `col_store` — Online Store (`store`)
16. `col_content_cms` — Content & CMS (`content`)
17. `col_chat_agent` — Chat Agent (`chat-agent`)
18. `col_agents` — Autonomous Agents (`agents`)
19. `col_settings_account` — Settings & Account (`settings-account`)
20. `col_help_support` — Help & Support (`help`)

---

## 3. Supported HTML Elements & Widgets (Single Source of Truth)

All documentation articles must use clean semantic TipTap HTML. Do not maintain separate markup schemas.

👉 **Read the Universal HTML Block Reference**:
Consult [`../../cms/references/html-blocks.md`](../../cms/references/html-blocks.md) for exact markup snippets and attributes:
- **Sequential Steps**: `<div data-type="steps" class="tech-steps">` with `<div data-type="step-item">`
- **Info Callouts**: `<div data-type="info-card" class="tech-callout tech-callout--info" role="note">`
- **Checklists**: `<ul data-type="taskList"><li data-type="taskItem" data-checked="false">...</li></ul>`
- **Code & Named Files**: `<pre data-filename="..."><code>...</code></pre>`
- **Tables & Matrices**: `<table><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table>`
- **Accordion FAQs**: `<div data-type="accordion-group" class="tech-accordion">` (collapsed by default)
- **Inline Elements**: `<kbd class="tech-kbd">⌘K</kbd>`, `<code>inline</code>`, `<strong>`, `<em>`

---

## 4. MCP Tool Workflows

All documentation operations execute through the native BusinessKit MCP server within the user's active business profile.

### A. Listing Existing Documentation & Collections
Query published articles and collections in the docs category:
```json
call_tool("content_list", {
  "category_id": "cat_32"
})
```

### B. Creating and Publishing an Article
Create a new structured documentation page:
```json
call_tool("blog_post_create", {
  "title": "What Are Pages",
  "slug": "what-are-pages",
  "category_id": "cat_32",
  "content_type": "docs",
  "collection_id": "col_pg_start",
  "excerpt": "Overview of Pages: BusinessKit's visual website builder.",
  "seo_title": "Pages: Visual Site Architecture and Canvas Editor",
  "body_html": "<h2>Overview</h2><p>Pages allows you to design storefronts and responsive pages...</p>",
  "published": 1
})
```

### C. Updating Existing Content
Update article copy, body HTML, or publication status:
```json
call_tool("content_update", {
  "id": "post_what_are_pages",
  "content": "<h2>Overview</h2><p>Updated visual builder guide...</p>",
  "published": 1
})
```

---

## 5. Local Backup & Markdown Artifacts

When generating documentation deliverables for offline review or version control, save them into the workspace output directory:
`./output/docs/<domain>/<slug>.md`

### Markdown File Format with YAML Frontmatter
```markdown
---
title: "What Are Pages"
slug: "what-are-pages"
seo_title: "Pages: Overview and Visual Site Architecture"
excerpt: "Understand how Pages lets you build responsive storefronts and landing pages with custom components."
collection_id: "col_pg_start"
category_id: "cat_32"
order_index: 1
published: true
---

<h2>Visual Site Architecture</h2>
<p>Pages is BusinessKit's visual website builder...</p>
```

---

## 6. Verification Checklist

After authoring or updating docs, verify:
1. **Title length**: Title has 3 words or fewer.
2. **No `<h1>`**: Body headings start with `<h2>`.
3. **Category match**: `category_id` is `"cat_32"` and `content_type` is `"docs"`.
4. **Accordions**: Default to collapsed (`aria-expanded="false"` or `data-open="false"`).
5. **Clean HTML**: All code tags HTML-escaped.
