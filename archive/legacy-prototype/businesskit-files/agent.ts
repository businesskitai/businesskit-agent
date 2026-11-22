// ─────────────────────────────────────────────────────────────────────────────
// Agent Infrastructure Schema — UserDB tables
// Provisioned via provision.ts → provisionUserDatabase()
//
// Tables:
//   agents               — full agent config (Paperclip-inspired)
//   agent_skills         — live instruction skills, editable from dashboard
//   agent_memory         — rolling session log (dual-write: Turso + memory.md)
//   agent_notes          — user notepad: capture → agent processes later
//   agent_files          — files given to/by agents (like Claude Projects > Files)
//   agent_tasks          — user-assigned or agent-scheduled tasks
//   agent_reports        — append-only generated reports (safe, no loss)
//   agent_kb             — Karpathy wiki: LLM-maintained knowledge base
//   agent_conversations  — future agentic chat (schema only)
// ─────────────────────────────────────────────────────────────────────────────

export const AGENTS_SCHEMA_SQL: string[] = [

  // ── agents ───────────────────────────────────────────────────────────────────
  // Full agent configuration — inspired by Paperclip agent config UI.
  // One row per agent type per profile.
  // Identity, adapter, model, run policy, permissions — all configurable.
  `CREATE TABLE IF NOT EXISTS agents (
    id                     TEXT PRIMARY KEY,
    profile_id             TEXT NOT NULL,

    -- Identity
    agent_type             TEXT NOT NULL,
    display_name           TEXT NOT NULL,
    title                  TEXT,
    reports_to             TEXT,
    -- agent_type of manager. cmo/coo/cbo → 'ceo'
    avatar_emoji           TEXT NOT NULL DEFAULT '🤖',
    capabilities           TEXT,
    instructions           TEXT,
    -- Custom instructions / personality override

    -- Adapter
    adapter_type           TEXT NOT NULL DEFAULT 'claude-code-local',
    -- 'claude-code-local' | 'claude-api' | 'openai' | 'gemini'
    model                  TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    thinking_effort        TEXT NOT NULL DEFAULT 'auto',
    -- 'auto' | 'low' | 'medium' | 'high'

    -- Run config
    max_turns_per_run      INTEGER NOT NULL DEFAULT 50,
    timeout_sec            INTEGER NOT NULL DEFAULT 0,
    interrupt_grace_sec    INTEGER NOT NULL DEFAULT 15,
    enable_chrome          INTEGER NOT NULL DEFAULT 0,
    skip_permissions       INTEGER NOT NULL DEFAULT 1,
    extra_args             TEXT,
    env_vars               TEXT NOT NULL DEFAULT '{}',

    -- Run policy
    heartbeat_enabled      INTEGER NOT NULL DEFAULT 0,
    heartbeat_interval_sec INTEGER NOT NULL DEFAULT 3600,

    -- Permissions
    can_create_agents      INTEGER NOT NULL DEFAULT 0,
    can_assign_tasks       INTEGER NOT NULL DEFAULT 0,
    auto_approve           INTEGER NOT NULL DEFAULT 0,

    -- State
    is_active              INTEGER NOT NULL DEFAULT 1,
    is_paused              INTEGER NOT NULL DEFAULT 0,
    paused_until           INTEGER,
    status                 TEXT NOT NULL DEFAULT 'idle',
    -- 'idle' | 'running' | 'paused' | 'error'

    -- Run tracking
    total_runs             INTEGER NOT NULL DEFAULT 0,
    last_run_at            INTEGER,
    last_run_status        TEXT,

    -- Hermes pattern: pending auto-detected skill suggestion
    pending_skill_suggestion TEXT,
    -- JSON: { slug, name, content, detected_from: [memory_id,...] }
    skill_suggestion_at    INTEGER,

    created_at             INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at             INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_profile_type ON agents (profile_id, agent_type)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_profile ON agents (profile_id, is_active)`,

  // ── agent_skills ─────────────────────────────────────────────────────────────
  // Live instruction skills. Editable from dashboard → loaded next session.
  // 'generated' skills (Hermes auto-detect) start is_active=0, need user approval.
  `CREATE TABLE IF NOT EXISTS agent_skills (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id      TEXT NOT NULL,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    description     TEXT,
    tags            TEXT NOT NULL DEFAULT '[]',
    content         TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'manual',
    -- 'manual' | 'generated'
    agent_type      TEXT DEFAULT '*',
    -- '*' = global | specific agent_type = scoped to that agent
    is_active       INTEGER NOT NULL DEFAULT 1,
    approval_status TEXT NOT NULL DEFAULT 'pending',
    embedding       BLOB,
    version         INTEGER NOT NULL DEFAULT 1,
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(profile_id, slug)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_skills_profile ON agent_skills (profile_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_skills_type ON agent_skills (profile_id, agent_type)`,

  // ── skill_files ─────────────────────────────────────────────────────────────
  // File attachments/references strictly belonging to a specific agent_skill
  `CREATE TABLE IF NOT EXISTS skill_files (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id   INTEGER NOT NULL,
    path       TEXT NOT NULL,
    category   TEXT DEFAULT 'reference',
    content    TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, path)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_skill_files_skill_id ON skill_files(skill_id)`,

  // ── agent_memory ─────────────────────────────────────────────────────────────
  // Rolling 20-row session log. Dual-write: Turso + memory.md.
  `CREATE TABLE IF NOT EXISTS agent_memory (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id   TEXT NOT NULL,
    session_date TEXT NOT NULL,
    agent        TEXT NOT NULL,
    action       TEXT NOT NULL,
    metadata     TEXT NOT NULL DEFAULT '{}',
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate memory entries
    idempotency_key TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memory_profile ON agent_memory (profile_id, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memory_date ON agent_memory (profile_id, session_date DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memory_idem ON agent_memory (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── agent_notes ───────────────────────────────────────────────────────────────
  // User notepad — capture anything without knowing what to do with it.
  // Agent periodically reviews 'inbox' notes and processes them.
  // Like Notion/Obsidian, but the agent figures out what to do.
  `CREATE TABLE IF NOT EXISTS agent_notes (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    content        TEXT NOT NULL,
    -- Free-form: idea, link, quote, question, thought — anything
    source         TEXT NOT NULL DEFAULT 'user',
    -- 'user' | 'agent'
    agent_response TEXT,
    -- Optional: agent's response or action taken (single field, not a thread)
    status         TEXT NOT NULL DEFAULT 'inbox',
    -- 'inbox' | 'processing' | 'done' | 'archived'
    tags           TEXT NOT NULL DEFAULT '[]',
    hidden         INTEGER NOT NULL DEFAULT 0,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate notes
    idempotency_key TEXT,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_notes_profile ON agent_notes (profile_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_notes_inbox ON agent_notes (profile_id, status, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_notes_idem ON agent_notes (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── agent_files ───────────────────────────────────────────────────────────────
  // Files given to agents or produced by agents.
  // Like Claude Projects > Files — assign one file to many agents via JSON array.
  // No junction table needed: agent_types = ['ceo','blog-writer'] or ['*'] for all.
  `CREATE TABLE IF NOT EXISTS agent_files (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL,
    file_name    TEXT NOT NULL,
    file_path    TEXT NOT NULL,
    -- e.g. 'context/brand-guide.pdf' | 'data/q1-revenue.csv'
    mime_type    TEXT NOT NULL DEFAULT 'text/plain',
    size_bytes   INTEGER NOT NULL DEFAULT 0,
    content      TEXT,
    -- Inline for <100KB text files. NULL = use storage_url.
    storage_url  TEXT,
    agent_types  TEXT NOT NULL DEFAULT '[]',
    -- JSON string[]: ['ceo','blog-writer'] | ['*'] = all agents
    source       TEXT NOT NULL DEFAULT 'user',
    -- 'user' = uploaded | 'agent' = produced by agent
    hidden       INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_files_path ON agent_files (profile_id, file_path)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_files_profile ON agent_files (profile_id, created_at DESC)`,

  // ── agent_tasks ───────────────────────────────────────────────────────────────
  // Tasks assigned by user or self-scheduled by agents.
  // One-time or recurring (cron). Periodic — not forced on every run.
  `CREATE TABLE IF NOT EXISTS agent_tasks (
    id              TEXT PRIMARY KEY,
    profile_id      TEXT NOT NULL,
    agent           TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    command         TEXT NOT NULL,
    -- Agent method: 'weeklyBriefing' | 'runPublishQueue' | 'hotLeads'
    params          TEXT NOT NULL DEFAULT '{}',
    source          TEXT NOT NULL DEFAULT 'user',
    -- 'user' | 'agent'
    schedule        TEXT,
    -- cron: '0 8 * * 1' = Monday 8am | NULL = on-demand
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    run_once        INTEGER NOT NULL DEFAULT 0,
    -- 1 = delete/complete after first successful run
    status          TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'active' | 'running' | 'done' | 'paused' | 'failed' | 'cancelled'
    run_count       INTEGER NOT NULL DEFAULT 0,
    last_run_at     INTEGER,
    last_run_status TEXT,
    next_run_at     INTEGER,
    hidden          INTEGER NOT NULL DEFAULT 0,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate tasks
    idempotency_key TEXT,
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tasks_profile ON agent_tasks (profile_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tasks_due ON agent_tasks (status, next_run_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks (profile_id, agent, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_idem ON agent_tasks (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── agent_reports ─────────────────────────────────────────────────────────────
  // Append-only generated reports. Agent pushes here mid-conversation → safe forever.
  // CEO briefings, SEO audits, revenue summaries, CRM snapshots, analytics reports.
  `CREATE TABLE IF NOT EXISTS agent_reports (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL,
    agent        TEXT NOT NULL,
    title        TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT 'general',
    -- 'briefing' | 'audit' | 'revenue' | 'seo' | 'crm' | 'analytics' | 'general'
    content      TEXT NOT NULL,
    -- Markdown: full report body
    html         TEXT,
    summary      TEXT,
    -- 2-3 sentences for dashboard list view (token-efficient)
    metadata     TEXT NOT NULL DEFAULT '{}',
    -- JSON: { score, period, counts, ... } — type-specific data
    hidden       INTEGER NOT NULL DEFAULT 0,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate reports
    idempotency_key TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_reports_profile ON agent_reports (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_reports_type ON agent_reports (profile_id, type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_reports_agent ON agent_reports (profile_id, agent)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_reports_idem ON agent_reports (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── agent_kb ─────────────────────────────────────────────────────────────────
  // Karpathy LLM Wiki — persistent, compounding knowledge base.
  // Agent reads notes/sources → integrates into KB → updates existing entries.
  // Users never write here — agent maintains it. Users only read.
  //
  // Three-layer architecture (Karpathy):
  //   agent_notes   → raw sources (user drops stuff here)
  //   agent_kb      → compiled wiki (agent integrates, cross-references)
  //   agent_skills  → schema (tells agent how the KB is structured)
  //
  // Index pattern: agent reads slug+summary first (cheap), drills into
  // content only when needed. summary = the index entry. content = the page.
  `CREATE TABLE IF NOT EXISTS agent_kb (
    id              TEXT PRIMARY KEY,
    profile_id      TEXT NOT NULL,
    entry_type      TEXT NOT NULL DEFAULT 'concept',
    -- 'entity'    → person, product, company, tool
    -- 'concept'   → idea, strategy, pattern, framework
    -- 'source'    → processed note summary
    -- 'synthesis' → agent cross-reference or analysis
    -- 'index'     → auto-maintained index page
    title           TEXT NOT NULL,
    slug            TEXT NOT NULL,
    -- Unique key: 'convertkit' | 'email-deliverability' | 'icp-match'
    content         TEXT NOT NULL,
    -- Markdown: full wiki page
    summary         TEXT,
    -- 1-2 sentences — loaded by agent for index scans (token-efficient)
    related_ids     TEXT NOT NULL DEFAULT '[]',
    -- JSON string[]: other agent_kb.id values this links to
    source_note_ids TEXT NOT NULL DEFAULT '[]',
    -- JSON string[]: agent_notes.id values this was compiled from
    tags            TEXT NOT NULL DEFAULT '[]',
    stale           INTEGER NOT NULL DEFAULT 0,
    -- 1 = newer info contradicts this, agent should update
    version         INTEGER NOT NULL DEFAULT 1,
    hidden          INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_kb_slug ON agent_kb (profile_id, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_kb_profile ON agent_kb (profile_id, entry_type)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_kb_stale ON agent_kb (profile_id, stale)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_kb_updated ON agent_kb (profile_id, updated_at DESC)`,

  // ── agent_conversations ───────────────────────────────────────────────────────
  // Future agentic chat UI. Schema ready. No implementation yet.
  `CREATE TABLE IF NOT EXISTS agent_conversations (
    id             TEXT PRIMARY KEY,
    profile_id     TEXT NOT NULL,
    title          TEXT,
    agent          TEXT,
    harness_type   TEXT,
    harness_status TEXT NOT NULL DEFAULT 'none',
    current_phase  INTEGER NOT NULL DEFAULT 0,
    messages       TEXT NOT NULL DEFAULT '[]',
    deep_mode      INTEGER NOT NULL DEFAULT 0,
    todos          TEXT NOT NULL DEFAULT '[]',
    workspace_ids  TEXT NOT NULL DEFAULT '[]',
    hidden         INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_conversations_profile ON agent_conversations (profile_id, created_at DESC)`,

  // ── agent_audit ───────────────────────────────────────────────────────────────
  // P1-6: Append-only audit log of every agent mutation.
  // Lives in UserDB — user owns it. Agent writes one row per mutation.
  // BEFORE UPDATE + BEFORE DELETE triggers make it physically immutable.
  //
  // Usage: agent writes one row per action in its _base.ts before/after mutation.
  //   { agent_type, table_name, row_id, action, diff: JSON {col: [old, new]}, idempotency_key }
  //
  // Query patterns:
  //   Recent agent activity:  SELECT * FROM agent_audit ORDER BY ts DESC LIMIT 50
  //   History for a row:      SELECT * FROM agent_audit WHERE table_name=? AND row_id=?
  //   Agent session:          SELECT * FROM agent_audit WHERE agent_type=? AND ts > ?
  `CREATE TABLE IF NOT EXISTS agent_audit (
    id               TEXT PRIMARY KEY,
    ts               INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    agent_type       TEXT NOT NULL,
    table_name       TEXT NOT NULL,
    row_id           TEXT NOT NULL,
    action           TEXT NOT NULL,
    diff             TEXT,
    idempotency_key  TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_audit_ts ON agent_audit (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_audit_table_row ON agent_audit (table_name, row_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_audit_agent ON agent_audit (agent_type, ts DESC)`,

  // Immutability — agent/user cannot erase or alter history
  `CREATE TRIGGER IF NOT EXISTS trg_agent_audit_no_update
   BEFORE UPDATE ON agent_audit
   BEGIN SELECT RAISE(ABORT, 'agent_audit is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_agent_audit_no_delete
   BEFORE DELETE ON agent_audit
   BEGIN SELECT RAISE(ABORT, 'agent_audit is append-only'); END`,
]

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────
export const AGENT_PRESETS = [
  // ── C-Suite ──────────────────────────────────────────────────────────────
  { type: 'ceo', name: 'CEO', title: 'Chief Executive Officer (CEO)', emoji: '👔', reports_to: null, can_create: 1, can_assign: 1, is_active: 1 },
  { type: 'operations', name: 'Operations', title: 'Chief Operating Officer (COO)', emoji: '⚙️', reports_to: 'ceo', can_create: 0, can_assign: 1, is_active: 0 },
  { type: 'business', name: 'Business', title: 'Chief Business Officer (CBO)', emoji: '💰', reports_to: 'ceo', can_create: 0, can_assign: 0, is_active: 0 },

  // ── Marketing ────────────────────────────────────────────────────────────
  { type: 'marketing', name: 'Marketing', title: 'Marketing Manager (CMO)', emoji: '📣', reports_to: 'ceo', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'content', name: 'Content', title: 'Content Writer', emoji: '✍️', reports_to: 'marketing', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'newsletter', name: 'Newsletter', title: 'Email Marketing Manager', emoji: '📧', reports_to: 'marketing', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'copywriting', name: 'Copywriting', title: 'Copy Strategist', emoji: '🖊️', reports_to: 'marketing', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'social', name: 'Social', title: 'Social Media Manager', emoji: '📱', reports_to: 'marketing', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'seo', name: 'SEO', title: 'SEO Strategist', emoji: '🔍', reports_to: 'marketing', can_create: 0, can_assign: 0, is_active: 0 },

  // ── Operations ───────────────────────────────────────────────────────────
  { type: 'store', name: 'Store', title: 'Store Manager', emoji: '🛍️', reports_to: 'operations', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'courses', name: 'Courses', title: 'Education Product Manager', emoji: '🎓', reports_to: 'operations', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'hiring', name: 'Hiring', title: 'Hiring Manager', emoji: '💼', reports_to: 'operations', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'forms', name: 'Forms', title: 'Data Collection Manager', emoji: '📋', reports_to: 'operations', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'docs', name: 'Docs', title: 'Knowledge Manager', emoji: '📚', reports_to: 'operations', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'scheduler', name: 'Scheduler', title: 'Operations Scheduler', emoji: '⏰', reports_to: 'operations', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'design', name: 'Design', title: 'Page & Design Builder', emoji: '🎨', reports_to: 'operations', can_create: 0, can_assign: 0, is_active: 0 },

  // ── Business ─────────────────────────────────────────────────────────────
  { type: 'sales', name: 'Sales', title: 'Sales & CRM Manager', emoji: '🤝', reports_to: 'business', can_create: 0, can_assign: 0, is_active: 0 },
  { type: 'analytics', name: 'Analytics', title: 'Data Analyst', emoji: '📊', reports_to: 'business', can_create: 0, can_assign: 0, is_active: 0 },
] as const

export const AGENT_SKILL_PRESETS = [
  { slug: 'brand-voice', name: 'Brand Voice', content: `# Brand Voice\nLoad before writing:\n\`\`\`ts\nconst { profile } = await getBrandContext()\n\`\`\`\nMatch profile.bio tone. Titles ≤60 chars. Excerpt = hook sentence.` },
  { slug: 'seo', name: 'SEO Rules', content: `# SEO Rules\n- seo_title ≤60 chars\n- seo_description ≤160 chars\n- Blog posts min 1500 words\n- 2-3 internal links per post\n- Cite sources in sources JSON` },
  { slug: 'store', name: 'Store Rules', content: `# Store Rules\n- price_cents: $49 → 4900\n- Lead with outcome not feature\n- course requires lessons JSON\n- Seed product_analytics row on create` },
  { slug: 'analytics', name: 'Analytics', content: `# Analytics\nArrays are oldest-first. Revenue in cents. NEVER write to analytics tables — read only.` },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Seed function — call from provisionUserDatabase() after AGENTS_SCHEMA_SQL runs
// ─────────────────────────────────────────────────────────────────────────────
export async function seedAgents(url: string, authToken: string): Promise<void> {
  const { createClient } = await import('@libsql/client/web')
  const client = createClient({ url, authToken })
  try {
    const { rows: [cnt] } = await client.execute({ sql: `SELECT COUNT(*) c FROM agents`, args: [] })
    if (Number(cnt?.c ?? 0) > 0) return

    const { rows: [pr] } = await client.execute({ sql: `SELECT id FROM profiles LIMIT 1`, args: [] })
    const profileId = pr?.id as string | undefined
    if (!profileId) return

    const now = Math.floor(Date.now() / 1000)
    for (const p of AGENT_PRESETS) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO agents
               (id,profile_id,agent_type,display_name,title,reports_to,
                avatar_emoji,can_create_agents,can_assign_tasks,is_active,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [crypto.randomUUID(), profileId, p.type, p.name, p.title,
        p.reports_to ?? null, p.emoji, p.can_create, p.can_assign, p.is_active, now, now],
      })
    }
    for (const s of AGENT_SKILL_PRESETS) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO agent_skills (profile_id,name,slug,content) VALUES (?,?,?,?)`,
        args: [profileId, s.name, s.slug, s.content],
      })
    }
  } catch { /* table may not exist on old DBs */ }
}
