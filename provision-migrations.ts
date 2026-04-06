/**
 * provision-migrations.ts
 *
 * TWO things to copy into your main app's src/lib/provision.ts:
 *
 * 1. NEW_TABLES_SQL  → append each entry into SCHEMA_SQL array
 * 2. MIGRATIONS_SQL  → append each entry into MIGRATIONS_SQL array
 *
 * Both are idempotent — IF NOT EXISTS / errors ignored on ALTER TABLE.
 */

// ─── 1. New tables → add to SCHEMA_SQL in provision.ts ───────────────────────

export const NEW_TABLES_SQL = [

  // ── memory_log ─────────────────────────────────────────────────────────────
  // Rolling 20-row agent session log. Turso = synced across machines.
  // Replaces progress.md (was local-only, not synced, not queryable).
  // Visible in BusinessKit dashboard. Phase 2: in-app agent reads it too.
  `CREATE TABLE IF NOT EXISTS memory_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    session_date TEXT NOT NULL,
    agent TEXT NOT NULL,
    action TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_log_profile ON memory_log (profile_id, id DESC)`,

  // ── agent_skills ────────────────────────────────────────────────────────────
  // Agent instruction skills stored in Turso. Editable from dashboard.
  // Synced across machines. In-app agent (Phase 2) reads live from DB.
  // User edits brand-voice → agents pick it up immediately next session.
  //
  // IMPORTANT: this is NOT the /skills content page (which uses `skills` table
  // from content.ts for published skill articles). This is agent instructions.
  // Named agent_skills to avoid collision with the content skills table.
  //
  // Default slugs seeded on provision:
  //   brand-voice  — tone, style, what to avoid
  //   seo          — target keywords, internal linking rules
  //   store        — pricing guidelines, product naming
  //   analytics    — how to interpret data, what matters
  `CREATE TABLE IF NOT EXISTS agent_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(profile_id, slug)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_skills_profile ON agent_skills (profile_id, is_active)`,
]

// ─── 2. Column migrations → add to MIGRATIONS_SQL in provision.ts ────────────

export const MIGRATIONS_SQL: Array<{ table: string; sql: string }> = [

  // ── credentials: social tokens ──────────────────────────────────────────────
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN twitter_api_key TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN twitter_api_secret TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN twitter_access_token TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN twitter_access_secret TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN linkedin_access_token TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN linkedin_person_urn TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN facebook_page_id TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN facebook_page_token TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN instagram_account_id TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN instagram_access_token TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN gemini_api_key TEXT` },
  { table: 'credentials', sql: `ALTER TABLE credentials ADD COLUMN zernio_api_key TEXT` },

  // ── posts: SEO + content type ───────────────────────────────────────────────
  // content_type drives which SEObot-style format the blog writer uses:
  // 'blog' | 'listicle' | 'how-to' | 'checklist' | 'qa' | 'versus'
  // | 'roundup' | 'news' | 'ultimate-guide' | 'programmatic'
  { table: 'posts',       sql: `ALTER TABLE posts ADD COLUMN seo_title TEXT` },
  { table: 'posts',       sql: `ALTER TABLE posts ADD COLUMN seo_description TEXT` },
  { table: 'posts',       sql: `ALTER TABLE posts ADD COLUMN seo_keywords TEXT` },
  { table: 'posts',       sql: `ALTER TABLE posts ADD COLUMN content_type TEXT DEFAULT 'blog'` },
  { table: 'posts',       sql: `ALTER TABLE posts ADD COLUMN word_count INTEGER DEFAULT 0` },
  { table: 'posts',       sql: `ALTER TABLE posts ADD COLUMN reading_time_mins INTEGER DEFAULT 0` },
  { table: 'posts',       sql: `ALTER TABLE posts ADD COLUMN internal_links TEXT DEFAULT '[]'` },
  { table: 'posts',       sql: `ALTER TABLE posts ADD COLUMN external_links TEXT DEFAULT '[]'` },
  { table: 'posts',       sql: `ALTER TABLE posts ADD COLUMN sources TEXT DEFAULT '[]'` },

  // ── compare / alternative / prompt / skills: same SEO cols ──────────────────
  { table: 'compare',     sql: `ALTER TABLE compare ADD COLUMN seo_title TEXT` },
  { table: 'compare',     sql: `ALTER TABLE compare ADD COLUMN seo_description TEXT` },
  { table: 'compare',     sql: `ALTER TABLE compare ADD COLUMN seo_keywords TEXT` },
  { table: 'alternative', sql: `ALTER TABLE alternative ADD COLUMN seo_title TEXT` },
  { table: 'alternative', sql: `ALTER TABLE alternative ADD COLUMN seo_description TEXT` },
  { table: 'alternative', sql: `ALTER TABLE alternative ADD COLUMN seo_keywords TEXT` },

  // ── profiles: LLM visibility tracking ───────────────────────────────────────
  // JSON: {"chatgpt":0,"claude":0,"gemini":0,"perplexity":0,"last_checked":"ISO"}
  // 0 = not tracked, 1+ = mention count. Updated by SEO agent llmVisibility check.
  { table: 'profiles',    sql: `ALTER TABLE profiles ADD COLUMN llm_visibility TEXT DEFAULT '{}'` },
]
