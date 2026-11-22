---
name: docs-cms
description: Manage and publish technical documentation, knowledge base articles, guides, and blog posts via BusinessKit CMS tools.
---

# Docs & CMS Publishing Skill

Use this skill when the user asks to write, edit, format, or publish articles, knowledge base docs, guides, or blog posts.

## 1. Operating Rules & Constraints

- **Category ID**:
  - Documentation / Knowledge Base: `category_id = "cat_32"`
  - Blog: `category_id = "cat_35"`
  - Guides: `category_id = "cat_36"`
- **Doc Titles**: Strictly **$\le$ 3 words** (e.g., `Install BusinessKit`, `Visual Page Editor`, `What Are Pages`).
- **SEO Titles**: Prefixed with the Domain name (e.g. `Pages: Visual Site Architecture`).
- **Semantic HTML**:
  - Never use Markdown syntax (`##`, `*`, ` ``` `) inside `body_html` / `content`.
  - Never use `<h1>` tags (the page layout generates `<h1>` from the title). Start with `<h2>`.
  - Accordions must default to collapsed (`isOpen = false`, `aria-expanded="false"`).
  - Task lists use `<ul data-type="taskList">` with semantic `<li data-type="taskItem">`.

## 2. Tool Workflows

### A. List Existing Articles
```json
call_tool("content_list", {
  "category_id": "cat_32"
})
```

### B. Create / Publish Documentation Article
```json
call_tool("blog_post_create", {
  "title": "What Are Pages",
  "slug": "what-are-pages",
  "category_id": "cat_32",
  "collection_id": "col_pg_start",
  "excerpt": "Visual website builder overview for BusinessKit.",
  "seo_title": "Pages: Overview and Visual Site Architecture",
  "body_html": "<h2>Overview</h2><p>Pages allows you to design storefronts...</p>",
  "published": 1
})
```

### C. Update Article
```json
call_tool("content_update", {
  "id": "post_what_are_pages",
  "content": "<h2>Updated Section</h2><p>Refined description...</p>"
})
```
