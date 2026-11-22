---
name: docs-cms
description: Manage and publish technical documentation, knowledge base articles, guides, and blog posts via BusinessKit CMS tools.
---

# Docs & CMS Publishing Skill

Use this skill when the user asks to write, edit, format, or publish articles, knowledge base docs, guides, newsletters, or blog posts.

---

## 1. Operating Rules & Constraints

- **Category IDs & Content Types**:
  - Documentation / Knowledge Base: `category_id = "cat_32"`, `content_type = "docs"`
  - Blog: `category_id = "cat_35"`, `content_type = "blog"`
  - Guides: `category_id = "cat_36"`, `content_type = "guides"`
  - Newsletters: `category_id = "cat_20"`, `content_type = "n"`
- **Doc Titles**: Strictly **$\le$ 3 words** for docs (e.g., `Install BusinessKit`, `Visual Page Editor`, `What Are Pages`).
- **SEO Titles**: Prefixed with the Domain name (e.g. `Pages: Visual Site Architecture`).
- **HTML Contract**:
  - Never use Markdown syntax (`##`, `*`, ` ``` `) inside `body_html` / `content`.
  - Never use `<h1>` tags (the page layout generates `<h1>` from the title). Start with `<h2>`.
  - Accordions must default to collapsed (`data-open="false"`).
  - Task lists use `<ul data-type="taskList">` with semantic `<li data-type="taskItem">`.

---

## 2. Supported HTML Elements & Blueprints

For complete markup snippets, see [`references/html-blocks.md`](./references/html-blocks.md).

- **Headings & Prose**: `<h2>`, `<h3>`, `<p>`, `<hr />`, `<blockquote><p>...</p></blockquote>`, `<ul>`, `<ol>`.
- **Inline Styling**: `<strong>`, `<em>`, `<u>`, `<s>`, `<a href="...">link</a>`, `<code>inline</code>`, `<kbd class="tech-kbd">⌘K</kbd>`.
- **Task Lists / Checklists**: `<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /></label><div><p>Item</p></div></li></ul>`.
- **Code & Named Files**: `<pre data-filename="file.ext"><code class="language-plaintext">...</code></pre>` and `<pre><code class="language-bash">...</code></pre>`.
- **Tables & Matrices**: `<table><thead><tr><th>Col</th></tr></thead><tbody><tr><td>Val</td></tr></tbody></table>`.
- **Callout Cards**: `<div data-type="info-card" class="tech-callout tech-callout--info" role="note"><div class="tech-callout__content"><p>Note...</p></div></div>`.
- **Steps**: `<div data-type="steps" class="tech-steps"><div data-type="step-item" class="tech-step"><div data-type="step-title" class="tech-step__title">Title</div><div data-type="step-content" class="tech-step__content"><p>...</p></div></div></div>`.
- **Accordion FAQs**: `<div data-type="accordion-group" class="tech-accordion"><div data-type="accordion-item" class="tech-accordion__item" data-open="true"><div data-type="accordion-title" class="tech-accordion__summary">Q</div><div data-type="accordion-content" class="tech-accordion__content"><p>A</p></div></div></div>`.
- **Media & Embeds**: `<img>`, `<video ...>`, `<div data-youtube-video=""><iframe ...></iframe></div>`.

---

## 3. Tool Workflows

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
  "content_type": "docs",
  "collection_id": "col_pg_start",
  "excerpt": "Visual website builder overview for BusinessKit.",
  "seo_title": "Pages: Overview and Visual Site Architecture",
  "body_html": "<h2>Overview</h2><p>Pages allows you to design storefronts...</p>",
  "published": 1
})
```

### C. Update Existing Content
```json
call_tool("content_update", {
  "id": "post_what_are_pages",
  "content": "<h2>Updated Section</h2><p>Refined description...</p>"
})
```
