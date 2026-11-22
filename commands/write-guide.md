---
id: "cmd_write_guide"
name: "Write Step-by-Step Guide"
slash: "/write-guide"
description: "Create an actionable how-to guide with prerequisites, numbered steps, and FAQ"
domain_tags: ["content"]
cms_id: "cc55cc55-0001-4000-8000-000000000036"
cms_slug: "guides"
required_tools: ["blog_post_create", "content_list"]
---

# Write Step-by-Step Guide (`/write-guide`)

Create an actionable how-to walkthrough with clear prerequisites, numbered step walkthroughs, code samples, and troubleshooting FAQs.

## Available Tools
- `content_list(category_id?: string, content_type?: string)`: Checks existing guide collections.
- `blog_post_create(title: string, body_html: string, category_id?: string, collection_id?: string, content_type?: string, excerpt?: string, seo_title?: string, seo_description?: string, published?: boolean)`: Publishes the guide.

## Accepted Arguments
- `/write-guide How to Connect Stripe Terminal`
- With collection: `/write-guide collection:col_payments title:"Configure Bank Feeds"`

## Guide Structure Rules
1. **Target Hub**: Guides (`content_type: "guides"`, `category_id: "cat_36"`).
2. **Outcome Opener**: First paragraph `<p>` explains exactly what the user will accomplish.
3. **Prerequisites**: Highlight required tools, permissions, or accounts inside `<div data-type="info-card">` or `<ul data-type="taskList">`.
4. **Step Sequence**: Numbered tutorial inside `<div data-type="steps" class="tech-steps">` with code blocks `<pre data-filename="...">` and `<kbd class="tech-kbd">`.
5. **Troubleshooting FAQ**: Closing FAQ accordion using `<div data-type="accordion-group" class="tech-accordion">`.
6. **Metadata**: Set `additional_details` like `[{"key": "Difficulty", "value": "Beginner"}, {"key": "Time", "value": "10 mins"}]`.

## Reference Catalog
Before authoring `body_html`, read:
- [`skills/cms/references/html-blocks.md`](../skills/cms/references/html-blocks.md) for exact supported HTML snippets (sequential `<div data-type="steps">`, callout cards, task lists, code blocks, and accordion FAQs).

## Execution Protocol
1. Call `content_list(category_id: "cat_36")` to discover existing guide categories.
2. Draft semantic HTML following the step sequence structure.
3. Call `blog_post_create`:
   ```json
   {
     "category_id": "cat_36",
     "content_type": "guides",
     "title": "Configure Bank Feeds",
     "excerpt": "Connect your business bank account for automated statement reconciliation.",
     "body_html": "<p>In this guide, you will connect...</p><div data-type=\"info-card\">...</div>",
     "published": true
   }
   ```
4. Output live guide link: `https://<domain>/guides/<slug>`.
