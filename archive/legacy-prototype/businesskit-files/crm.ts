// ─────────────────────────────────────────────────────────────────────────────
// CRM Schema — UserDB tables
// All live in the user's own Turso instance, provisioned via provision.ts
//
// Architecture:
//   DB Triggers  → ALL scalar analytics updated in real-time at DB level
//                  Fires regardless of who writes: platform, agent, Claude Code,
//                  n8n, direct SQL editor. No app server involvement needed.
//   Aggregator   → JSON breakdowns (7d/30d/12m/lifetime/utm) computed on
//                  analytics page visit with 24hr throttle (last_aggregated_at)
//                  + force-refresh button. Same pattern as community_analytics.
//
// Tables (11):
//   crm_contacts    — core contact record + agent state + agentic fields
//   crm_deals       — pipeline opportunities with line items
//   crm_activities  — append-only interaction timeline (agent/you/contact)
//   crm_tasks       — follow-up to-dos
//   crm_notes       — user-written rich-text notes (editable, pinnable)
//   crm_groups      — named contact groups (Investors, Clients, VIP etc)
//   crm_templates   — outreach templates with reply rate tracking
//   crm_proposals   — client proposals with e-sign + payment
//   crm_invoices    — invoices with line items
//   crm_imports     — import batch tracking
//   crm_analytics   — 1 row per profile, scalar=triggers, JSON=on-demand
//
// Triggers (13):
//   trg_after_contact_insert          — branches on status (lead/customer/prospect)
//   trg_after_contact_converted       — status change to customer
//   trg_after_contact_archived        — archived flag flip
//   trg_after_contact_duplicate_check — flags duplicate by email match
//   trg_after_activity_insert         — agent outbound action counter
//   trg_after_activity_pending        — pending_approval counter
//   trg_after_activity_approve        — approval cleared + approved counter
//   trg_after_activity_reject         — rejection cleared + rejected counter
//   trg_after_inbound_reply           — inbound reply counter
//   trg_after_deal_insert             — deal + open_deals + value
//   trg_after_deal_won                — won counters + open_deals decrement
//   trg_after_deal_lost               — lost counters + open_deals decrement
//   trg_after_deal_forecast           — weighted pipeline forecast (this/next month)
//
// Cross-table connections:
//   user_id      → users.id  (same ID in Central DB + UserDB — email is dedup key)
//   source_id    → subscribers.id / purchases.id / submissions.id
//   product_id   → products.id
//   proposal_id  → crm_proposals.id (on crm_invoices)
//   email_events → proposal_id + invoice_id columns (in migrations)
//                  tracks email open/click for sent proposals + invoices
//                  reuses existing email-tracking.ts infrastructure
// ─────────────────────────────────────────────────────────────────────────────

export const CRM_SCHEMA_SQL: string[] = [

  // ── crm_contacts ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS crm_contacts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    user_id TEXT,                    -- FK → users.id (NULL = cold lead never signed up)

    -- Identity
    first_name TEXT NOT NULL,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    company TEXT,
    job_title TEXT,
    website TEXT,
    contact_type TEXT DEFAULT 'professional',
    -- 'brand' | 'agency' | 'influencer' | 'professional'

    -- Location
    city TEXT,
    country TEXT,
    timezone TEXT,

    -- Social presence
    platform TEXT,                   -- primary platform (where agent found them)
    social_links TEXT NOT NULL DEFAULT '[]',
    -- [{platform, url, username, followers}]
    -- platforms: linkedin|twitter|instagram|youtube|tiktok|facebook|github|substack|podcast|website

    -- AI research (agent-populated)
    bio TEXT,
    recent_post TEXT,
    recent_post_url TEXT,
    recent_post_at INTEGER,
    pain_point TEXT,                 -- AI-derived pain summary
    audience_size INTEGER,           -- total reach across all platforms
    company_size TEXT,               -- 'solo'|'2-10'|'11-50'|'51-200'|'200+'
    industry TEXT,
    business_model TEXT,             -- 'b2b'|'b2c'|'marketplace'
    estimated_revenue TEXT,          -- '$0-10k'|'$10k-100k'|'$100k-1M'

    -- Lead scoring (agent-populated)
    lead_score INTEGER NOT NULL DEFAULT 0,
    lead_score_reason TEXT,
    icp_match TEXT NOT NULL DEFAULT 'unknown',   -- 'strong'|'moderate'|'weak'|'unknown'
    urgency TEXT NOT NULL DEFAULT 'unknown',     -- 'high'|'medium'|'low'|'unknown'
    buying_intent TEXT NOT NULL DEFAULT 'unknown',

    -- Outreach lifecycle
    outreach_status TEXT NOT NULL DEFAULT 'new',
    -- new|dm_drafted|dm_sent|email_drafted|email_sent
    -- |replied|call_booked|demo_done|converted|not_interested
    outreach_attempts INTEGER NOT NULL DEFAULT 0,
    next_follow_up_at INTEGER,
    follow_up_count INTEGER NOT NULL DEFAULT 0,
    next_action TEXT,

    -- DM outreach
    suggested_dm TEXT,
    dm_sent INTEGER NOT NULL DEFAULT 0,
    dm_sent_at INTEGER,
    conversation_thread TEXT NOT NULL DEFAULT '[]',
    -- [{channel, role, content, timestamp}]
    last_reply_at INTEGER,
    last_reply_channel TEXT,         -- 'dm'|'email'
    reply_sentiment TEXT,            -- 'positive'|'neutral'|'negative'

    -- Email outreach
    email_subject TEXT,
    email_draft TEXT,
    email_sent INTEGER NOT NULL DEFAULT 0,
    email_sent_at INTEGER,

    -- CRM metadata
    status TEXT NOT NULL DEFAULT 'lead',
    -- 'lead'|'prospect'|'customer'|'churned'|'archived'
    source TEXT,
    -- 'manual'|'form'|'import'|'subscriber'|'purchase'|'agent_research'|'n8n_webhook'
    source_id TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    custom_fields TEXT NOT NULL DEFAULT '{}',
    notes TEXT,
    message TEXT,                    -- initial message from contact form
    groups TEXT NOT NULL DEFAULT '[]',
    -- JSON string[] of crm_groups.id

    -- Attribution passthrough
    device TEXT,
    os TEXT,
    browser TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,

    -- Financials (denormalized)
    total_spent_cents INTEGER NOT NULL DEFAULT 0,
    total_purchases INTEGER NOT NULL DEFAULT 0,
    last_purchase_at INTEGER,

    -- Subscription tracking
    subscription_status TEXT,        -- 'active'|'cancelled'|'paused'|'trial'
    subscription_plan TEXT,
    subscription_value_cents INTEGER DEFAULT 0,
    subscription_renewal_at INTEGER,
    mrr_cents INTEGER DEFAULT 0,

    -- Engagement
    last_contacted_at INTEGER,
    last_activity_at INTEGER,
    unread_count INTEGER NOT NULL DEFAULT 0,

    -- Agent state
    agent_status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending'|'researching'|'enriched'|'outreach_ready'|'closed'
    agent_version TEXT,
    agent_confidence INTEGER,
    agent_error TEXT,
    agent_retry_count INTEGER NOT NULL DEFAULT 0,
    agent_last_run_at INTEGER,
    agent_next_run_at INTEGER,
    agent_context TEXT NOT NULL DEFAULT '{}',
    -- {summary, tone, preferred_channel, do_not_mention[], last_enriched_at}
    agent_instructions TEXT,         -- per-contact override
    agent_paused INTEGER NOT NULL DEFAULT 0,
    agent_paused_until INTEGER,
    auto_approve INTEGER NOT NULL DEFAULT 0,
    -- 0 = wait for approval | 1 = agent sends autonomously

    -- Signal tracking
    last_signal TEXT,
    -- 'new_post'|'replied'|'opened_email'|'purchase'|'form_submit'|'n8n_trigger'
    last_signal_at INTEGER,
    signal_data TEXT NOT NULL DEFAULT '{}',

    -- Enrichment
    enriched_at INTEGER,
    enrichment_source TEXT,

    -- Duplicate detection (trigger-managed)
    is_duplicate INTEGER NOT NULL DEFAULT 0,
    duplicate_of TEXT,

    -- Pipeline flags
    archived INTEGER NOT NULL DEFAULT 0,
    disqualified INTEGER NOT NULL DEFAULT 0,
    disqualified_reason TEXT,
    merged_into TEXT,
    merged_at INTEGER,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_profile   ON crm_contacts (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_email     ON crm_contacts (profile_id, email)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_status    ON crm_contacts (profile_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_outreach  ON crm_contacts (profile_id, outreach_status)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_score     ON crm_contacts (profile_id, lead_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_agent     ON crm_contacts (profile_id, agent_status)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_source    ON crm_contacts (source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_followup  ON crm_contacts (profile_id, next_follow_up_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_user      ON crm_contacts (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_activity  ON crm_contacts (profile_id, last_activity_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone     ON crm_contacts (phone) WHERE phone IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_crm_contacts_outreach_agent ON crm_contacts (profile_id, agent_status, outreach_status) WHERE archived = 0`,
  // P0-4: unique email per profile (partial — NULLs allowed)
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_email_unique ON crm_contacts (profile_id, email) WHERE email IS NOT NULL`,

  // ── crm_deals ─────────────────────────────────────────────────────────────────
  // product_id = simple single-product deal
  // line_items = complex multi-service deal (consulting + retainer + ad creative)
  `CREATE TABLE IF NOT EXISTS crm_deals (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,

    title TEXT NOT NULL,
    value_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'usd',
    stage TEXT NOT NULL DEFAULT 'new',
    -- configurable via settings.pipeline_stages
    probability INTEGER NOT NULL DEFAULT 0,
    expected_close_at INTEGER,
    closed_at INTEGER,
    lost_reason TEXT,
    notes TEXT,

    product_id TEXT,
    line_items TEXT DEFAULT '[]',
    -- [{title, quantity, unit_price_cents, total_cents}]

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_deals_profile  ON crm_deals (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_deals_contact  ON crm_deals (contact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_deals_stage    ON crm_deals (profile_id, stage)`,

  // ── crm_activities ────────────────────────────────────────────────────────────
  // Append-only. Never edited. Agent + human + contact interactions.
  //
  // sender    = 'agent'|'you'|'contact'   → UI bubble: agent=purple, you=blue, contact=left
  // direction = 'outbound'|'inbound'      → analytics (reply rate, outbound count)
  //
  // approval_status:
  //   pending_approval → you review in inbox or tasks → approve/reject
  //   auto_sent        → contact.auto_approve=1, skips approval
  //
  // metadata contracts:
  //   dm:              {platform, thread_id}
  //   email:           {subject, proposal_id?, opened_at?}
  //   call:            {duration_minutes, outcome, platform, notes}
  //   meeting:         {meeting_url, scheduled_at, duration_minutes, next_step}
  //   purchase:        {product_id, amount_cents, processor, invoice_id?}
  //   form_submission: {form_id, submission_id}
  //   agent_action:    {action, previous_value, new_value, reason}
  `CREATE TABLE IF NOT EXISTS crm_activities (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    deal_id TEXT,

    type TEXT NOT NULL,
    -- 'dm'|'email'|'call'|'meeting'|'note'|'task_done'
    -- |'purchase'|'form_submission'|'agent_action'

    direction TEXT NOT NULL DEFAULT 'outbound',
    sender TEXT NOT NULL DEFAULT 'agent',

    subject TEXT,
    body TEXT,
    outcome TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    searchable_context TEXT,         -- plain text for agent (avoids JSON parse)

    approval_status TEXT DEFAULT 'auto_sent',
    -- 'pending_approval'|'approved'|'rejected'|'auto_sent'
    approval_requested_at INTEGER,
    approved_at INTEGER,

    read_at INTEGER,                 -- NULL = unread

    occurred_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate activities
    idempotency_key TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_activities_contact  ON crm_activities (contact_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_activities_profile  ON crm_activities (profile_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_activities_deal     ON crm_activities (deal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_activities_type     ON crm_activities (profile_id, type)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_activities_approval ON crm_activities (profile_id, approval_status)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_activities_contact_time ON crm_activities (contact_id, occurred_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_activities_idem ON crm_activities (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── crm_tasks ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS crm_tasks (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    contact_id TEXT,
    deal_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    due_at INTEGER,
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    completed_at INTEGER,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate tasks
    idempotency_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_tasks_profile ON crm_tasks (profile_id, due_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact ON crm_tasks (contact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_tasks_status  ON crm_tasks (profile_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_tasks_due     ON crm_tasks (profile_id, status, due_at) WHERE status = 'open'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_tasks_idem ON crm_tasks (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── crm_notes ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS crm_notes (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    deal_id TEXT,
    body TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate notes
    idempotency_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_notes_contact ON crm_notes (contact_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_notes_profile ON crm_notes (profile_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_notes_idem ON crm_notes (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── crm_groups ────────────────────────────────────────────────────────────────
  // CRM_GROUP_PRESETS below = UI dropdown suggestions only, not DB rows.
  `CREATE TABLE IF NOT EXISTS crm_groups (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    contact_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_groups_profile ON crm_groups (profile_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_groups_name ON crm_groups (profile_id, name)`,

  // ── crm_contact_groups ───────────────────────────────────────────────────────
  // Junction table for contact <-> group mapping
  `CREATE TABLE IF NOT EXISTS crm_contact_groups (
    contact_id TEXT NOT NULL,
    group_id   TEXT NOT NULL,
    added_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (contact_id, group_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ccg_group   ON crm_contact_groups(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ccg_contact ON crm_contact_groups(contact_id)`,

  // ── crm_templates ─────────────────────────────────────────────────────────────
  // Agent picks best template by platform + tags + reply_rate_pct.
  // Variables: {{first_name}} {{company}} {{pain_point}} {{product}}
  `CREATE TABLE IF NOT EXISTS crm_templates (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,              -- 'dm'|'email'|'follow_up'|'proposal'
    subject TEXT,
    body TEXT NOT NULL,
    platform TEXT,                   -- 'twitter'|'linkedin'|null=any
    tags TEXT NOT NULL DEFAULT '[]',
    use_count INTEGER NOT NULL DEFAULT 0,
    reply_rate_pct INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_templates_profile ON crm_templates (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_templates_type    ON crm_templates (profile_id, type)`,

  // ── crm_proposals ─────────────────────────────────────────────────────────────
  // Public URL: /proposal/{public_slug}
  // Email open/click: email_events table (proposal_id column added in migrations)
  // Web view: viewed_at + view_count (separate from email open tracking)
  // Proposal number: settings.proposal_sequence auto-incremented on create
  `CREATE TABLE IF NOT EXISTS crm_proposals (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    contact_id TEXT,
    deal_id TEXT,

    title TEXT NOT NULL,
    body TEXT NOT NULL,
    excerpt TEXT,
    public_slug TEXT NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft'|'sent'|'viewed'|'signed'|'paid'|'expired'|'declined'

    sent_at INTEGER,

    -- Web view tracking (contact opens public URL directly)
    viewed_at INTEGER,
    view_count INTEGER NOT NULL DEFAULT 0,

    -- Email engagement tracking (trigger-written from email_events)
    -- Separate from web views: pixel fire = email opened, click = CTA clicked in email
    email_opened_at INTEGER,             -- first email open (pixel fired) — NULL = not opened
    email_open_count INTEGER NOT NULL DEFAULT 0,  -- total email opens (each pixel load)
    email_clicked_at INTEGER,            -- first CTA click from email — NULL = not clicked

    expires_at INTEGER,

    client_name TEXT,
    client_email TEXT,
    client_company TEXT,

    signed_name TEXT,
    signed_email TEXT,
    signed_at INTEGER,
    signature_data TEXT,
    signature_type TEXT,             -- 'draw'|'type'
    signature_ip TEXT,
    signature_ua TEXT,

    payment_required INTEGER NOT NULL DEFAULT 0,
    payment_amount_cents INTEGER,
    payment_currency TEXT DEFAULT 'usd',
    payment_processor TEXT,
    payment_reference TEXT,
    payment_status TEXT,
    payment_url TEXT,
    payment_url_expires_at INTEGER,
    paid_at INTEGER,

    deposit_required INTEGER NOT NULL DEFAULT 0,
    deposit_amount_cents INTEGER,
    deposit_paid_at INTEGER,
    deposit_reference TEXT,

    cta_label TEXT,
    cta_url TEXT,

    reminder_count INTEGER NOT NULL DEFAULT 0,
    last_reminder_at INTEGER,
    next_reminder_at INTEGER,

    template_id TEXT,
    ai_generated INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate proposals
    idempotency_key TEXT,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_proposals_profile ON crm_proposals (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_proposals_contact ON crm_proposals (contact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_proposals_slug    ON crm_proposals (public_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_proposals_status  ON crm_proposals (profile_id, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_proposals_idem ON crm_proposals (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── crm_invoices ──────────────────────────────────────────────────────────────
  // Public URL: /invoice/{public_slug}
  // invoice_number from settings.invoice_sequence
  `CREATE TABLE IF NOT EXISTS crm_invoices (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    contact_id TEXT,
    deal_id TEXT,
    proposal_id TEXT,

    invoice_number TEXT NOT NULL,
    public_slug TEXT NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft'|'sent'|'viewed'|'paid'|'overdue'|'cancelled'|'refunded'

    client_name TEXT,
    client_email TEXT,
    client_company TEXT,
    client_address TEXT,

    line_items TEXT NOT NULL DEFAULT '[]',
    -- [{description, quantity, unit_price_cents, total_cents}]
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    tax_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'usd',

    issued_at INTEGER,
    due_at INTEGER,
    sent_at INTEGER,

    -- Web view tracking (contact opens public URL directly)
    viewed_at INTEGER,
    view_count INTEGER NOT NULL DEFAULT 0,

    -- Email engagement tracking (trigger-written from email_events)
    email_opened_at INTEGER,             -- first email open (pixel fired) — NULL = not opened
    email_open_count INTEGER NOT NULL DEFAULT 0,  -- total email opens
    email_clicked_at INTEGER,            -- first CTA click from email — NULL = not clicked

    paid_at INTEGER,
    overdue_notified_at INTEGER,

    payment_processor TEXT,
    payment_reference TEXT,
    payment_status TEXT,
    payment_link TEXT,
    payment_method TEXT,

    reminder_count INTEGER NOT NULL DEFAULT 0,
    last_reminder_at INTEGER,
    next_reminder_at INTEGER,

    notes TEXT,
    memo TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate invoices
    idempotency_key TEXT,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_invoices_profile  ON crm_invoices (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_invoices_contact  ON crm_invoices (contact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_invoices_slug     ON crm_invoices (public_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_invoices_status   ON crm_invoices (profile_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_invoices_proposal ON crm_invoices (proposal_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_invoices_idem ON crm_invoices (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── crm_imports ───────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS crm_imports (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    filename TEXT,
    source TEXT,                     -- 'csv'|'linkedin'|'twitter'|'apollo'|'agent'
    total_rows INTEGER DEFAULT 0,
    imported INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'processing',
    error TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_crm_imports_profile ON crm_imports (profile_id, created_at DESC)`,

  // ── crm_analytics ─────────────────────────────────────────────────────────────
  // Scalar counts → DB triggers (always real-time, even when agent bypasses app)
  // JSON breakdowns → aggregateCrmAnalytics() on page visit (24hr throttle)
  `CREATE TABLE IF NOT EXISTS crm_analytics (
    profile_id TEXT PRIMARY KEY,

    total_contacts INTEGER NOT NULL DEFAULT 0,
    total_leads INTEGER NOT NULL DEFAULT 0,
    total_prospects INTEGER NOT NULL DEFAULT 0,
    total_customers INTEGER NOT NULL DEFAULT 0,
    total_archived INTEGER NOT NULL DEFAULT 0,
    total_converted INTEGER NOT NULL DEFAULT 0,

    total_deals INTEGER NOT NULL DEFAULT 0,
    open_deals INTEGER NOT NULL DEFAULT 0,
    won_deals INTEGER NOT NULL DEFAULT 0,
    lost_deals INTEGER NOT NULL DEFAULT 0,
    total_deal_value_cents INTEGER NOT NULL DEFAULT 0,
    won_deal_value_cents INTEGER NOT NULL DEFAULT 0,

    forecast_this_month_cents INTEGER NOT NULL DEFAULT 0,
    forecast_next_month_cents INTEGER NOT NULL DEFAULT 0,

    total_outreach_sent INTEGER NOT NULL DEFAULT 0,
    total_replies INTEGER NOT NULL DEFAULT 0,
    total_calls_booked INTEGER NOT NULL DEFAULT 0,
    reply_rate_pct INTEGER NOT NULL DEFAULT 0,
    conversion_rate_pct INTEGER NOT NULL DEFAULT 0,

    total_agent_actions INTEGER NOT NULL DEFAULT 0,
    total_pending_approvals INTEGER NOT NULL DEFAULT 0,
    total_approved INTEGER NOT NULL DEFAULT 0,
    total_rejected INTEGER NOT NULL DEFAULT 0,
    avg_lead_score INTEGER NOT NULL DEFAULT 0,

    contacts_7d TEXT NOT NULL DEFAULT '[]',
    contacts_30d TEXT NOT NULL DEFAULT '[]',
    contacts_12m TEXT NOT NULL DEFAULT '[]',
    contacts_lifetime TEXT NOT NULL DEFAULT '{}',
    utm_source_breakdown TEXT NOT NULL DEFAULT '{}',
    utm_medium_breakdown TEXT NOT NULL DEFAULT '{}',
    utm_campaign_breakdown TEXT NOT NULL DEFAULT '{}',
    referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    source_breakdown TEXT NOT NULL DEFAULT '{}',
    stage_breakdown TEXT NOT NULL DEFAULT '{}',
    channel_breakdown TEXT NOT NULL DEFAULT '{}',

    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_aggregated_at INTEGER NOT NULL DEFAULT 0
  )`,

  // ─────────────────────────────────────────────────────────────────────────────
  // DB TRIGGERS — 14 total (13 analytics + 1 append-only guard)
  // Drop first so schema changes are always re-applied cleanly.
  // Scalar counts only. JSON handled by aggregateCrmAnalytics().
  // approval_status values: 'pending_approval' | 'approved' | 'rejected' | 'auto_sent'
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Drop all first (same pattern as community-triggers.ts) ───────────────────
  `DROP TRIGGER IF EXISTS trg_after_contact_insert`,
  `DROP TRIGGER IF EXISTS trg_after_contact_converted`,
  `DROP TRIGGER IF EXISTS trg_after_contact_archived`,
  `DROP TRIGGER IF EXISTS trg_after_contact_duplicate_check`,
  `DROP TRIGGER IF EXISTS trg_after_activity_insert`,
  `DROP TRIGGER IF EXISTS trg_after_activity_pending`,
  `DROP TRIGGER IF EXISTS trg_after_activity_approve`,
  `DROP TRIGGER IF EXISTS trg_after_activity_reject`,
  `DROP TRIGGER IF EXISTS trg_after_inbound_reply`,
  `DROP TRIGGER IF EXISTS trg_after_deal_insert`,
  `DROP TRIGGER IF EXISTS trg_after_deal_won`,
  `DROP TRIGGER IF EXISTS trg_after_deal_lost`,
  `DROP TRIGGER IF EXISTS trg_after_deal_forecast`,
  `DROP TRIGGER IF EXISTS trg_crm_activities_no_delete`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_contact_insert
   AFTER INSERT ON crm_contacts
   BEGIN
     INSERT INTO crm_analytics (profile_id, total_contacts, total_leads, total_customers, total_prospects)
     VALUES (NEW.profile_id, 1,
       CASE WHEN NEW.status = 'lead'     THEN 1 ELSE 0 END,
       CASE WHEN NEW.status = 'customer' THEN 1 ELSE 0 END,
       CASE WHEN NEW.status = 'prospect' THEN 1 ELSE 0 END
     )
     ON CONFLICT(profile_id) DO UPDATE SET
       total_contacts  = total_contacts + 1,
       total_leads     = total_leads     + CASE WHEN NEW.status = 'lead'     THEN 1 ELSE 0 END,
       total_customers = total_customers + CASE WHEN NEW.status = 'customer' THEN 1 ELSE 0 END,
       total_prospects = total_prospects + CASE WHEN NEW.status = 'prospect' THEN 1 ELSE 0 END,
       updated_at      = strftime('%s','now');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_contact_converted
   AFTER UPDATE OF status ON crm_contacts
   WHEN NEW.status = 'customer' AND OLD.status != 'customer'
   BEGIN
     UPDATE crm_analytics SET
       total_customers = total_customers + 1,
       total_converted = total_converted + 1,
       total_leads     = MAX(0, total_leads     - CASE WHEN OLD.status = 'lead'     THEN 1 ELSE 0 END),
       total_prospects = MAX(0, total_prospects - CASE WHEN OLD.status = 'prospect' THEN 1 ELSE 0 END),
       updated_at      = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_contact_archived
   AFTER UPDATE OF archived ON crm_contacts
   WHEN NEW.archived = 1 AND OLD.archived = 0
   BEGIN
     UPDATE crm_analytics SET
       total_archived = total_archived + 1,
       updated_at     = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_contact_duplicate_check
   AFTER INSERT ON crm_contacts
   WHEN NEW.email IS NOT NULL
   BEGIN
     UPDATE crm_contacts SET
       is_duplicate = 1,
       duplicate_of = (
         SELECT id FROM crm_contacts
         WHERE id != NEW.id
           AND profile_id = NEW.profile_id
           AND email = NEW.email
         LIMIT 1
       )
     WHERE id = NEW.id
       AND EXISTS (
         SELECT 1 FROM crm_contacts
         WHERE id != NEW.id
           AND profile_id = NEW.profile_id
           AND email = NEW.email
       );
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_activity_insert
   AFTER INSERT ON crm_activities
   WHEN NEW.sender = 'agent'
   BEGIN
     INSERT INTO crm_analytics (profile_id, total_agent_actions, total_outreach_sent)
     VALUES (NEW.profile_id, 1,
       CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END
     )
     ON CONFLICT(profile_id) DO UPDATE SET
       total_agent_actions = total_agent_actions + 1,
       total_outreach_sent = total_outreach_sent + CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
       updated_at          = strftime('%s','now');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_activity_pending
   AFTER INSERT ON crm_activities
   WHEN NEW.sender = 'agent' AND NEW.approval_status = 'pending_approval'
   BEGIN
     UPDATE crm_analytics SET
       total_pending_approvals = total_pending_approvals + 1,
       updated_at              = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_activity_approve
   AFTER UPDATE OF approval_status ON crm_activities
   WHEN OLD.approval_status = 'pending_approval'
     AND (NEW.approval_status = 'approved' OR NEW.approval_status = 'auto_sent')
   BEGIN
     UPDATE crm_analytics SET
       total_pending_approvals = MAX(0, total_pending_approvals - 1),
       total_approved          = total_approved + 1,
       updated_at              = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_activity_reject
   AFTER UPDATE OF approval_status ON crm_activities
   WHEN OLD.approval_status = 'pending_approval' AND NEW.approval_status = 'rejected'
   BEGIN
     UPDATE crm_analytics SET
       total_pending_approvals = MAX(0, total_pending_approvals - 1),
       total_rejected          = total_rejected + 1,
       updated_at              = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_inbound_reply
   AFTER INSERT ON crm_activities
   WHEN NEW.direction = 'inbound'
   BEGIN
     UPDATE crm_analytics SET
       total_replies = total_replies + 1,
       updated_at    = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_deal_insert
   AFTER INSERT ON crm_deals
   BEGIN
     UPDATE crm_analytics SET
       total_deals            = total_deals + 1,
       open_deals             = open_deals + 1,
       total_deal_value_cents = total_deal_value_cents + NEW.value_cents,
       updated_at             = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_deal_won
   AFTER UPDATE OF stage ON crm_deals
   WHEN NEW.stage = 'won' AND OLD.stage != 'won'
   BEGIN
     UPDATE crm_analytics SET
       won_deals            = won_deals + 1,
       open_deals           = MAX(0, open_deals - 1),
       won_deal_value_cents = won_deal_value_cents + NEW.value_cents,
       updated_at           = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_deal_lost
   AFTER UPDATE OF stage ON crm_deals
   WHEN NEW.stage = 'lost' AND OLD.stage != 'lost'
   BEGIN
     UPDATE crm_analytics SET
       lost_deals = lost_deals + 1,
       open_deals = MAX(0, open_deals - 1),
       updated_at = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_after_deal_forecast
   AFTER UPDATE OF value_cents, probability, expected_close_at ON crm_deals
   BEGIN
     UPDATE crm_analytics SET
       forecast_this_month_cents = (
         SELECT COALESCE(SUM(value_cents * probability / 100), 0)
         FROM crm_deals
         WHERE profile_id = NEW.profile_id
           AND stage NOT IN ('won','lost')
           AND strftime('%Y-%m', expected_close_at, 'unixepoch') = strftime('%Y-%m','now')
       ),
       forecast_next_month_cents = (
         SELECT COALESCE(SUM(value_cents * probability / 100), 0)
         FROM crm_deals
         WHERE profile_id = NEW.profile_id
           AND stage NOT IN ('won','lost')
           AND strftime('%Y-%m', expected_close_at, 'unixepoch') = strftime('%Y-%m','now','+1 month')
       ),
       updated_at = strftime('%s','now')
     WHERE profile_id = NEW.profile_id;
   END`,

  // ── P0-7: crm_activities append-only guard ────────────────────────────────
  // Activities are the immutable event log of the CRM.
  // Agent + human interactions MUST NOT be deleted (compliance, trust, audit).
  //
  // BEFORE DELETE aborts any DELETE against crm_activities.
  //
  // Why not BEFORE UPDATE?
  //   The approval flow legitimately UPDATEs approval_status:
  //     pending_approval → approved | rejected | auto_sent
  //   read_at is also written on inbox mark-read.
  //   Blocking all UPDATEs would break the approval flow.
  //   Use column-level auditing (agent_audit table) for mutation tracking instead.
  //
  // Workaround for test data: use a dedicated test profile or set a
  // `is_test INTEGER DEFAULT 0` column and filter, not delete.
  `CREATE TRIGGER IF NOT EXISTS trg_crm_activities_no_delete
   BEFORE DELETE ON crm_activities
   BEGIN
     SELECT RAISE(ABORT, 'crm_activities is append-only — activities cannot be deleted');
   END`,
];

// ─────────────────────────────────────────────────────────────────────────────
// Column migrations — EMPTY: all columns and indexes are in CREATE TABLE above.
// Kept as an empty export to avoid breaking provision.ts imports during transition.
// TODO: Remove this export and its provision.ts reference after next deploy.
// ─────────────────────────────────────────────────────────────────────────────
export const CRM_MIGRATIONS_SQL: Array<{ table: string; sql: string }> = [];

// ─────────────────────────────────────────────────────────────────────────────
// Group presets — UI dropdown only, never inserted into DB automatically
// ─────────────────────────────────────────────────────────────────────────────
export const CRM_GROUP_PRESETS = [
  { name: 'Family',           icon: '🏠' },
  { name: 'Co-workers',       icon: '👾' },
  { name: 'College Friends',  icon: '🎓' },
  { name: 'Startup Founders', icon: '🚀' },
  { name: 'Investors',        icon: '🤑' },
  { name: 'Lunchclub',        icon: '🌮' },
  { name: 'Mentors',          icon: '🙏' },
  { name: 'Clients',          icon: '💼' },
  { name: 'Partners',         icon: '🤝' },
  { name: 'Leads',            icon: '🎯' },
  { name: 'VIP',              icon: '⭐' },
  { name: 'Newsletter',       icon: '📧' },
  { name: 'Community',        icon: '🌍' },
  { name: 'Podcast Guests',   icon: '🎙️' },
  { name: 'Conference',       icon: '🎪' },
  { name: 'Cold Outreach',    icon: '❄️' },
  { name: 'Friends',          icon: '👋' },
  { name: 'Alumni',           icon: '🏛️' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Analytics drift recovery — run if analytics drift (e.g. agent ran before
// triggers existed). Expose as POST /api/crm/resync or run in Turso SQL editor.
// ─────────────────────────────────────────────────────────────────────────────
export const CRM_ANALYTICS_RESYNC_SQL = `
UPDATE crm_analytics SET
  total_contacts          = (SELECT COUNT(*) FROM crm_contacts WHERE profile_id = crm_analytics.profile_id),
  total_leads             = (SELECT COUNT(*) FROM crm_contacts WHERE profile_id = crm_analytics.profile_id AND status = 'lead'),
  total_prospects         = (SELECT COUNT(*) FROM crm_contacts WHERE profile_id = crm_analytics.profile_id AND status = 'prospect'),
  total_customers         = (SELECT COUNT(*) FROM crm_contacts WHERE profile_id = crm_analytics.profile_id AND status = 'customer'),
  total_archived          = (SELECT COUNT(*) FROM crm_contacts WHERE profile_id = crm_analytics.profile_id AND archived = 1),
  total_converted         = (SELECT COUNT(*) FROM crm_contacts WHERE profile_id = crm_analytics.profile_id AND status = 'customer'),
  total_deals             = (SELECT COUNT(*) FROM crm_deals WHERE profile_id = crm_analytics.profile_id),
  open_deals              = (SELECT COUNT(*) FROM crm_deals WHERE profile_id = crm_analytics.profile_id AND stage NOT IN ('won','lost')),
  won_deals               = (SELECT COUNT(*) FROM crm_deals WHERE profile_id = crm_analytics.profile_id AND stage = 'won'),
  lost_deals              = (SELECT COUNT(*) FROM crm_deals WHERE profile_id = crm_analytics.profile_id AND stage = 'lost'),
  total_deal_value_cents  = (SELECT COALESCE(SUM(value_cents),0) FROM crm_deals WHERE profile_id = crm_analytics.profile_id),
  won_deal_value_cents    = (SELECT COALESCE(SUM(value_cents),0) FROM crm_deals WHERE profile_id = crm_analytics.profile_id AND stage = 'won'),
  total_agent_actions     = (SELECT COUNT(*) FROM crm_activities WHERE profile_id = crm_analytics.profile_id AND sender = 'agent'),
  total_replies           = (SELECT COUNT(*) FROM crm_activities WHERE profile_id = crm_analytics.profile_id AND direction = 'inbound'),
  total_outreach_sent     = (SELECT COUNT(*) FROM crm_activities WHERE profile_id = crm_analytics.profile_id AND direction = 'outbound'),
  total_pending_approvals = (SELECT COUNT(*) FROM crm_activities WHERE profile_id = crm_analytics.profile_id AND approval_status = 'pending_approval'),
  total_approved          = (SELECT COUNT(*) FROM crm_activities WHERE profile_id = crm_analytics.profile_id AND approval_status = 'approved'),
  total_rejected          = (SELECT COUNT(*) FROM crm_activities WHERE profile_id = crm_analytics.profile_id AND approval_status = 'rejected'),
  updated_at              = strftime('%s','now');
`;
