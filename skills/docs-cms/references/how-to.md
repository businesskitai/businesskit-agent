# How-To: Publishing BusinessKit Documentation from Outside the App (MCP & Turso DB)

This guide documents the exact workflow, database schemas, semantic rules, and automation scripts used to author, manage, and publish documentation for **BusinessKit** from outside the desktop app (e.g. using an autonomous AI coding agent via MCP or direct database execution).

---

## 1. Operating Rules & Core Constraints

Whenever authoring or publishing docs, these constraints must always be respected:

| Constraint | Value / Rule | Why / Notes |
| :--- | :--- | :--- |
| **Target Profile** | `4628a5b1-ac05-4156-9d76-04bbd71119a1` | Profile title: **"BusinessKit"** (slug: `businesskit`). Never post to "BusinessKit India" or personal profiles. |
| **Category ID** | `cat_32` | Canonical identifier for the **docs** category. All documentation articles and subcollections must have `category_id = 'cat_32'`. |
| **Doc Title** | **$\le$ 3 words strictly** | E.g., `What Are Pages`, `Create New Page`, `Visual Page Editor`, `Install BusinessKit`. |
| **SEO Title** | Prefixed with Domain | E.g., `Pages: Visual Drag and Drop Canvas Editor`, `Deploy: Connect Cloudflare Pages`. |
| **No `<h1>` in HTML** | Prohibited in body | The article title is rendered by the layout as the primary `<h1>`. Body headings must start with `<h2>` then `<h3>`. |
| **Accordions** | Collapsed by default | Must have `isOpen = false` and `aria-expanded="false"`. |
| **Task Lists** | Pure semantic structure | No bullet markers. Uses vector SVG checkmarks without border hacks. |
| **Status Column** | `published = 1` | The database column is `published` (integer `1` or `0`). There is **no `status` column** and **no `summary` column** in `content`. |

---

## 2. Database Architecture & Table Schemas

BusinessKit uses Turso (libSQL). Tech docs are powered by two primary tables:

### A. `collections` Table Schema

Organizes the sidebar navigation into root domains and nested subcollections.

```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,          -- e.g., 'col_website', 'col_pg_start'
  title TEXT NOT NULL,          -- e.g., 'Website & Pages', 'Get Started'
  slug TEXT NOT NULL,           -- e.g., 'pages', 'pg-get-started'
  category_id TEXT,             -- MUST be 'cat_32' for docs
  parent_id TEXT,               -- NULL for root collections, parent id for subcollections
  order_index INTEGER,          -- Sequence number (1..20 for root; 1..n for subcollections)
  sort_order INTEGER,           -- Legacy sort weight (e.g. order_index * 10)
  icon TEXT,                    -- Optional emoji or icon identifier
  description TEXT              -- Optional collection summary
);
```

#### Canonical Root Collection Order (`parent_id IS NULL`):
1. `col_docs_1` — Getting Started (`getting-started`)
2. `col_apps` — Apps (`apps`)
3. `col_dashboard` — Dashboard (`dashboard`)
4. `col_shop` — Shop (`shop`)
5. `col_products_inventory` — Products & Inventory (`products-inventory`)
6. `col_restaurant_cafe` — Restaurant & Café (`restaurant-cafe`)
7. `col_hotel_stays` — Hotel & Stays (`hotel-stays`)
8. `col_tax` — Tax (`tax`)
9. `col_accounts` — Accounts (`accounts`)
10. `col_link_in_bio` — Link in Bio (`link-in-bio`)
11. `col_website` — Website & Pages (`pages`)
12. `col_deploy` — Deploy (`deploy`)
13. `col_crm` — Crm (`crm`)
14. `col_social` — Social Media (`social`)
15. `col_store` — Online Store (`store`)
16. `col_content_cms` — Content & CMS (`content`)
17. `col_chat_agent` — Chat Agent (`chat-agent`)
18. `col_agents` — Autonomous Agents (`agents`)
19. `col_settings_account` — Settings & Account (`settings-account`)
20. `col_help_support` — Help & Support (`help`)
50. `col_fc5e3fb2c532` — Architecture & Core Systems (`architecture-core-systems`)
51. `col_docs_5` — API & Integrations (`api-and-integrations`)

> [!NOTE]
> Main collection titles must be **Capitalized, not ALL CAPITAL** (e.g. `Crm` instead of `CRM`). The sidebar auto-capitalizes via `formatCollectionTitle()`, but database consistency is preferred.

---

### B. `content` Table Schema

Holds the actual documentation articles and markdown/HTML payloads.

```sql
INSERT INTO content (
  id,                   -- Primary key, e.g. 'post_what_are_pages'
  profile_id,           -- '4628a5b1-ac05-4156-9d76-04bbd71119a1' ("BusinessKit")
  user_id,              -- Creator user ID
  updated_by,           -- Updating user ID
  title,                -- 3 words max, e.g. 'What Are Pages'
  slug,                 -- URL slug, e.g. 'what-are-pages'
  content,              -- Pure semantic HTML (no Markdown, no <h1>)
  excerpt,              -- Concise 1-2 sentence overview for SEO & previews
  published,            -- 1 = published, 0 = draft
  category_id,          -- MUST be 'cat_32'
  collection_id,        -- Target child collection ID (e.g. 'col_pg_start')
  order_index,          -- Article display order within collection (1, 2, 3...)
  seo_title,            -- Prefixed SEO title (e.g. 'Pages: Visual Site Architecture')
  created_at,           -- Unix timestamp (seconds)
  updated_at            -- Unix timestamp (seconds)
) VALUES (...);
```

> [!WARNING]
> Do **NOT** pass `status: 'published'` or `summary: '...'` in your SQL queries. The columns are `published` (integer `1`) and `excerpt`.

---

## 3. Semantic HTML Guidelines for `content`

When writing the article body HTML:

### A. Section Headings
```html
<h2>First Major Topic</h2>
<p>Explaining the architecture and functionality.</p>

<h3>Subtopic or Specific Flow</h3>
<p>Step-by-step description.</p>
```

### B. Task Lists & Checkboxes
Task lists must use the standard TipTap/Docs schema:
```html
<ul data-type="taskList" class="task-list tech-task-list">
  <li data-type="taskItem" class="task-list-item tech-task-item">
    <label><input type="checkbox" checked="checked" /></label>
    <div><p>Complete initial setup in the Pages workspace.</p></div>
  </li>
  <li data-type="taskItem" class="task-list-item tech-task-item">
    <label><input type="checkbox" /></label>
    <div><p>Attach custom components to the canvas.</p></div>
  </li>
</ul>
```

### C. Collapsible Accordions (Must Be Collapsed by Default)
```html
<div data-type="accordion-group" class="tech-accordion-group">
  <div data-type="accordion-item" class="tech-accordion-item" aria-expanded="false">
    <div data-type="accordion-title" class="tech-accordion-title">How do templates differ from native sections?</div>
    <div data-type="accordion-content" class="tech-accordion-content" hidden="hidden">
      <p>Native sections adapt their colors to the profile theme token automatically, while templates provide full-page layouts.</p>
    </div>
  </div>
</div>
```

### D. Callout Cards
```html
<div data-type="info-card" class="tech-callout tech-callout--info" role="note">
  <p><strong>Note:</strong> Changes made in the Visual Editor are auto-saved locally before publishing.</p>
</div>
```

### E. Code Blocks
Always HTML-escape `<` as `&lt;` and `>` as `&gt;`:
```html
<pre><code class="language-bash">npm run build
curl -X POST https://api.businesskit.io/v1/pages</code></pre>
```

---

## 4. Publishing Methods

### Method A: Via BusinessKit MCP Tools

If the agent environment has the `businesskit` MCP server loaded:

1. **Verify / Switch Active Profile**:
   ```json
   // 1. List profiles to confirm ID
   call_mcp_tool("businesskit", "profile_list", {})

   // 2. Switch if not already on BusinessKit profile
   call_mcp_tool("businesskit", "profile_switch", {
     "profile_id": "4628a5b1-ac05-4156-9d76-04bbd71119a1"
   })
   ```

2. **Publish Content**:
   ```json
   call_mcp_tool("businesskit", "blog_post_create", {
     "title": "What Are Pages",
     "slug": "what-are-pages",
     "category_id": "cat_32",
     "collection_id": "col_pg_start",
     "body_html": "<h2>Overview</h2><p>Pages visual builder...</p>",
     "excerpt": "Visual website builder overview for BusinessKit.",
     "seo_title": "Pages: Overview and Visual Site Architecture",
     "published": 1
   })
   ```

---

### Method B: Via Direct Turso Database Script (Recommended for Batch Docs)

When managing a domain with 5–30 articles and nested collections, executing a Node.js batch script is the fastest, atomic, and most reliable method.

#### 1. Database Connection Utility (`turso-userdb.js`)

```javascript
// scratch/turso-userdb.js
const fs = require('fs');
const path = require('path');

// Extract user DB credentials from credentials cache or env
const credsPath = path.join(process.env.HOME, 'Library/Application Support/io.businesskit.app/credentials.json');
let dbUrl = process.env.TURSO_USER_DATABASE_URL;
let dbToken = process.env.TURSO_USER_AUTH_TOKEN;

if (!dbUrl && fs.existsSync(credsPath)) {
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  dbUrl = creds.user_db_url;
  dbToken = creds.user_db_token;
}

async function execute(sql, args = []) {
  const endpoint = `${dbUrl.replace(/^libsql:\/\//, 'https://')}/v2/pipeline`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${dbToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args } }],
    }),
  });

  const json = await response.json();
  if (json.results?.[0]?.type === 'error') {
    throw new Error(`SQLite error: ${json.results[0].error.message}`);
  }
  return json.results?.[0]?.response?.result;
}

module.exports = { execute };
```

#### 2. Batch Collection & Article Publishing Script Template

```javascript
// scratch/publish-domain-docs.js
const fs = require('fs');
const path = require('path');
const { execute } = require('./turso-userdb');

const PROFILE_ID = '4628a5b1-ac05-4156-9d76-04bbd71119a1';
const USER_ID = 'a1b2c3d4-0001-4000-8000-000000000001';
const CATEGORY_ID = 'cat_32';

async function main() {
  console.log("Setting up collections...");
  
  // 1. Create or update Parent Root Collection
  await execute(`
    INSERT INTO collections (id, title, slug, category_id, parent_id, order_index, sort_order)
    VALUES ('col_domain', 'Domain Title', 'domain-slug', '${CATEGORY_ID}', NULL, 11, 110)
    ON CONFLICT(id) DO UPDATE SET title = 'Domain Title', slug = 'domain-slug', order_index = 11
  `);

  // 2. Create Child Collections
  const subcollections = [
    { id: 'col_dom_start', title: 'Get Started', slug: 'dom-get-started', order: 1 },
    { id: 'col_dom_features', title: 'Features', slug: 'dom-features', order: 2 }
  ];

  for (const sub of subcollections) {
    await execute(`
      INSERT INTO collections (id, title, slug, category_id, parent_id, order_index, sort_order)
      VALUES ('${sub.id}', '${sub.title}', '${sub.slug}', '${CATEGORY_ID}', 'col_domain', ${sub.order}, ${sub.order * 10})
      ON CONFLICT(id) DO UPDATE SET title = '${sub.title}', slug = '${sub.slug}', parent_id = 'col_domain', order_index = ${sub.order}
    `);
  }

  // 3. Insert and Publish Articles
  const articles = [
    {
      title: "What Are Pages",
      slug: "what-are-pages",
      collection_id: "col_dom_start",
      order_index: 1,
      seo_title: "Domain: Overview and Architecture",
      excerpt: "High-level overview of the feature set.",
      html: `<h2>Overview</h2><p>Feature explanation...</p>`
    }
  ];

  const now = Math.floor(Date.now() / 1000);

  for (const art of articles) {
    const id = `post_${art.slug.replace(/-/g, '_')}`;
    const escapedContent = art.html.replace(/'/g, "''");
    const escapedExcerpt = art.excerpt.replace(/'/g, "''");
    const escapedTitle = art.title.replace(/'/g, "''");
    const escapedSeo = art.seo_title.replace(/'/g, "''");

    const sql = `INSERT INTO content (
      id, profile_id, user_id, updated_by, title, slug, content, excerpt,
      published, category_id, collection_id, order_index, seo_title,
      created_at, updated_at
    ) VALUES (
      '${id}', '${PROFILE_ID}', '${USER_ID}', '${USER_ID}', '${escapedTitle}', '${art.slug}',
      '${escapedContent}', '${escapedExcerpt}',
      1, '${CATEGORY_ID}', '${art.collection_id}', ${art.order_index}, '${escapedSeo}',
      ${now}, ${now}
    ) ON CONFLICT(id) DO UPDATE SET
      profile_id = '${PROFILE_ID}',
      title = '${escapedTitle}',
      slug = '${art.slug}',
      content = '${escapedContent}',
      excerpt = '${escapedExcerpt}',
      published = 1,
      category_id = '${CATEGORY_ID}',
      collection_id = '${art.collection_id}',
      order_index = ${art.order_index},
      seo_title = '${escapedSeo}',
      updated_at = ${now}`;

    await execute(sql);
    console.log(`Published ${art.title} -> ${art.collection_id}`);
  }
}

main().catch(console.error);
```

---

## 5. Dual Persistence: Saving Local Markdown Files

Every published documentation article must also exist as a local markdown file under:
`/Users/2.o/businesskit/documentation/content/<domain>/<slug>.md`

### Markdown File Format with YAML Frontmatter

```markdown
---
title: "What Are Pages"
slug: "what-are-pages"
seo_title: "Pages: Overview and Visual Site Architecture"
excerpt: "Understand how Pages lets you build responsive storefronts and landing pages with custom components."
collection_id: "col_pg_start"
category_id: "cat_32"
order_index: 1
published: true
created_at: 1732204800
---

<h2>Visual Site Architecture</h2>
<p>Pages is BusinessKit's visual website builder...</p>
```

---

## 6. Verification & Health Check

After creating or updating docs, always perform these 3 verification steps:

1. **Verify Database Records**:
   ```bash
   node -e "
   const { execute } = require('./scratch/turso-userdb');
   async function test() {
     const res = await execute(\"SELECT id, title, slug, collection_id, published FROM content WHERE category_id = 'cat_32' AND collection_id = 'YOUR_COL_ID'\");
     console.log(res.rows);
   }
   test();
   "
   ```

2. **Verify Sidebar Capitalization & Typography**:
   - Confirm root collections use Capitalized words (e.g. `Crm`, not `CRM`).
   - Confirm font weights use `400` with `-webkit-font-smoothing: antialiased`.

3. **Run Web Production Build**:
   ```bash
   npm --prefix /Users/2.o/businesskit/businesskit-web run build
   ```
   Must output:
   - `✓ Built client modules`
   - `✓ Built server (ssr) modules`
   - `✓ Type checked`
   - `✓ Lint checked`
   - Zero compilation or SSR routing errors.
