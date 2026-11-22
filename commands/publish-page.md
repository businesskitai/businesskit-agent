---
id: "cmd_publish_page"
name: "Publish Website Page"
slash: "/publish-page"
description: "Publish a page or toggle draft status for website"
domain_tags: ["pages"]
required_tools: ["page_publish", "page_list"]
---

# Publish Website Page (`/publish-page`)

Publish a draft landing page or storefront page to make it publicly accessible, or revert a live page back to draft status.

## Available Tools

- `page_publish(page_id_or_slug: string, published?: boolean)`: Toggles publication status for a page.
- `page_list(published_only?: boolean)`: Lists existing pages to discover `id` or `slug` when not provided.

## Accepted Arguments

The user may invoke this command with:

- A page slug: `/publish-page about` or `/publish-page pricing`
- A page ID: `/publish-page pg_123`
- A draft toggle flag: `/publish-page about draft` or `/publish-page about --unpublish`
- No arguments: `/publish-page` (agent prompts or lists available pages)

## Execution Protocol

### Step 1: Resolve Target Page

1. If the user provided a slug or ID (e.g. `about`, `pricing`), use that target directly.
2. If the user did not specify which page to publish, call `page_list()` to inspect all pages in the current profile.
3. Present the list of unpublished draft pages to the user and confirm which one to publish, or ask for the page slug/title.

### Step 2: Determine Publication State

- By default, set `published: true` (or `1`) to make the page live.
- If the user explicitly mentions "unpublish", "revert to draft", or "draft", set `published: false` (or `0`).

### Step 3: Execute Publication

Call `page_publish` with:

```json
{
  "page_id_or_slug": "<target_slug_or_id>",
  "published": true
}
```

### Step 4: Verification & Response

1. Confirm the updated publication status.
2. Format a clear confirmation response:
   - **Page Title & Slug**: e.g. `About Us` (`/about`)
   - **Status**: Live (Published) or Draft (Offline)
   - **Live URL**: `https://<store-domain>/<slug>` (or `/pages/<slug>`)
   - **Next Actions**: Suggest checking live rendering or editing sections via `/update-page <slug>`.

## Safety Rules

- Never delete or drop page sections during publication.
- If `page_publish` returns an error indicating the page was not found, call `page_list()` to check available slugs and suggest matching pages.
