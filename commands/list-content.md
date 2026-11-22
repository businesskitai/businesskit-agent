---
id: "cmd_list_content"
name: "List Blog, Docs & Guides"
slash: "/list-content"
description: "List existing blog posts, newsletters, docs, guides, and collections"
domain_tags: ["content"]
required_tools: ["content_list"]
---

# List Content (`/list-content`)

List published and draft articles across Blog, Knowledge Base / Docs, Step-by-Step Guides, Newsletters, or custom hubs.

## Available Tools
- `content_list(category_id?: string, content_type?: string, published_only?: boolean)`: Retrieves article listings and child collections.

## Accepted Arguments
- All hubs: `/list-content`
- Hub-specific:
  - `/list-content docs` or `/list-content cat_32`
  - `/list-content blog` or `/list-content cat_35`
  - `/list-content guides` or `/list-content cat_36`
  - `/list-content newsletter` or `/list-content cat_20`

## Execution Protocol

### Step 1: Query Articles
Call `content_list` with appropriate filter:
```json
{
  "content_type": "<optional_hub_slug>"
}
```

### Step 2: Display Results Table
Group by Hub or Collection:

| Title | Slug | Hub | Status | Collection | Updated |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Pages Architecture | `pages-architecture` | Docs | 🟢 Live | Getting Started | 1 day ago |
| Automate Invoicing | `automate-invoicing` | Blog | 🟡 Draft | Retail Tips | 3 days ago |

### Step 3: Suggest Quick Actions
- To edit an article: `/update-content <id>`
- To audit SEO: `/seo-audit <id_or_hub>`
- To create a new doc: `/write-docs <title>`
