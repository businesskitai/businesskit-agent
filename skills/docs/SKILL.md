---
name: docs
description: Author, structure, and publish technical documentation and knowledge base articles via BusinessKit Docs CMS tools.
---

# Docs & Knowledge Base Skill

Use this skill when the user asks to write, edit, organize, or publish technical documentation, API references, or knowledge base articles (`category_id = "cat_32"`, `content_type = "docs"`).

---

## 1. Operating Rules & Constraints

- **Category & Type**: `category_id = "cat_32"`, `content_type = "docs"`.
- **Title Length**: Strictly **$\le$ 3 words** (e.g. `What Are Pages`, `Visual Page Editor`, `Install BusinessKit`).
- **SEO Title**: Always prefixed with Domain (e.g. `Pages: Visual Site Architecture`).
- **Collections**: Every doc article belongs to a collection (e.g. `col_docs_1` Getting Started, `col_website` Website & Pages). See [`references/how-to.md`](./references/how-to.md) for full collection hierarchy.
- **Collection Creation**: When creating or seeding a new `collections` row, **ALWAYS** include `category_id = "cat_32"` (for guides, use `category_id = "cat_36"`). Collections without `category_id` will be orphaned from the navigation.
- **HTML Contract**:
  - Pure semantic HTML — never Markdown syntax (`##`, `*`, ` ``` `).
  - Never emit `<h1>` (article `title` renders as `<h1>`). Body headings start with `<h2>`.
  - For exact supported HTML snippets (steps, callout cards, code blocks, task lists, and FAQ accordions), read [`../cms/references/html-blocks.md`](../cms/references/html-blocks.md).

---

## 2. Tool Workflows

### A. List Existing Collections and Articles
```json
call_tool("content_list", {
  "category_id": "cat_32"
})
```

### B. Create or Publish Documentation
```json
call_tool("blog_post_create", {
  "category_id": "cat_32",
  "content_type": "docs",
  "collection_id": "col_pg_start",
  "title": "What Are Pages",
  "slug": "what-are-pages",
  "excerpt": "Visual website builder overview for BusinessKit.",
  "seo_title": "Pages: Visual Site Architecture and Canvas Editor",
  "body_html": "<h2>Overview</h2><p>Pages allows you to design storefronts...</p>",
  "published": 1
})
```

### C. Update Existing Documentation
```json
call_tool("content_update", {
  "id": "post_what_are_pages",
  "content": "<h2>Overview</h2><p>Updated visual builder guide...</p>",
  "published": 1
})
```

---

## 3. Reference Catalogs

- [`references/how-to.md`](./references/how-to.md) — Documentation collection hierarchy, naming conventions, and offline backups.
- [`../cms/references/html-blocks.md`](../cms/references/html-blocks.md) — Universal TipTap HTML elements (steps, task lists, code, callouts, accordions).
