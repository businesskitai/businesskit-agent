---
name: cms
description: Universal CMS skill to author, format, and publish across Blog, Newsletter, Guides, Notes, and custom hubs using native TipTap HTML widgets.
---

# Universal CMS & Content Publishing Skill

Use this skill when the user asks to write, edit, format, or publish content across any BusinessKit CMS hub:
- **Blog** (`category_id = "cat_35"`, `content_type = "blog"`)
- **Newsletter** (`category_id = "cat_20"`, `content_type = "n"`)
- **Guides** (`category_id = "cat_36"`, `content_type = "guides"`)
- **Notes / Changelog** (`category_id = "cat_37"`, `content_type = "notes"`)
- **User-Created Custom Hubs** (dynamically assigned `category_id` and custom slugs)

---

## 1. Universal HTML Block Contract

All CMS content must be written in clean semantic TipTap HTML. Before composing `body_html`, read [`references/html-blocks.md`](./references/html-blocks.md) for exact markup:
- **Prose & Headings**: `<h2>`, `<h3>`, `<p>`, `<hr />`, `<blockquote>`, `<ul>`, `<ol>`.
- **Inline Elements**: `<strong>`, `<em>`, `<u>`, `<s>`, `<a href="...">`, `<code>inline</code>`, `<kbd class="tech-kbd">⌘K</kbd>`.
- **Checklists**: `<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /></label><div><p>Task</p></div></li></ul>`.
- **Code & Named Files**: `<pre data-filename="filename.ext"><code class="language-plaintext">...</code></pre>`.
- **Tables**: `<table><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table>`.
- **Callout Cards**: `<div data-type="info-card" class="tech-callout tech-callout--info" role="note"><div class="tech-callout__content"><p>Note...</p></div></div>`.
- **Steps**: `<div data-type="steps" class="tech-steps"><div data-type="step-item" class="tech-step"><div data-type="step-title" class="tech-step__title">Title</div><div data-type="step-content" class="tech-step__content"><p>...</p></div></div></div>`.
- **Accordion FAQs**: `<div data-type="accordion-group" class="tech-accordion"><div data-type="accordion-item" class="tech-accordion__item" data-open="true"><div data-type="accordion-title" class="tech-accordion__summary">Q</div><div data-type="accordion-content" class="tech-accordion__content"><p>A</p></div></div></div>`.
- **Media & Embeds**: `<img>`, `<video controls ...>`, YouTube `<div data-youtube-video=""><iframe ...></iframe></div>`.

---

## 2. Hub-Specific Blueprints

### A. Blog (`content_type = "blog"`, `category_id = "cat_35"`)
Editorial story, insights, product comparisons.
- Opening hook `<p>`, structured `<h2>`/`<h3>` sections.
- Pull-quotes `<blockquote>`, callout takeaways `<div data-type="info-card">`, comparison `<table>`, and code blocks.
- Compelling `excerpt`, `ai_summary`, `seo_title`, `seo_description`, and `seo_keywords`.

### B. Newsletter (`content_type = "n"`, `category_id = "cat_20"`)
Conversational reader letter style.
- Warm 1–2 paragraph opener `<p>` addressed directly to the reader.
- 2–4 scannable sections (`<h2>Main Story</h2>`, `<h2>Quick Reads</h2>` with `<ul>`, `<h2>Tip of the Week</h2>`).
- Action checklist `<ul data-type="taskList">` or `<div data-type="info-card">`.
- Explicit CTA button (`cta_button_text: "Read More"`, `cta_button_url: "https://..."`).

### C. Guides (`content_type = "guides"`, `category_id = "cat_36"`)
Actionable how-to walkthrough.
- Outcome opener `<p>` explaining what the reader achieves.
- Prerequisites in `<div data-type="info-card">` or `<ul data-type="taskList">`.
- Step-by-step tutorial inside `<div data-type="steps" class="tech-steps">` with code snippets and `<kbd>`.
- Closing FAQ accordion `<div data-type="accordion-group">`.

### D. User Custom Hubs (Dynamic `category_id`)
When the user creates a custom CMS hub (e.g. "Case Studies", "Changelog", "Recipes"):
- Call `content_list` to discover existing hubs, collections, and custom `category_id` values.
- Match tone and use the universal HTML widgets best suited for that hub.

---

## 3. Tool Workflows

### Create Content
```json
call_tool("blog_post_create", {
  "content_type": "blog",
  "category_id": "cat_35",
  "title": "5 Ways to Automate Invoicing",
  "excerpt": "Discover how automated billing saves hours every week.",
  "seo_title": "5 Ways to Automate Invoicing | BusinessKit",
  "body_html": "<p>Opening hook...</p><h2>1. Digital Invoices</h2><p>...</p>",
  "published": false
})
```

### Update Existing Content
```json
call_tool("content_update", {
  "id": "post_123",
  "content": "<h2>Updated Section</h2><p>Refined text...</p>"
})
```

---

## 4. Reference Catalogs

- [`references/html-blocks.md`](./references/html-blocks.md) — Exact markup snippets for every supported TipTap block and widget.
- [`references/cms-hubs.md`](./references/cms-hubs.md) — Full catalog of all 30 canonical CMS hubs with their `category_id`, `cms_id`, and `slug`.
