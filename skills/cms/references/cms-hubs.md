# Canonical CMS Hubs Catalog

This reference lists all 30 built-in canonical CMS hubs in BusinessKit with their canonical slugs (`content_type`), display titles, default `category_id`, and `cms_id` (`src-tauri/src/commands/agents/tools/content.rs`).

---

## Canonical CMS Hubs Reference Table

| Title | Slug / `content_type` | `category_id` | `cms_id` | Purpose / Description |
| :--- | :--- | :--- | :--- | :--- |
| **Docs** | `docs` | `cat_32` | `cc55cc55-0001-4000-8000-000000000032` | Documentation, help center, and support articles |
| **Blog** | `blog` | `cat_35` | `cc55cc55-0001-4000-8000-000000000035` | Company announcements, insights, and articles |
| **Guides** | `guides` | `cat_36` | `cc55cc55-0001-4000-8000-000000000036` | Actionable how-to tutorials and step walkthroughs |
| **Notes** | `notes` | `cat_37` | `cc55cc55-0001-4000-8000-000000000037` | Short memos, changelogs, TILs, and audience notes |
| **Newsletter** | `n` | `cat_20` | `cc55cc55-0001-4000-8000-000000000020` | Reader-letter issues, curated digests, and CTAs |
| **Skills** | `skills` | `cat_38` | `cc55cc55-0001-4000-8000-000000000038` | Skill showcases and capability highlights |
| **Prompt** | `prompt` | `cat_39` | `cc55cc55-0001-4000-8000-000000000039` | Copyable AI prompts and templates |
| **Compare** | `compare` | `cat_40` | `cc55cc55-0001-4000-8000-000000000040` | Head-to-head product and plan comparisons |
| **Alternative** | `alternative` | `cat_41` | `cc55cc55-0001-4000-8000-000000000041` | Software & service alternatives lists |
| **Tools** | `tools` | `cat_2` | `cc55cc55-0001-4000-8000-000000000002` | Recommended developer tools and resources |
| **AI Tools** | `ai-tools` | `cat_51` | `cc55cc55-0001-4000-8000-000000000051` | Curated AI software and productivity apps |
| **Videos** | `videos` | `cat_46` | `cc55cc55-0001-4000-8000-000000000046` | Video library and embedded tutorials |
| **Podcast** | `podcast` | `cat_48` | `cc55cc55-0001-4000-8000-000000000048` | Podcast show notes, episodes, and audio links |
| **Courses** | `courses` | `cat_18` | `cc55cc55-0001-4000-8000-000000000018` | Educational lessons, modules, and courses |
| **Downloads** | `downloads` | `cat_19` | `cc55cc55-0001-4000-8000-000000000019` | Digital files, templates, and downloadable assets |
| **Events** | `events` | `cat_8` | `cc55cc55-0001-4000-8000-000000000008` | In-person and virtual upcoming events |
| **Webinars** | `webinars` | `cat_24` | `cc55cc55-0001-4000-8000-000000000024` | Live and recorded webinar sessions |
| **Services** | `services` | `cat_25` | `cc55cc55-0001-4000-8000-000000000025` | Professional service offerings and scopes |
| **Posts** | `posts` | `cat_45` | `cc55cc55-0001-4000-8000-000000000045` | Quick social-style posts and micro-updates |
| **Jobs** | `jobs` | `cat_31` | `cc55cc55-0001-4000-8000-000000000031` | Job openings and hiring listings |
| **Links** | `links` | `cat_1` | `cc55cc55-0001-4000-8000-000000000001` | Curated bookmarks and external links |
| **Forms** | `forms` | `cat_34` | `cc55cc55-0001-4000-8000-000000000034` | Lead capture and client intake forms |
| **Listing** | `listing` | `cat_27` | `cc55cc55-0001-4000-8000-000000000027` | Real estate, directory, or item listings |
| **Booking** | `booking` | `cat_30` | `cc55cc55-0001-4000-8000-000000000030` | Appointment and consultation bookings |
| **Sponsorship**| `sponsorship` | `cat_21` | `cc55cc55-0001-4000-8000-000000000021` | Sponsorship tiers and media kit packages |
| **Meetings** | `meetings` | `cat_22` | `cc55cc55-0001-4000-8000-000000000022` | Schedule meetings and call links |
| **Community** | `community` | `cat_42` | `cc55cc55-0001-4000-8000-000000000042` | Community announcements and membership info |
| **Pages** | `page` | `cat_47` | `cc55cc55-0001-4000-8000-000000000047` | Standalone CMS landing pages |
| **Shop** | `shop` | `cat_6` | `cc55cc55-0001-4000-8000-000000000006` | In-store shop listings and catalog |
| **Store** | `store` | `cat_5` | `cc55cc55-0001-4000-8000-000000000005` | Online e-commerce store catalog |

---

## Dynamic Hub Resolution Rules

1. **Tool Invocation**:
   When invoking `blog_post_create` or `content_list`, you can supply either:
   - `category_id` (e.g. `"cat_35"`)
   - OR `content_type` (e.g. `"blog"`)
   - OR `cms_id` (e.g. `"cc55cc55-0001-4000-8000-000000000035"`)
   The native BusinessKit MCP server resolves all three aliases interchangeably.

2. **User-Created Custom Hubs**:
   - If a user creates a new custom hub in the app (e.g., "Case Studies" or "Changelog"), BusinessKit automatically assigns a new `category_id` and unique `cms_id`.
   - Call `content_list()` to dynamically discover all available hubs on the user's active profile.
