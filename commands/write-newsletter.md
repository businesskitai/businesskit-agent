---
id: "cmd_write_newsletter"
name: "Write Newsletter"
slash: "/write-newsletter"
description: "Draft or publish a newsletter issue with sections, highlights, and CTA"
domain_tags: ["content"]
cms_id: "cc55cc55-0001-4000-8000-000000000020"
cms_slug: "n"
required_tools: ["blog_post_create"]
---

# Write Newsletter (`/write-newsletter`)

Draft or publish a conversational email newsletter issue with curated highlights, tips, and a prominent call-to-action button.

## Available Tools
- `blog_post_create(title: string, body_html: string, category_id?: string, content_type?: string, excerpt?: string, cta_button_text?: string, cta_button_url?: string, published?: boolean)`: Creates or publishes a newsletter issue.

## Accepted Arguments
- `/write-newsletter Issue #14: Holiday Inventory Planning`
- With theme/notes: `/write-newsletter Weekly digest with 3 top tips and product update`

## Newsletter Format Rules
1. **Target Hub**: Newsletter (`content_type: "n"`, `category_id: "cat_20"`).
2. **Conversational Tone**: Warm 1–2 paragraph opener `<p>` addressed directly to the reader.
3. **Sections**: 2–4 scannable sections (`<h2>Main Story</h2>`, `<h2>Quick Reads</h2>` with `<ul>`, `<h2>Tip of the Week</h2>`).
4. **Callout Tip**: Use `<div data-type="info-card">` or checklist `<ul data-type="taskList">`.
5. **Call-to-Action (CTA)**: Provide explicit button label and URL (`cta_button_text: "Read Full Release"`, `cta_button_url: "https://..."`).

## Reference Catalog
Before authoring `body_html`, read:
- [`skills/cms/references/html-blocks.md`](../skills/cms/references/html-blocks.md) for exact supported HTML snippets (steps, callout cards, task lists, and CTA blocks).

## Execution Protocol
1. Compose issue title and lead copy.
2. Structure sections using semantic HTML.
3. Call `blog_post_create`:
   ```json
   {
     "category_id": "cat_20",
     "content_type": "n",
     "title": "Holiday Inventory Planning",
     "excerpt": "How to prepare your warehouse stock for Q4 holiday demand spikes.",
     "body_html": "<p>Hey everyone,</p><h2>Main Story</h2>...",
     "cta_button_text": "View Stock Checklist",
     "cta_button_url": "https://example.com/checklist",
     "published": false
   }
   ```
4. Output draft confirmation, preview link, and send options.
