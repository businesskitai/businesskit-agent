---
id: "cmd_write_docs"
name: "Write Docs Article"
slash: "/write-docs"
description: "Write structured documentation (steps, file code blocks, kbd, info-cards, accordions)"
domain_tags: ["content"]
required_tools: ["blog_post_create", "content_list"]
cms_id: "cc55cc55-0001-4000-8000-000000000032"
cms_slug: "docs"
---

# Write Docs Article (`/write-docs`)

Create or update structured technical reference and knowledge base documentation with interactive widgets, multi-step instructions, and syntax-highlighted code.

## Available Tools
- `content_list(category_id?: string, content_type?: string)`: Checks existing collections and articles in the Docs hub.
- `blog_post_create(title: string, body_html: string, category_id?: string, collection_id?: string, content_type?: string, excerpt?: string, seo_title?: string, seo_description?: string, published?: boolean)`: Publishes the documentation article.

## Accepted Arguments
- `/write-docs <title>` e.g. `/write-docs Setup MCP Server`
- With collection: `/write-docs collection:col_pg_start title:"Pages Architecture"`
- With full outline: Provide the technical guide requirements directly.

## Core Rules & Constraints
1. **Target Hub**: Knowledge Base / Docs (`category_id: "cat_32"`, `content_type: "docs"`).
2. **Title Constraint**: Strictly **$\le$ 3 words** (e.g. `What Are Pages`, `Install BusinessKit`). The title automatically renders as the page `<h1>`.
3. **Never Emit `<h1>` in HTML**: Top-level headings inside `body_html` must start with `<h2>`, followed by `<h3>`.
4. **Pure Semantic HTML in `body_html`**: Never write Markdown syntax (`##`, `*`, ``` ```, `- `).
5. **Collection Scoping**: Always associate with a child collection (e.g. `col_pg_start`, `col_crm`). Call `content_list(category_id: "cat_32")` first to discover active collections.

## Supported HTML Blocks
- **Section Headings**: `<h2>Section Title</h2>`, `<h3>Subtopic</h3>`
- **Prerequisites / Notes**:
  ```html
  <div data-type="info-card" class="tech-callout tech-callout--info" role="note">
    <div class="tech-callout__content"><p>Important prerequisite...</p></div>
  </div>
  ```
- **Checklist**:
  ```html
  <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /></label><div><p>Prerequisite step</p></div></li></ul>
  ```
- **Multi-step Walkthrough**:
  ```html
  <div data-type="steps" class="tech-steps">
    <div data-type="step-item" class="tech-step">
      <div data-type="step-title" class="tech-step__title">1. Connect Your Account</div>
      <div data-type="step-content" class="tech-step__content"><p>Step instructions...</p></div>
    </div>
  </div>
  ```
- **Code & Named Files**:
  ```html
  <pre data-filename="config.json"><code class="language-json">{ "profile": "default" }</code></pre>
  ```
- **Keyboard Shortcuts**: `<kbd class="tech-kbd">⌘</kbd> + <kbd class="tech-kbd">K</kbd>`
- **Accordion FAQ (Collapsed by default)**:
  ```html
  <div data-type="accordion-group" class="tech-accordion">
    <div data-type="accordion-item" class="tech-accordion__item" aria-expanded="false">
      <div data-type="accordion-title" class="tech-accordion__summary">Frequently asked question?</div>
      <div data-type="accordion-content" class="tech-accordion__content" hidden="hidden"><p>Answer details...</p></div>
    </div>
  </div>
  ```

## Reference Catalogs
Before authoring `body_html`, read:
- [`skills/docs/references/how-to.md`](../skills/docs/references/how-to.md) for documentation collection hierarchy and naming rules.
- [`skills/cms/references/html-blocks.md`](../skills/cms/references/html-blocks.md) for the universal HTML element catalog (steps, callouts, task lists, code blocks, accordion FAQs).

## Execution Protocol
1. Call `content_list(category_id: "cat_32")` to find matching child collections.
2. Compose article with concise `excerpt` and prefixed SEO title (e.g. `Pages: Visual Site Architecture`).
3. Call `blog_post_create`:
   ```json
   {
     "category_id": "cat_32",
     "collection_id": "col_pg_start",
     "content_type": "docs",
     "title": "Pages Architecture",
     "excerpt": "Learn how BusinessKit visual pages and components work together.",
     "seo_title": "Pages Architecture | BusinessKit Docs",
     "body_html": "<h2>Overview</h2><p>...</p>",
     "published": true
   }
   ```
4. Output published URL and summary: `https://<domain>/docs/pages-architecture`.
