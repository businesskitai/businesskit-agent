---
id: "cmd_update_page"
name: "Update Website Page"
slash: "/update-page"
description: "Update sections, copy, or settings on an existing page"
domain_tags: ["pages"]
required_tools: ["page_get", "page_update", "page_list"]
---

# Update Website Page (`/update-page`)

Fetch, revise, and update copy, visual sections, styling, or metadata on an existing website page.

## Available Tools
- `page_get(page_id_or_slug: string)`: Retrieves the full current page structure, sections array, and metadata.
- `page_update(page_id_or_slug: string, title?: string, slug?: string, excerpt?: string, sections?: array, published?: boolean)`: Saves updates.
- `page_list(published_only?: boolean)`: Discovers page IDs/slugs if target is ambiguous.

## Accepted Arguments
- `/update-page <slug>` e.g. `/update-page home` or `/update-page about`
- Instructions on what to update, e.g.:
  - `/update-page home add FAQ section with 3 questions`
  - `/update-page pricing change pro plan price to $49`
  - `/update-page about change hero headline to "Building the Future of Retail"`

## Execution Protocol

### Step 1: Fetch Existing Page
1. Identify the target page from user arguments. If ambiguous, call `page_list()` to find matching titles/slugs.
2. Call `page_get` with `page_id_or_slug`:
   ```json
   { "page_id_or_slug": "<slug_or_id>" }
   ```
3. Inspect existing `sections` and metadata.

### Step 2: Apply Targeted Modifications
1. **Preserve Intact Sections**: Never wipe out existing sections that the user didn't ask to change.
2. **Modify Requested Section**: Update specific fields within the matching section object (e.g. modify headline in `sc_hero`, or add an item to `faq`).
3. **Add New Sections**: Append or insert new section objects in the appropriate layout order.
4. **Remove Sections**: Only remove a section if the user explicitly requested its removal.

### Step 3: Execute Update
Call `page_update` with:
```json
{
  "page_id_or_slug": "<slug_or_id>",
  "sections": <updated_sections_array>,
  "title": "<optional_updated_title>",
  "excerpt": "<optional_updated_excerpt>"
}
```

### Step 4: Confirmation
1. Detail the exact changes applied (e.g. "Updated hero headline", "Appended 3 FAQs").
2. Provide page status (Draft or Live) and link: `/pages/<slug>`.
