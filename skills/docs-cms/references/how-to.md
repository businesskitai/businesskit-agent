# How-To: Authoring & Publishing BusinessKit Documentation (CMS & Knowledge Base)

This guide documents the semantic rules, structural schemas, and MCP tool workflows used to author, format, and publish documentation and knowledge base articles for **BusinessKit**.

---

## 1. Operating Rules & Core Constraints

Whenever authoring or publishing documentation, these constraints must always be respected:

| Constraint | Value / Rule | Why / Notes |
| :--- | :--- | :--- |
| **Category ID** | `cat_32` | Canonical identifier for the **docs** category. All documentation articles and subcollections must have `category_id = "cat_32"`. |
| **Doc Title** | **$\le$ 3 words strictly** | E.g., `What Are Pages`, `Create New Page`, `Visual Page Editor`, `Install BusinessKit`. |
| **SEO Title** | Prefixed with Domain | E.g., `Pages: Visual Drag and Drop Canvas Editor`, `Deploy: Connect Cloudflare Pages`. |
| **No `<h1>` in HTML** | Prohibited in body | The article title is rendered by the layout as the primary `<h1>`. Body headings must start with `<h2>` then `<h3>`. |
| **Accordions** | Collapsed by default | Must have `isOpen = false` and `aria-expanded="false"`. |
| **Task Lists** | Pure semantic structure | No bullet markers. Uses vector SVG checkmarks without border hacks. |
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

## 3. Semantic HTML Guidelines for Document Body

When writing the article body HTML (`body_html` / `content`):

### A. Section Headings
```html
<h2>First Major Topic</h2>
<p>Explaining the architecture and functionality.</p>

<h3>Subtopic or Specific Flow</h3>
<p>Step-by-step description.</p>
```

### B. Task Lists & Checkboxes
Task lists must use the standard TipTap/Docs schema:
```html
<ul data-type="taskList" class="task-list tech-task-list">
  <li data-type="taskItem" class="task-list-item tech-task-item">
    <label><input type="checkbox" checked="checked" /></label>
    <div><p>Complete initial setup in the Pages workspace.</p></div>
  </li>
  <li data-type="taskItem" class="task-list-item tech-task-item">
    <label><input type="checkbox" /></label>
    <div><p>Attach custom components to the canvas.</p></div>
  </li>
</ul>
```

### C. Collapsible Accordions (Must Be Collapsed by Default)
```html
<div data-type="accordion-group" class="tech-accordion-group">
  <div data-type="accordion-item" class="tech-accordion-item" aria-expanded="false">
    <div data-type="accordion-title" class="tech-accordion-title">How do templates differ from native sections?</div>
    <div data-type="accordion-content" class="tech-accordion-content" hidden="hidden">
      <p>Native sections adapt their colors to the profile theme token automatically, while templates provide full-page layouts.</p>
    </div>
  </div>
</div>
```

### D. Callout Cards
```html
<div data-type="info-card" class="tech-callout tech-callout--info" role="note">
  <p><strong>Note:</strong> Changes made in the Visual Editor are auto-saved locally before publishing.</p>
</div>
```

### E. Code Blocks
Always HTML-escape `<` as `&lt;` and `>` as `&gt;`:
```html
<pre><code class="language-bash">businesskit --mcp
curl -X POST https://api.businesskit.io/v1/pages</code></pre>
```

---

## 4. MCP Tool Workflows

All CMS and documentation operations execute through the native BusinessKit MCP server. The agent operates within the user's active business profile.

### A. Listing Existing Documentation
Query published articles and drafts in the documentation category:
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
3. **Category match**: `category_id` is `"cat_32"`.
4. **Accordions**: Default to collapsed (`aria-expanded="false"`).
5. **Clean HTML**: All code tags HTML-escaped.
