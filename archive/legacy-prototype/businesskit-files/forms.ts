// ─────────────────────────────────────────────────────────────────────────────
// Forms Schema — UserDB tables (4 tables)
// All live in the user's own Turso instance, provisioned via provision.ts
// ─────────────────────────────────────────────────────────────────────────────

export const FORMS_SCHEMA_SQL: string[] = [
  // ── forms ───────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    thank_you_settings TEXT,
    collection_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    options TEXT,
    embed_url TEXT,
    required INTEGER NOT NULL DEFAULT 0,
    settings TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    answers TEXT NOT NULL DEFAULT '{}',
    last_question_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'viewed',
    device TEXT,
    os TEXT,
    browser TEXT,
    referrer TEXT,
    city TEXT,
    country TEXT,
    timezone TEXT,
    ip_address TEXT,
    user_agent TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    started_at TEXT,
    submitted_at TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS form_analytics (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL UNIQUE,
    bot_views INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    views_device_breakdown TEXT NOT NULL DEFAULT '{}',
    views_os_breakdown TEXT NOT NULL DEFAULT '{}',
    views_browser_breakdown TEXT NOT NULL DEFAULT '{}',
    views_country_breakdown TEXT NOT NULL DEFAULT '{}',
    views_city_breakdown TEXT NOT NULL DEFAULT '{}',
    views_referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    views_7d TEXT NOT NULL DEFAULT '[]',
    views_30d TEXT NOT NULL DEFAULT '[]',
    views_12m TEXT NOT NULL DEFAULT '[]',
    views_lifetime TEXT NOT NULL DEFAULT '{}',
    visits INTEGER NOT NULL DEFAULT 0,
    starts INTEGER NOT NULL DEFAULT 0,
    partials INTEGER NOT NULL DEFAULT 0,
    submissions INTEGER NOT NULL DEFAULT 0,
    avg_completion_ms INTEGER NOT NULL DEFAULT 0,
    trends_7d TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0]',
    trends_30d TEXT NOT NULL DEFAULT '[]',
    trends_12m TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
    lifetime TEXT NOT NULL DEFAULT '{}',
    device TEXT NOT NULL DEFAULT '{}',
    os TEXT NOT NULL DEFAULT '{}',
    browser TEXT NOT NULL DEFAULT '{}',
    referrer TEXT NOT NULL DEFAULT '{}',
    country TEXT NOT NULL DEFAULT '{}',
    city TEXT NOT NULL DEFAULT '{}',
    utm_source TEXT NOT NULL DEFAULT '{}',
    utm_medium TEXT NOT NULL DEFAULT '{}',
    utm_campaign TEXT NOT NULL DEFAULT '{}',
    last_aggregated_at INTEGER,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_forms_profile ON forms (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_forms_slug ON forms (slug)`,
  `CREATE INDEX IF NOT EXISTS idx_forms_collection ON forms (collection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_form ON questions (form_id, position ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_form ON submissions (form_id, created_at DESC)`
];

export const FORMS_TRIGGERS_SQL: string[] = [
  `DROP TRIGGER IF EXISTS trg_submission_insert`,
  `DROP TRIGGER IF EXISTS trg_submission_delete`,
  `DROP TRIGGER IF EXISTS trg_form_insert`,
  `DROP TRIGGER IF EXISTS trg_form_update_published`,
  `DROP TRIGGER IF EXISTS trg_form_delete`,

  `DROP TRIGGER IF EXISTS trg_submissions_no_delete`,

  `CREATE TRIGGER IF NOT EXISTS trg_submissions_no_delete
   BEFORE DELETE ON submissions
   BEGIN SELECT RAISE(ABORT, 'submissions are append-only'); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_submission_insert
   AFTER INSERT ON submissions
   BEGIN
     -- Update form_analytics
     UPDATE form_analytics SET
       submissions = submissions + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE form_id = NEW.form_id;

     -- Update cms_analytics for cat_34 (Forms)
     UPDATE cms_analytics SET
       total_submissions = total_submissions + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = (SELECT profile_id FROM forms WHERE id = NEW.form_id) AND category_id = 'cat_34');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_form_insert
   AFTER INSERT ON forms
   BEGIN
     -- Initialize form_analytics
     INSERT OR IGNORE INTO form_analytics (id, form_id) VALUES (hex(randomblob(16)), NEW.id);

     -- Update cms_analytics for Forms (cat_34)
     UPDATE cms_analytics SET
       total_posts = total_posts + 1,
       total_published = total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE 0 END,
       total_draft     = total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE 0 END,
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_34');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_form_update_published
   AFTER UPDATE OF published ON forms
   WHEN NEW.published != OLD.published
   BEGIN
     UPDATE cms_analytics SET
       total_published = MAX(0, total_published + CASE WHEN NEW.published = 1 THEN 1 ELSE -1 END),
       total_draft     = MAX(0, total_draft + CASE WHEN NEW.published = 0 THEN 1 ELSE -1 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = NEW.profile_id AND category_id = 'cat_34');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_form_delete
   AFTER DELETE ON forms
   BEGIN
     -- Clean up form_analytics
     DELETE FROM form_analytics WHERE form_id = OLD.id;

     UPDATE cms_analytics SET
       total_posts     = MAX(0, total_posts - 1),
       total_published = MAX(0, total_published - CASE WHEN OLD.published = 1 THEN 1 ELSE 0 END),
       total_draft     = MAX(0, total_draft - CASE WHEN OLD.published = 0 THEN 1 ELSE 0 END),
       updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = OLD.profile_id AND category_id = 'cat_34');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_submission_delete
   AFTER DELETE ON submissions
   BEGIN
     -- Update form_analytics
     UPDATE form_analytics SET
       submissions = MAX(0, submissions - 1),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE form_id = OLD.form_id;

     -- Update cms_analytics for cat_34 (Forms)
     UPDATE cms_analytics SET
       total_submissions = MAX(0, total_submissions - 1),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE cms_id = (SELECT id FROM cms WHERE profile_id = (SELECT profile_id FROM forms WHERE id = OLD.form_id) AND category_id = 'cat_34');
   END`
];
