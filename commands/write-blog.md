---
id: "cmd_draft_post"
name: "Write Blog Post"
slash: "/write-blog"
description: "Draft or publish a formatted blog article with clean HTML"
domain_tags: ["content"]
cms_id: "cc55cc55-0001-4000-8000-000000000035"
cms_slug: "blog"
required_tools: ["blog_post_create", "content_list"]
---

# Write Blog Post (`/write-blog`)

Draft or publish an engaging, SEO-optimized blog article with clean semantic TipTap HTML, pull quotes, callouts, and comparisons.

## Available Tools
- `blog_post_create(title: string, body_html: string, category_id?: string, content_type?: string, excerpt?: string, seo_title?: string, seo_description?: string, seo_keywords?: string, published?: boolean)`: Creates or publishes a post.
- `content_list(category_id?: string, content_type?: string)`: Checks existing posts for tone and topic overlap.

## Accepted Arguments
- Topic or title: `/write-blog 5 Ways to Automate Retail Invoicing`
- Outlines, drafts, or marketing briefs.

## Formatting Contract
1. **Target Hub**: Blog (`content_type: "blog"`, `cms_id: "cc55cc55-0001-4000-8000-000000000035"`).
2. **HTML Rules**:
   - Write clean semantic HTML in `body_html` — NEVER Markdown syntax (`##`, `*`, ``` ```).
   - NEVER emit `<h1>` in `body_html` (`title` automatically renders as `<h1>`).
   - Use `<h2>`, `<h3>`, `<p>`, `<blockquote><p>...</p></blockquote>`, `<ul data-type="taskList">`, `<div data-type="info-card">`, and `<table>`.
3. **SEO & Discovery**:
   - Compelling 1–2 sentence `excerpt` and `ai_summary`.
   - `seo_title` prefixed with store or brand name (e.g. `BusinessKit | 5 Ways to Automate Billing`).
   - `seo_description` (150–160 chars) and relevant `seo_keywords`.
4. **Draft Mode**: Save as draft (`published: false`) unless the user explicitly requests immediate publishing.

## Reference Catalog
Before authoring `body_html`, read:
- [`skills/cms/references/html-blocks.md`](../skills/cms/references/html-blocks.md) for exact supported HTML snippets (steps, callout cards, task lists, code blocks, accordion FAQs, and video embeds).

## Execution Protocol
1. Formulate title, excerpt, and engaging opening paragraph.
2. Structure sections using `<h2>`, `<h3>`, and relevant widgets.
3. Call `blog_post_create`:
   ```json
   {
     "category_id": "cat_35",
     "content_type": "blog",
     "title": "5 Ways to Automate Retail Invoicing",
     "excerpt": "Discover how modern point-of-sale and automated invoices save hours each week.",
     "seo_title": "5 Ways to Automate Invoicing | BusinessKit",
     "seo_description": "Streamline your retail store billing with automated invoicing workflows.",
     "body_html": "<p>Running a retail store...</p><h2>1. Digitize Inward Invoices</h2>...",
     "published": false
   }
   ```
4. Output draft confirmation, preview link, and publish command: `/update-content <id> publish`.
