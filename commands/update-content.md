---
id: "cmd_update_content"
name: "Update Blog, Docs or Guide"
slash: "/update-content"
description: "Edit body, metadata, collection, or publish status on an existing post, doc, guide, or newsletter"
domain_tags: ["content"]
required_tools: ["content_get", "content_update", "content_list"]
---

# Update Content (`/update-content`)

Fetch, revise, and update an existing post, documentation article, guide, or newsletter.

## Available Tools
- `content_get(id: string)`: Retrieves current article body HTML, metadata, and status.
- `content_update(id: string, title?: string, body_html?: string, excerpt?: string, collection_id?: string, seo_title?: string, seo_description?: string, published?: boolean)`: Saves edits.
- `content_list(category_id?: string, content_type?: string)`: Discovers article IDs.

## Accepted Arguments
- `/update-content <id>` e.g. `/update-content post_821`
- `/update-content <id> publish` to toggle an article live.
- Instructions: `/update-content post_821 add callout note about v2 migration`

## Execution Protocol

### Step 1: Fetch Existing Article
1. Call `content_get(id: "<id>")` to load the current `body_html`, `title`, and collection metadata.
2. If ID is unknown, call `content_list` to find matching articles by title.

### Step 2: Apply Edits to HTML
- Preserve existing valid HTML elements and classes (`tech-callout`, `tech-steps`, `tech-accordion`).
- Apply the user's specific requested changes (e.g. rewrite a paragraph, add a code block, fix typos).
- Keep pure semantic HTML — never insert raw Markdown syntax.

### Step 3: Save Updates
Call `content_update`:
```json
{
  "id": "<article_id>",
  "body_html": "<updated_html>",
  "title": "<optional_title>",
  "published": true
}
```

### Step 4: Confirmation
Output updated article title, slug, publish state, and preview link.
