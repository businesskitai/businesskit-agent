# Canonical CMS Hubs Catalog (Categorized by Type)

This reference lists all 30 built-in canonical CMS hubs in BusinessKit, grouped into 4 distinct functional types: **Content**, **Shop (Physical Goods)**, **Store (Digital)**, and **Others** (`src-tauri/src/commands/agents/tools/content.rs`).

---

## 1. Content (Editorial, Knowledge, Media & SEO)

Used for written publishing, technical documentation, media streaming, guides, and discovery.

| Title | Slug / `content_type` | `category_id` | `cms_id` | Purpose / Description |
| :--- | :--- | :--- | :--- | :--- |
| **Docs** | `docs` | `cat_32` | `cc55cc55-0001-4000-8000-000000000032` | Documentation, help center, and support articles |
| **Blog** | `blog` | `cat_35` | `cc55cc55-0001-4000-8000-000000000035` | Company announcements, insights, and editorial articles |
| **Guides** | `guides` | `cat_36` | `cc55cc55-0001-4000-8000-000000000036` | Actionable how-to tutorials and step walkthroughs |
| **Notes** | `notes` | `cat_37` | `cc55cc55-0001-4000-8000-000000000037` | Short memos, changelogs, TILs, and audience notes |
| **Newsletter** | `n` | `cat_20` | `cc55cc55-0001-4000-8000-000000000020` | Reader email issues, curated digests, and CTAs |
| **Posts** | `posts` | `cat_45` | `cc55cc55-0001-4000-8000-000000000045` | Quick social-style posts and micro-updates |
| **Videos** | `videos` | `cat_46` | `cc55cc55-0001-4000-8000-000000000046` | Video library and embedded tutorials |
| **Podcast** | `podcast` | `cat_48` | `cc55cc55-0001-4000-8000-000000000048` | Podcast show notes, episodes, and audio links |
| **Compare** | `compare` | `cat_40` | `cc55cc55-0001-4000-8000-000000000040` | Head-to-head product and plan comparisons |
| **Alternative** | `alternative` | `cat_41` | `cc55cc55-0001-4000-8000-000000000041` | Software & service alternatives lists |
| **Prompt** | `prompt` | `cat_39` | `cc55cc55-0001-4000-8000-000000000039` | Copyable AI prompts and templates |
| **Skills** | `skills` | `cat_38` | `cc55cc55-0001-4000-8000-000000000038` | Skill showcases and capability highlights |
| **Tools** | `tools` | `cat_2` | `cc55cc55-0001-4000-8000-000000000002` | Recommended developer tools and resources |
| **AI Tools** | `ai-tools` | `cat_51` | `cc55cc55-0001-4000-8000-000000000051` | Curated AI software and productivity apps |
| **Links** | `links` | `cat_1` | `cc55cc55-0001-4000-8000-000000000001` | Curated bookmarks and external resource links |
| **Pages** | `page` | `cat_47` | `cc55cc55-0001-4000-8000-000000000047` | Standalone CMS landing pages and custom layouts |

---

## 2. Shop (Physical Goods & Retail POS)

Used exclusively for physical retail merchandise, in-store point-of-sale inventory, and physical item listings.

| Title | Slug / `content_type` | `category_id` | `cms_id` | Purpose / Description |
| :--- | :--- | :--- | :--- | :--- |
| **Shop** | `shop` | `cat_6` | `cc55cc55-0001-4000-8000-000000000006` | Physical goods, retail POS products, and store inventory |
| **Listing** | `listing` | `cat_27` | `cc55cc55-0001-4000-8000-000000000027` | Physical inventory listings, real estate, and items |

---

## 3. Store (Digital Products & Downloads)

Used for digital ecommerce, downloadable files, assets, and online educational courses.

| Title | Slug / `content_type` | `category_id` | `cms_id` | Purpose / Description |
| :--- | :--- | :--- | :--- | :--- |
| **Store** | `store` | `cat_5` | `cc55cc55-0001-4000-8000-000000000005` | Online digital storefront and ecommerce catalog |
| **Downloads** | `downloads` | `cat_19` | `cc55cc55-0001-4000-8000-000000000019` | Digital files, software packages, and downloadable assets |
| **Courses** | `courses` | `cat_18` | `cc55cc55-0001-4000-8000-000000000018` | Educational lessons, curriculum, and video courses |

---

## 4. Others (Services, Bookings, Events & Operations)

Used for professional services, appointments, calendar scheduling, live events, and business operations.

| Title | Slug / `content_type` | `category_id` | `cms_id` | Purpose / Description |
| :--- | :--- | :--- | :--- | :--- |
| **Services** | `services` | `cat_25` | `cc55cc55-0001-4000-8000-000000000025` | Professional service offerings and client deliverables |
| **Booking** | `booking` | `cat_30` | `cc55cc55-0001-4000-8000-000000000030` | Appointment and consultation bookings |
| **Meetings** | `meetings` | `cat_22` | `cc55cc55-0001-4000-8000-000000000022` | Schedule meetings, 1-on-1s, and call links |
| **Events** | `events` | `cat_8` | `cc55cc55-0001-4000-8000-000000000008` | Upcoming in-person and virtual events |
| **Webinars** | `webinars` | `cat_24` | `cc55cc55-0001-4000-8000-000000000024` | Live and recorded webinar sessions |
| **Sponsorship** | `sponsorship` | `cat_21` | `cc55cc55-0001-4000-8000-000000000021` | Sponsorship tiers and media kit packages |
| **Jobs** | `jobs` | `cat_31` | `cc55cc55-0001-4000-8000-000000000031` | Job openings, hiring posts, and career listings |
| **Community** | `community` | `cat_42` | `cc55cc55-0001-4000-8000-000000000042` | Community announcements, forums, and membership info |
| **Forms** | `forms` | `cat_34` | `cc55cc55-0001-4000-8000-000000000034` | Interactive lead capture and client intake forms |

---

## Dynamic Hub Resolution Rules

1. **Tool Invocation**:
   When invoking `blog_post_create` or `content_list`, you can supply either:
   - `category_id` (e.g. `"cat_6"` for Shop, `"cat_5"` for Store)
   - OR `content_type` (e.g. `"shop"`, `"store"`, `"blog"`, `"n"`)
   - OR `cms_id` (e.g. `"cc55cc55-0001-4000-8000-000000000006"`)
   The native BusinessKit MCP server resolves all three aliases interchangeably.

2. **User-Created Custom Hubs**:
   - If a user creates a new custom hub in the app (e.g., "Case Studies" or "Changelog"), BusinessKit automatically assigns a new `category_id` and unique `cms_id`.
   - Call `content_list()` to dynamically discover all available hubs on the user's active profile.
