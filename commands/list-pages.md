---
id: "cmd_list_pages"
name: "List Website Pages"
slash: "/list-pages"
description: "List all website pages, slugs, and publication statuses"
domain_tags: ["pages"]
required_tools: ["page_list"]
---

# List Website Pages (`/list-pages`)

Retrieve and display an inventory of all landing pages, website pages, publication statuses, and section counts.

## Available Tools
- `page_list(published_only?: boolean)`: Retrieves list of pages with id, title, slug, excerpt, published status, and update timestamps.

## Accepted Arguments
- `/list-pages` — Lists all pages (both drafts and published).
- `/list-pages published` or `/list-pages --live` — Lists only live, published pages.

## Execution Protocol

### Step 1: Query Pages
Call `page_list` with:
```json
{
  "published_only": false
}
```
(Set `published_only: true` if user requested only active/live pages.)

### Step 2: Format Output Table
Display the results in a clean markdown table:

| Title | Slug | Status | Sections | Last Updated |
| :--- | :--- | :--- | :--- | :--- |
| Home | `home` | 🟢 Live | 6 sections | 2 hours ago |
| Pricing | `pricing` | 🟡 Draft | 4 sections | Yesterday |
| About Us | `about` | 🟢 Live | 3 sections | 3 days ago |

### Step 3: Suggest Quick Actions
Offer relevant next commands:
- `/create-page <title>` to build a new page.
- `/publish-page <slug>` to toggle a draft live.
- `/update-page <slug>` to edit an existing page.
