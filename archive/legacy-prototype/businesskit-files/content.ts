// ─────────────────────────────────────────────────────────────────────────────
// Content Schema — UserDB tables
// Provisioned via provision.ts → provisionUserDatabase()
//
// Shared Content Columns:
// - ai_summary, custom_design
//
// GEO Columns (per-table, see GEO_INFRASTRUCTURE.md):
//   posts           → seo_title, seo_description, seo_keywords,
//                     word_count, reading_time_mins, internal_links, external_links, sources
//   newsletter, guides, notes → word_count, sources
//   compare, alternative, prompt, skills → sources
//   doc_articles    → sources
//
// content_type omitted — the table name already encodes the type.
// ─────────────────────────────────────────────────────────────────────────────

export const CONTENT_SCHEMA_SQL: string[] = [
  // ── content (unified main table) ──
  `CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    cms_id TEXT,
    category_id TEXT,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    content TEXT,
    excerpt TEXT,
    hero_image_url TEXT,
    cta_button_url TEXT,
    cta_button_text TEXT,
    additional_details TEXT DEFAULT '[]',
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    date TEXT,
    collection_id TEXT,
    hide_author INTEGER NOT NULL DEFAULT 0,
    image_ads TEXT DEFAULT NULL,
    add_product TEXT DEFAULT '[]',
    add_people TEXT DEFAULT '[]',
    video_url TEXT,
    files_url TEXT DEFAULT '[]',
    faqs TEXT DEFAULT '{}',
    ai_summary TEXT,
    custom_design TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,
    word_count INTEGER,
    reading_time_mins INTEGER,
    internal_links INTEGER,
    external_links INTEGER,
    sources TEXT,
    sent_count INTEGER DEFAULT 0,
    location TEXT,
    social_links TEXT DEFAULT '[]',
    website TEXT,
    logo_url TEXT,
    name TEXT,
    tagline TEXT,
    highlights TEXT DEFAULT '[]',
    hide_info INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_profile ON content (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_content_collection ON content (collection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_cms ON content (cms_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_category ON content (category_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_content_profile_category_slug ON content (profile_id, category_id, slug)`,

  // ── content_reaction ──
  `CREATE TABLE IF NOT EXISTS content_reaction (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    user_id TEXT,
    reaction_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_reaction_content ON content_reaction (content_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_reaction_profile ON content_reaction (profile_id)`,

  // ── content_comment ──
  `CREATE TABLE IF NOT EXISTS content_comment (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    user_id TEXT,
    author_name TEXT,
    author_email TEXT,
    content TEXT NOT NULL,
    parent_id TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_comment_content ON content_comment (content_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_comment_profile ON content_comment (profile_id)`,

  // ── cms (userDB only) ──
  `CREATE TABLE IF NOT EXISTS cms (
    id TEXT PRIMARY KEY,
    profile_id TEXT,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT,
    nav_active INTEGER DEFAULT 1,
    menu_active INTEGER DEFAULT 1,
    footer_active INTEGER DEFAULT 1,
    section TEXT,
    subscribe_form INTEGER DEFAULT 1,
    ads_code_sidebar TEXT,
    ads_code_top TEXT,
    ads_code_bottom TEXT,
    hide_info INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cms_profile ON cms (profile_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_profile_slug ON cms (profile_id, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_cms_category_id ON cms (category_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_profile_category ON cms (profile_id, category_id)`,

  // ── content_views (append only per unique views) ──
  `CREATE TABLE IF NOT EXISTS content_views (
    id TEXT PRIMARY KEY,
    content_id TEXT,
    doc_id INTEGER,
    product_id TEXT,
    form_id TEXT,
    job_listing_id TEXT,
    community_id TEXT,
    page_id TEXT,
    profile_id TEXT NOT NULL,
    viewer_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    device TEXT,
    os TEXT,
    browser TEXT,
    referrer TEXT,
    country TEXT,
    city TEXT,
    timezone TEXT,
    is_bot INTEGER DEFAULT 0,
    viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_views_content ON content_views (content_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_views_profile ON content_views (profile_id)`,

  // ── content_analytics (1 row/content) ──
  `CREATE TABLE IF NOT EXISTS content_analytics (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    bot_views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    total_reactions INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    os_breakdown TEXT NOT NULL DEFAULT '{}',
    browser_breakdown TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    city_breakdown TEXT NOT NULL DEFAULT '{}',
    referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    views_7d TEXT NOT NULL DEFAULT '[]',
    views_30d TEXT NOT NULL DEFAULT '[]',
    views_12m TEXT NOT NULL DEFAULT '[]',
    views_lifetime TEXT NOT NULL DEFAULT '{}',
    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_analytics_profile ON content_analytics (profile_id)`,

  // ── cms_analytics (1 row/content-type) ──
  `CREATE TABLE IF NOT EXISTS cms_analytics (
    id TEXT PRIMARY KEY,
    cms_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    total_posts INTEGER NOT NULL DEFAULT 0,
    total_draft INTEGER NOT NULL DEFAULT 0,
    total_published INTEGER NOT NULL DEFAULT 0,
    bot_views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    total_reactions INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    total_submissions INTEGER NOT NULL DEFAULT 0,
    total_applications INTEGER NOT NULL DEFAULT 0,
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    os_breakdown TEXT NOT NULL DEFAULT '{}',
    browser_breakdown TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    city_breakdown TEXT NOT NULL DEFAULT '{}',
    referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    views_7d TEXT NOT NULL DEFAULT '[]',
    views_30d TEXT NOT NULL DEFAULT '[]',
    views_12m TEXT NOT NULL DEFAULT '[]',
    views_lifetime TEXT NOT NULL DEFAULT '{}',
    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cms_analytics_profile ON cms_analytics (profile_id)`,

  // ── doc_analytics (1 row/doc) ──
  `CREATE TABLE IF NOT EXISTS doc_analytics (
    id TEXT PRIMARY KEY,
    doc_id INTEGER NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    bot_views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    sad INTEGER NOT NULL DEFAULT 0,
    neutral INTEGER NOT NULL DEFAULT 0,
    happy INTEGER NOT NULL DEFAULT 0,
    total_reactions INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    os_breakdown TEXT NOT NULL DEFAULT '{}',
    browser_breakdown TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    city_breakdown TEXT NOT NULL DEFAULT '{}',
    referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    views_7d TEXT NOT NULL DEFAULT '[]',
    views_30d TEXT NOT NULL DEFAULT '[]',
    views_12m TEXT NOT NULL DEFAULT '[]',
    views_lifetime TEXT NOT NULL DEFAULT '{}',
    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_doc_analytics_profile ON doc_analytics (profile_id)`,

  // ── /docs (doc_collections AND doc_articles) ──
  `CREATE TABLE IF NOT EXISTS doc_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_doc_collections_slug ON doc_collections (slug)`,

  `CREATE TABLE IF NOT EXISTS doc_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    profile_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    body TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    hide_author INTEGER NOT NULL DEFAULT 0,
    image_ads TEXT DEFAULT NULL,
    add_product TEXT DEFAULT '[]',
    add_people TEXT DEFAULT '[]',
    video_url TEXT,
    files_url TEXT DEFAULT '[]',
    faqs TEXT DEFAULT '{}',
    views INTEGER NOT NULL DEFAULT 0,
    votes_json TEXT NOT NULL DEFAULT '{"sad":0,"neutral":0,"happy":0}',
    ai_summary TEXT,
    custom_design TEXT,
    sources TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_doc_articles_collection ON doc_articles (collection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_doc_articles_profile ON doc_articles (profile_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_doc_articles_slug ON doc_articles (profile_id, slug)`
];

export const DEFAULT_CMS_PAGES = [
  { id: 'cc55cc55-0001-4000-8000-000000000101', title: 'Docs', description: 'Documentation and Support', slug: 'docs', category_id: 'cat_32' },
  { id: 'cc55cc55-0001-4000-8000-000000000102', title: 'Blog', description: 'Read the latest blog', slug: 'blog', category_id: 'cat_35' },
  { id: 'cc55cc55-0001-4000-8000-000000000103', title: 'Notes', description: 'Share Notes with audience', slug: 'notes', category_id: 'cat_37' },
  { id: 'cc55cc55-0001-4000-8000-000000000104', title: 'Guides', description: 'Share guides to your subscribers', slug: 'guides', category_id: 'cat_36' },
  { id: 'cc55cc55-0001-4000-8000-000000000105', title: 'Newsletter', description: 'Newsletter subscriptions', slug: 'n', category_id: 'cat_20' },
  { id: 'cc55cc55-0001-4000-8000-000000000106', title: 'Forms', description: 'Fill the form', slug: 'forms', category_id: 'cat_34' },
  { id: 'cc55cc55-0001-4000-8000-000000000107', title: 'Jobs', description: 'Jobs Listing for hiring', slug: 'jobs', category_id: 'cat_31' },
  { id: 'cc55cc55-0001-4000-8000-000000000108', title: 'Links', description: 'General links and bookmarks', slug: 'links', category_id: 'cat_1' },
  { id: 'cc55cc55-0001-4000-8000-000000000109', title: 'Skills', description: 'Highlight your Skills', slug: 'skills', category_id: 'cat_38' },
  { id: 'cc55cc55-0001-4000-8000-000000000110', title: 'Prompt', description: 'Share AI Prompts', slug: 'prompt', category_id: 'cat_39' },
  { id: 'cc55cc55-0001-4000-8000-000000000111', title: 'Compare', description: 'Compare options', slug: 'compare', category_id: 'cat_40' },
  { id: 'cc55cc55-0001-4000-8000-000000000112', title: 'Alternative', description: 'List alternatives', slug: 'alternative', category_id: 'cat_41' },
  { id: 'cc55cc55-0001-4000-8000-000000000113', title: 'Listing', description: 'Real estate or item listings', slug: 'listing', category_id: 'cat_27' },
  { id: 'cc55cc55-0001-4000-8000-000000000114', title: 'Booking', description: 'Schedule appointments', slug: 'booking', category_id: 'cat_30' },
  { id: 'cc55cc55-0001-4000-8000-000000000115', title: 'Services', description: 'Offer professional services', slug: 'services', category_id: 'cat_25' },
  { id: 'cc55cc55-0001-4000-8000-000000000116', title: 'Courses', description: 'Educational courses', slug: 'courses', category_id: 'cat_18' },
  { id: 'cc55cc55-0001-4000-8000-000000000117', title: 'Sponsorship', description: 'Sponsorship opportunities', slug: 'sponsorship', category_id: 'cat_21' },
  { id: 'cc55cc55-0001-4000-8000-000000000118', title: 'Downloads', description: 'Digital downloads', slug: 'downloads', category_id: 'cat_19' },
  { id: 'cc55cc55-0001-4000-8000-000000000119', title: 'Events', description: 'Upcoming events', slug: 'events', category_id: 'cat_8' },
  { id: 'cc55cc55-0001-4000-8000-000000000120', title: 'Posts', description: 'Short posts and updates', slug: 'posts', category_id: 'cat_45' },
  { id: 'cc55cc55-0001-4000-8000-000000000121', title: 'Meetings', description: 'Schedule meetings', slug: 'meetings', category_id: 'cat_22' },
  { id: 'cc55cc55-0001-4000-8000-000000000122', title: 'Webinars', description: 'Host webinars', slug: 'webinars', category_id: 'cat_24' },
  { id: 'cc55cc55-0001-4000-8000-000000000123', title: 'Community', description: 'Join our community', slug: 'community', category_id: 'cat_42' },
  { id: 'cc55cc55-0001-4000-8000-000000000124', title: 'Pages', description: 'Custom pages', slug: 'page', category_id: 'cat_47' },
];

export const CONTENT_TRIGGERS_SQL: string[] = [

  `DROP TRIGGER IF EXISTS trg_content_insert`,
  `DROP TRIGGER IF EXISTS trg_content_update_published`,
  `DROP TRIGGER IF EXISTS trg_content_delete`,
  `DROP TRIGGER IF EXISTS trg_content_view_insert`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 1 — Content inserted
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_content_insert
   AFTER INSERT ON content
   WHEN NEW.cms_id IS NOT NULL
    BEGIN
      INSERT OR IGNORE INTO content_analytics (
        id, content_id, profile_id
      ) VALUES (
        hex(randomblob(16)), NEW.id, NEW.profile_id
      );

      INSERT INTO cms_analytics (
        id,
        cms_id,
        profile_id,
        total_posts,
        total_published,
        total_draft,
        created_at,
        updated_at
      )
      VALUES (
        hex(randomblob(16)),
        NEW.cms_id,
       NEW.profile_id,
       1,
       CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
       CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
       strftime('%Y-%m-%dT%H:%M:%SZ','now'),
       strftime('%Y-%m-%dT%H:%M:%SZ','now')
     )
     ON CONFLICT(cms_id) DO UPDATE SET
       total_posts     = total_posts + 1,
       total_published = total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
       total_draft     = total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now');
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 2 — Content published status changed
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_content_update_published
   AFTER UPDATE OF published ON content
   WHEN NEW.cms_id IS NOT NULL AND NEW.published != OLD.published
   BEGIN
     UPDATE cms_analytics SET
       total_published = MAX(0, total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE -1 END),
       total_draft     = MAX(0, total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE -1 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = NEW.cms_id;
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 3 — Content deleted
  // ─────────────────────────────────────────────────────────────────────────────
  `CREATE TRIGGER IF NOT EXISTS trg_content_delete
   AFTER DELETE ON content
   WHEN OLD.cms_id IS NOT NULL
   BEGIN
     UPDATE cms_analytics SET
       total_posts     = MAX(0, total_posts - 1),
       total_published = MAX(0, total_published - CASE WHEN OLD.published = 1 THEN 1 ELSE 0 END),
       total_draft     = MAX(0, total_draft - CASE WHEN OLD.published = 0 THEN 1 ELSE 0 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = OLD.cms_id;
   END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 4 — Content view inserted
  // ─────────────────────────────────────────────────────────────────────────────
   `CREATE TRIGGER IF NOT EXISTS trg_content_view_insert
    AFTER INSERT ON content_views
    BEGIN
      -- 1. Profile-level views
      UPDATE profile_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END,
        updated_at = strftime('%s','now')
      WHERE profile_id = NEW.profile_id;

      -- 2. Entity-specific views
      UPDATE content_analytics SET 
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.content_id IS NOT NULL AND content_id = NEW.content_id;
      
      UPDATE product_analytics SET 
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.product_id IS NOT NULL AND product_id = NEW.product_id;
      
      UPDATE job_analytics SET 
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.job_listing_id IS NOT NULL AND job_id = NEW.job_listing_id;
      
      UPDATE form_analytics SET 
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.form_id IS NOT NULL AND form_id = NEW.form_id;
      
      UPDATE community_analytics SET 
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.community_id IS NOT NULL AND community_id = NEW.community_id;
      
      UPDATE page_analytics SET 
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.page_id IS NOT NULL AND page_id = NEW.page_id;

      UPDATE doc_analytics SET 
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END
      WHERE NEW.doc_id IS NOT NULL AND doc_id = NEW.doc_id;

      -- 3. CMS-level views (determine category dynamically)
      UPDATE cms_analytics SET
        total_views = total_views + CASE WHEN NEW.is_bot = 0 THEN 1 ELSE 0 END,
        bot_views = bot_views + CASE WHEN NEW.is_bot = 1 THEN 1 ELSE 0 END,
        updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE cms_id = (
        CASE
          WHEN NEW.content_id IS NOT NULL THEN (SELECT cms_id FROM content WHERE id = NEW.content_id)
          WHEN NEW.product_id IS NOT NULL THEN (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = (SELECT category_id FROM products WHERE id = NEW.product_id))
          WHEN NEW.job_listing_id IS NOT NULL THEN (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_31')
          WHEN NEW.form_id IS NOT NULL THEN (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_34')
          WHEN NEW.page_id IS NOT NULL THEN (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_47')
          WHEN NEW.community_id IS NOT NULL THEN (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_42')
          WHEN NEW.doc_id IS NOT NULL THEN (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_32')
          ELSE NULL
        END
      );
    END`,

  // ─────────────────────────────────────────────────────────────────────────────
  // TRIGGER 5 — Doc article inserted
  // ─────────────────────────────────────────────────────────────────────────────
   `CREATE TRIGGER IF NOT EXISTS trg_doc_article_insert
    AFTER INSERT ON doc_articles
    BEGIN
      INSERT OR IGNORE INTO doc_analytics (
        id, doc_id, profile_id
      ) VALUES (
        hex(randomblob(16)), NEW.id, NEW.profile_id
      );
    END`,
];

