import { createClient } from "@libsql/client/web";
import { CRM_SCHEMA_SQL, CRM_MIGRATIONS_SQL } from './crm';
import { PROFILE_DATA_SYNC_TRIGGERS_SQL } from "./profile-data";
import { FORMS_SCHEMA_SQL, FORMS_TRIGGERS_SQL } from './forms';
import { JOBS_SCHEMA_SQL, JOBS_TRIGGERS_SQL } from './jobs';
import { SOCIAL_SCHEMA_SQL, SOCIAL_MIGRATIONS_SQL, SOCIAL_TRIGGERS_SQL, SOCIAL_ANALYTICS_VIEW_SQL, SOCIAL_POSTS_ANALYTICS_VIEW_SQL, seedSocialLabels } from './social';
import { CONTENT_SCHEMA_SQL, DEFAULT_CMS_PAGES, CONTENT_TRIGGERS_SQL } from './content';
import { CHAT_AGENT_SCHEMA_SQL, CHAT_AGENT_MIGRATIONS_SQL, VOICE_CALLS_SCHEMA_SQL } from '~/db/chat-agent';
import { AGENTS_SCHEMA_SQL, seedAgents } from './agent';
import { COMMUNITY_SCHEMA_SQL, COMMUNITY_MIGRATIONS_SQL, COMMUNITY_LEADERBOARD_VIEW_SQL, COMMUNITY_ONLINE_VIEW_SQL } from './community';
import { COMMUNITY_TRIGGERS_SQL } from './community-triggers';
import { AFFILIATE_SCHEMA_SQL, AFFILIATE_MIGRATIONS_SQL } from './affiliate';
import { EMAIL_TRACKING_SCHEMA_SQL, EMAIL_TRACKING_MIGRATIONS_SQL, EMAIL_TRACKING_TRIGGERS_SQL } from './email-tracking';
import { PRODUCT_TRIGGERS_SQL } from './product-triggers';
import { GSC_SCHEMA_SQL, GSC_TRIGGERS_SQL, GSC_VIEWS_SQL, GSC_MIGRATIONS_SQL } from './gsc';
import { provisionGSCTables } from './gsc-service';
import { ADS_SCHEMA_SQL, ADS_MIGRATIONS_SQL, ADS_TRIGGERS_SQL, ADS_VIEWS_SQL } from './ads';
import { REVIEW_SCHEMA_SQL, REVIEW_MIGRATIONS_SQL, REVIEW_TRIGGERS_SQL, REVIEW_VIEWS_SQL } from './review';
import { FEEDBACK_SCHEMA_SQL, FEEDBACK_LEADERBOARD_VIEW_SQL, FEEDBACK_BOARD_CONTEXT_VIEW_SQL, FEEDBACK_TRENDING_VIEW_SQL } from './feedback';

// ─────────────────────────────────────────────────────────────────────────────
// UserDB schema — mirrors central DB (central-full-schema.md)
//
// Excluded (central-only): userdb, userauth, plans, subscriptions,
//   affiliate_profiles, commissions, payouts, commission_payouts, referrals,
//   teams, team_members, team_invites, team_activity_log, analytics,
//   domain_verifications, integrations
//
// UserDB-only extras:  credentials, settings
// Domain mirrors:      posts (/blog), job_listings + job_applications (/jobs),
//                      forms + questions + submissions + form_analytics (/forms),
//                      doc_collections + doc_articles (/docs)
//
// Each CREATE TABLE is immediately followed by its CREATE INDEX statements.
// ─────────────────────────────────────────────────────────────────────────────
const SCHEMA_SQL = [

  // ── _schema_migrations — P0-10 ────────────────────────────────────────────
  // Version tracking for UserDB schema evolution.
  // provisionUserDatabase() is idempotent; this table records what ran and when.
  // Admin query: SELECT id, error FROM _schema_migrations WHERE error IS NOT NULL
  `CREATE TABLE IF NOT EXISTS _schema_migrations (
    id          TEXT PRIMARY KEY,
    applied_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    duration_ms INTEGER,
    error       TEXT
  )`,
  // Insert a row whenever provision succeeds — ON CONFLICT IGNORE means re-runs
  // don't duplicate entries. Use provision.ts's own migration key format:
  // 'provision_v{N}' where N increments per schema change batch.


  // ── users ────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    workos_id TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT,
    last_name TEXT,
    username TEXT UNIQUE,
    bio TEXT,
    location TEXT,
    website TEXT,
    social_links TEXT NOT NULL DEFAULT '[]',
    profile_picture_url TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    last_login INTEGER,
    is_active INTEGER DEFAULT 1
  )`,

  // ── credentials (userDB-only) ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    profile_id TEXT,
    ses_access_key TEXT,
    ses_secret_key TEXT,
    ses_region TEXT,
    ses_from_email TEXT,
    openai_api_key TEXT,
    anthropic_api_key TEXT,
    resend_api_key TEXT,
    n8n_webhook_url TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_credentials_profile ON credentials (profile_id)`,

  // ── settings (userDB-only) ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    site_title TEXT,
    tagline TEXT,
    site_description TEXT,
    logo_url TEXT,
    favicon TEXT,
    og_title TEXT,
    og_description TEXT,
    og_image TEXT,
    canonical_url TEXT,
    robots TEXT DEFAULT 'index,follow',
    google_tag_manager_id TEXT,
    ga_tracking_id TEXT,
    google_site_verification TEXT,
    timezone TEXT,
    location TEXT,
    industry TEXT,
    theme TEXT NOT NULL DEFAULT '{}',
    working_hours TEXT DEFAULT '{}',
    crm_auto_approve INTEGER NOT NULL DEFAULT 0,
    pipeline_stages TEXT DEFAULT '["new","contacted","proposal","negotiation","won","lost"]',
    invoice_sequence INTEGER NOT NULL DEFAULT 0,
    proposal_sequence INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_profile ON settings (profile_id)`,

  // ── categories ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    order_index INTEGER DEFAULT 0
  )`,

  // ── profiles ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    bio TEXT,
    navigation_menu TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    enabled_categories TEXT DEFAULT '["links", "startups"]',
    home_visibility TEXT DEFAULT '{}',
    category_visibility TEXT DEFAULT '{}',
    avatar_url TEXT,
    home_page TEXT,
    about TEXT,
    profile_theme TEXT DEFAULT '{}',
    collect_emails TEXT NOT NULL DEFAULT '{}',
    collect_emails_enabled INTEGER NOT NULL DEFAULT 1,
    social_links TEXT NOT NULL DEFAULT '[]',
    about_visibility TEXT NOT NULL DEFAULT '{}',
    landing_visibility TEXT NOT NULL DEFAULT '{}',
    cover_images TEXT NOT NULL DEFAULT '[]',
    info_visibility TEXT NOT NULL DEFAULT '{}',
    chat_agent_enabled INTEGER NOT NULL DEFAULT 0,
    chat_agent_model TEXT NOT NULL DEFAULT 'google/gemini-3.1-flash-lite-preview',
    chat_agent_greeting TEXT,
    chat_agent_personality TEXT,
    chat_agent_accent_color TEXT NOT NULL DEFAULT '#6366f1',
    voice_agent_enabled INTEGER NOT NULL DEFAULT 0,
    voice_agent_show_circle INTEGER NOT NULL DEFAULT 1,
    voice_agent_personality TEXT,
    support_email TEXT,
    from_email TEXT,
    chat_widget_tab TEXT NOT NULL DEFAULT '[]',
    page_visibility TEXT NOT NULL DEFAULT '{}',
    type TEXT,
    niche TEXT,
    minimum_age INTEGER NOT NULL DEFAULT 0,
    resume TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id)`,

  // ── links ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    category_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    order_index INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    keywords TEXT DEFAULT '',
    hidden_from_profile INTEGER DEFAULT 0,
    sale_price TEXT,
    price TEXT,
    button_text TEXT,
    location TEXT,
    date TEXT,
    collection_name TEXT,
    video_url TEXT,
    logo_url TEXT,
    post_url TEXT,
    platform_name TEXT,
    collection_id TEXT,
    slug TEXT UNIQUE,
    in_app INTEGER NOT NULL DEFAULT 0,
    geo_redirect TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_links_profile_id ON links (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_links_category_id ON links (category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_links_collection_id ON links (collection_id)`,

  // ── link_analytics ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS link_analytics (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    total_clicks INTEGER DEFAULT 0,
    device_clicks TEXT DEFAULT '{}',
    os_clicks TEXT DEFAULT '{}',
    browser_clicks TEXT DEFAULT '{}',
    country_clicks TEXT DEFAULT '{}',
    city_clicks TEXT DEFAULT '{}',
    referrer_clicks TEXT DEFAULT '{}',
    analytics_lifetime TEXT DEFAULT '{}',
    analytics_24h TEXT DEFAULT '[]',
    analytics_7d TEXT DEFAULT '[]',
    analytics_30d TEXT DEFAULT '[]',
    analytics_12m TEXT DEFAULT '[]',
    utm_source_clicks TEXT DEFAULT '{}',
    utm_medium_clicks TEXT DEFAULT '{}',
    utm_campaign_clicks TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    last_aggregated_at INTEGER DEFAULT 0,
    bot_clicks INTEGER DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_link_analytics_link_id ON link_analytics (link_id)`,

  // ── link_analytics_by_category (1 row/category per profile) ──
  `CREATE TABLE IF NOT EXISTS link_analytics_by_category (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    total_links INTEGER NOT NULL DEFAULT 0,
    active_links INTEGER NOT NULL DEFAULT 0,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    bot_clicks INTEGER NOT NULL DEFAULT 0,
    bot_views INTEGER NOT NULL DEFAULT 0,
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
    device_clicks TEXT NOT NULL DEFAULT '{}',
    os_clicks TEXT NOT NULL DEFAULT '{}',
    browser_clicks TEXT NOT NULL DEFAULT '{}',
    country_clicks TEXT NOT NULL DEFAULT '{}',
    city_clicks TEXT NOT NULL DEFAULT '{}',
    referrer_clicks TEXT NOT NULL DEFAULT '{}',
    analytics_lifetime TEXT NOT NULL DEFAULT '{}',
    analytics_7d TEXT NOT NULL DEFAULT '[]',
    analytics_30d TEXT NOT NULL DEFAULT '[]',
    analytics_12m TEXT NOT NULL DEFAULT '[]',
    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(profile_id, category_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_link_analytics_by_category_profile ON link_analytics_by_category (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_link_analytics_by_category_category ON link_analytics_by_category (category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_link_analytics_profile_id ON link_analytics (profile_id)`,

  // ── clicks_analytics (raw append-only, one row per click, aggregated into link_analytics) ──
  `CREATE TABLE IF NOT EXISTS clicks_analytics (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    device TEXT,
    os TEXT,
    browser TEXT,
    country TEXT,
    city TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    clicked_at INTEGER DEFAULT (strftime('%s','now')),
    is_bot INTEGER DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_clicks_analytics_link_id ON clicks_analytics (link_id)`,
  `CREATE INDEX IF NOT EXISTS idx_clicks_analytics_profile_id ON clicks_analytics (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_clicks_analytics_clicked_at ON clicks_analytics (clicked_at)`,
  // P1-3: composite index for retention + aggregation queries (profile+time)
  `CREATE INDEX IF NOT EXISTS idx_clicks_profile_time ON clicks_analytics (profile_id, clicked_at)`,

  // ── profile_data (1 row per profile - Context table for AI Agents) ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS profile_data (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_data_profile_id ON profile_data (profile_id)`,

  // ── collections (article groupings + optional SEO overrides) ─────────────
  `CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL DEFAULT '',
    description TEXT,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    type TEXT,
    category_id TEXT,
    category_slug TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_og_image TEXT,
    seo_robots TEXT,
    seo_block_indexing INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_collections_profile_id ON collections (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_collections_profile_type ON collections (profile_id, type)`,
  `CREATE INDEX IF NOT EXISTS idx_collections_profile_slug ON collections (profile_id, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_collections_category_id ON collections (category_id)`,

  // ── category_pages (per-category SEO settings — replaces old collections purpose) ──
  `CREATE TABLE IF NOT EXISTS category_pages (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    category_id TEXT,
    category_slug TEXT NOT NULL,
    seo_title TEXT,
    seo_description TEXT,
    seo_og_image TEXT,
    seo_robots TEXT,
    seo_block_indexing INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    description TEXT,
    ads_code_sidebar TEXT,
    ads_code_top TEXT,
    ads_code_bottom TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    hidden INTEGER NOT NULL DEFAULT 0,
    image_ads TEXT DEFAULT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    nav_active INTEGER NOT NULL DEFAULT 1,
    menu_active INTEGER NOT NULL DEFAULT 1,
    footer_active INTEGER NOT NULL DEFAULT 1,
    section TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_category_pages_profile_cat ON category_pages (profile_id, category_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_category_pages_profile_id ON category_pages (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_category_pages_category_id ON category_pages (category_id)`,

  // ── products (51 cols) ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    slider_id TEXT,
    external_product_id TEXT,
    user_id TEXT NOT NULL,
    community_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    description TEXT,
    price_cents INTEGER NOT NULL DEFAULT 0,
    sale_price_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'usd',
    is_active INTEGER NOT NULL DEFAULT 1,
    thumbnail_url TEXT,
    hero_image_url TEXT,
    slug TEXT UNIQUE,
    file_url TEXT,
    lessons TEXT,
    total_lessons INTEGER NOT NULL DEFAULT 0,
    add_people TEXT DEFAULT '[]',
    location_map TEXT,
    media_url TEXT DEFAULT '[]',
    forms_id TEXT,
    duration_minutes INTEGER,
    calendar_link TEXT,
    scheduling_provider TEXT,
    scheduling_metadata TEXT,
    webinar_link TEXT,
    webinar_platform TEXT,
    webinar_schedule TEXT,
    billing_interval TEXT,
    features TEXT,
    tags TEXT,
    settings TEXT,
    visibility TEXT NOT NULL DEFAULT 'published',
    max_sales INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    published_at INTEGER,
    archived_at INTEGER,
    cover_video_url TEXT,
    product_rating TEXT DEFAULT '{"total_ratings":0,"star_5":0,"star_4":0,"star_3":0,"star_2":0,"star_1":0,"average":0,"recent_reviews":[]}',
    additional_details TEXT DEFAULT '[]',
    show_total_sales INTEGER NOT NULL DEFAULT 0,
    meeting_settings TEXT,
    button_text TEXT,
    webinar_settings TEXT,
    category_id TEXT,
    cta_clicks INTEGER NOT NULL DEFAULT 0,
    platform_name TEXT,
    platform_url TEXT,
    post_frequency TEXT,
    event_settings TEXT,
    cta_button TEXT DEFAULT '{}',
    unit INTEGER DEFAULT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    hide_author INTEGER NOT NULL DEFAULT 0,
    image_ads TEXT DEFAULT NULL,
    collection_id TEXT,
    confirmation_email_subject TEXT,
    confirmation_email_body TEXT,
    up_sell TEXT DEFAULT '[]',
    ai_summary TEXT,
    course_access_type TEXT DEFAULT 'open',
    course_access_config TEXT DEFAULT '{}',
    seo_title TEXT,
    seo_description TEXT,
    seo_og_image TEXT,
    seo_robots TEXT,
    seo_block_indexing INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_profile ON products (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_user ON products (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_type ON products (type)`,
  `CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_collection_id ON products (collection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_cta_clicks ON products (cta_clicks)`,

  // ── product_analytics ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS product_analytics (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    total_sales INTEGER NOT NULL DEFAULT 0,
    total_revenue_cents INTEGER NOT NULL DEFAULT 0,
    bot_views INTEGER NOT NULL DEFAULT 0,
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
    device_breakdown TEXT NOT NULL DEFAULT '{}',
    os_breakdown TEXT NOT NULL DEFAULT '{}',
    browser_breakdown TEXT NOT NULL DEFAULT '{}',
    country_breakdown TEXT NOT NULL DEFAULT '{}',
    city_breakdown TEXT NOT NULL DEFAULT '{}',
    referrer_breakdown TEXT NOT NULL DEFAULT '{}',
    sales_7d TEXT NOT NULL DEFAULT '[]',
    sales_30d TEXT NOT NULL DEFAULT '[]',
    sales_12m TEXT NOT NULL DEFAULT '[]',
    sales_lifetime TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    revenue_7d TEXT NOT NULL DEFAULT '[]',
    revenue_30d TEXT NOT NULL DEFAULT '[]',
    revenue_12m TEXT NOT NULL DEFAULT '[]',
    revenue_lifetime TEXT NOT NULL DEFAULT '{}',
    sales_utm_source TEXT NOT NULL DEFAULT '{}',
    sales_utm_medium TEXT NOT NULL DEFAULT '{}',
    sales_utm_campaign TEXT NOT NULL DEFAULT '{}',
    email_opens INTEGER NOT NULL DEFAULT 0,
    email_clicks INTEGER NOT NULL DEFAULT 0,
    last_aggregated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_product_analytics_product_id ON product_analytics (product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_product_analytics_profile_id ON product_analytics (profile_id)`,

  // ── profile_analytics (1 row per profile) ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS profile_analytics (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL UNIQUE,
    bot_views INTEGER NOT NULL DEFAULT 0,
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
    total_clicks INTEGER NOT NULL DEFAULT 0,
    total_sales INTEGER NOT NULL DEFAULT 0,
    total_earnings INTEGER NOT NULL DEFAULT 0,
    bot_clicks INTEGER NOT NULL DEFAULT 0,
    device_clicks TEXT NOT NULL DEFAULT '{}',
    os_clicks TEXT NOT NULL DEFAULT '{}',
    browser_clicks TEXT NOT NULL DEFAULT '{}',
    country_clicks TEXT NOT NULL DEFAULT '{}',
    city_clicks TEXT NOT NULL DEFAULT '{}',
    referrer_clicks TEXT NOT NULL DEFAULT '{}',
    analytics_lifetime TEXT NOT NULL DEFAULT '{}',
    analytics_24h TEXT NOT NULL DEFAULT '[]',
    analytics_7d TEXT NOT NULL DEFAULT '[]',
    analytics_30d TEXT NOT NULL DEFAULT '[]',
    analytics_12m TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    sales_7d TEXT NOT NULL DEFAULT '[]',
    sales_30d TEXT NOT NULL DEFAULT '[]',
    sales_12m TEXT NOT NULL DEFAULT '[]',
    sales_lifetime TEXT NOT NULL DEFAULT '{}',
    sales_device TEXT NOT NULL DEFAULT '{}',
    sales_os TEXT NOT NULL DEFAULT '{}',
    sales_browser TEXT NOT NULL DEFAULT '{}',
    sales_countries TEXT NOT NULL DEFAULT '{}',
    sales_cities TEXT NOT NULL DEFAULT '{}',
    sales_referrer TEXT NOT NULL DEFAULT '{}',
    revenue_7d TEXT NOT NULL DEFAULT '[]',
    revenue_30d TEXT NOT NULL DEFAULT '[]',
    revenue_12m TEXT NOT NULL DEFAULT '[]',
    revenue_lifetime TEXT NOT NULL DEFAULT '{}',
    utm_source_clicks TEXT NOT NULL DEFAULT '{}',
    utm_medium_clicks TEXT NOT NULL DEFAULT '{}',
    utm_campaign_clicks TEXT NOT NULL DEFAULT '{}',
    sales_utm_source TEXT NOT NULL DEFAULT '{}',
    sales_utm_medium TEXT NOT NULL DEFAULT '{}',
    sales_utm_campaign TEXT NOT NULL DEFAULT '{}',
    total_products INTEGER NOT NULL DEFAULT 0,
    total_links INTEGER NOT NULL DEFAULT 0,
    active_links INTEGER NOT NULL DEFAULT 0,
    product_email_opens INTEGER NOT NULL DEFAULT 0,
    product_email_clicks INTEGER NOT NULL DEFAULT 0,
    last_aggregated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_analytics_profile_id ON profile_analytics (profile_id)`,

  // ── purchases ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    community_member_id TEXT,
    transaction_id TEXT,
    email TEXT NOT NULL,
    customer_name TEXT,
    amount_cents INTEGER NOT NULL,
    platform_fee_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    payment_processor TEXT NOT NULL,
    payment_reference TEXT,
    payment_status TEXT NOT NULL DEFAULT 'completed',
    status TEXT NOT NULL DEFAULT 'active',
    access_token TEXT NOT NULL UNIQUE,
    access_token_secret TEXT,
    access_token_expires_at INTEGER,
    last_accessed_at INTEGER,
    access_count INTEGER NOT NULL DEFAULT 0,
    course_progress TEXT,
    course_completed INTEGER NOT NULL DEFAULT 0,
    review_reply TEXT,
    course_completion_date INTEGER,
    consultancy_scheduled_at INTEGER,
    consultancy_meeting_link TEXT,
    consultancy_status TEXT,
    subscription_id TEXT,
    subscription_status TEXT,
    subscription_current_period_end INTEGER,
    webinar_access_link TEXT,
    webinar_scheduled_at INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    rating_star INTEGER,
    rating_review TEXT,
    rated_at INTEGER,
    buyer_avatar_url TEXT,
    slots TEXT,
    meeting_link TEXT,
    customer_message TEXT,
    rating_reply TEXT,
    approval_status TEXT DEFAULT 'pending',
    device TEXT,
    os TEXT,
    browser TEXT,
    referrer TEXT,
    city TEXT,
    country TEXT,
    timezone TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    refunded_at INTEGER,
    refund_reason TEXT,
    -- Email engagement tracking (trigger-written from email_events)
    -- Lets you see per-purchase: did this buyer open/click the confirmation email?
    email_opened_at INTEGER,             -- first pixel fire — NULL = never opened
    email_open_count INTEGER NOT NULL DEFAULT 0,  -- total opens (tracks re-opens)
    email_clicked_at INTEGER             -- first CTA click in email — NULL = never clicked
  )`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_profile ON purchases (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_product ON purchases (product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases (email)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_community_member_id ON purchases (community_member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases (status)`,

  // ── sessions ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT,
    ip_address TEXT,
    user_agent TEXT
  )`,
  // ── subscribers ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    referrer_domain TEXT,
    timezone TEXT,
    browser_name TEXT,
    os_name TEXT,
    device_type TEXT,
    ip_address TEXT,
    country TEXT,
    city TEXT,
    is_blocked INT DEFAULT 0,
    is_unsubscribed INT DEFAULT 0,
    blocked_at INTEGER,
    unsubscribed_at INTEGER,
    block_reason TEXT,
    signup_timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subscribers_profile_id ON subscribers (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers (email)`,
  `CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers (is_blocked, is_unsubscribed)`,

  // ── gateways ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS gateways (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    is_test_mode INTEGER NOT NULL DEFAULT 1,
    credentials TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_gateways_profile_provider ON gateways (profile_id, provider)`,
  `CREATE INDEX IF NOT EXISTS idx_gateways_profile_id ON gateways (profile_id)`,

  // ── pages ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    media_id TEXT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    excerpt TEXT,
    text_field TEXT,
    hero_slider TEXT,
    hero_section TEXT,
    testimonials TEXT,
    pricing TEXT,
    faq TEXT,
    trusted_by TEXT,
    intro_section TEXT,
    heighlights TEXT,
    category_visibility TEXT,
    curriculum TEXT,
    people_section TEXT,
    about_section TEXT,
    cta_section TEXT,
    nav_active INTEGER DEFAULT 1,
    menu_active INTEGER DEFAULT 1,
    footer_active INTEGER DEFAULT 1,
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0,
    ai_summary TEXT,
    lead_magnet TEXT,
    text_area TEXT,
    subscribe_chat TEXT,
    content_list TEXT,
    custom_design_a TEXT,
    custom_design_b TEXT,
    custom_design_c TEXT,
    section_a TEXT,
    section_b TEXT,
    section_c TEXT,
    section_d TEXT,
    section_e TEXT,
    section_f TEXT,
    section_g TEXT,
    section_h TEXT,
    section_i TEXT,
    section_j TEXT,
    contact_us TEXT,
    subscribe TEXT,
    slider TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pages_profile_id ON pages (profile_id)`,
  
  // ── page_analytics ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS page_analytics (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    bot_views INTEGER NOT NULL DEFAULT 0,
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
    last_aggregated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_page_analytics_page_id ON page_analytics (page_id)`,
  `CREATE INDEX IF NOT EXISTS idx_page_analytics_profile_id ON page_analytics (profile_id)`,



  // ── /jobs — CockroachDB mirror ────────────────────────────────────────────
  ...JOBS_SCHEMA_SQL,

  // ── /forms — TigerDB mirror ───────────────────────────────────────────────
  ...FORMS_SCHEMA_SQL,

  // ── /blog, /newsletter, /notes, /guides, /skills, /prompt, /compare, /alternative, /docs ──
  ...CONTENT_SCHEMA_SQL,
  ...CONTENT_TRIGGERS_SQL,
  ...GSC_SCHEMA_SQL,
  ...GSC_TRIGGERS_SQL,
  ...GSC_VIEWS_SQL,

  // ── cms_tables (userDB only) ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS cms_tables (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    content TEXT,
    excerpt TEXT,
    hero_image_url TEXT,
    cta_button_url TEXT,
    cta_button_text TEXT,
    faqs TEXT DEFAULT '{}',
    additional_details TEXT DEFAULT '[]',
    published INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    date TEXT,
    collection_id TEXT,
    hide_author INTEGER NOT NULL DEFAULT 0,
    image_ads TEXT DEFAULT NULL,
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
    social_links TEXT DEFAULT '[]',
    website TEXT,
    logo_url TEXT,
    name TEXT,
    tagline TEXT,
    highlights TEXT DEFAULT '[]',
    hide_info INTEGER NOT NULL DEFAULT 0,
    cms_id TEXT,
    location TEXT,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cms_tables_profile ON cms_tables (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_cms_tables_collection ON cms_tables (collection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cms_tables_cms_id ON cms_tables (cms_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_tables_cms_id_slug ON cms_tables (profile_id, cms_id, slug)`,

  // ── reviews and testimonials (userDB only) ────────────────────────────────
  ...REVIEW_SCHEMA_SQL,

  // ── CRM (7 tables: crm_contacts, crm_deals, crm_activities, crm_tasks, crm_notes, crm_analytics, crm_groups)
  // Also includes: crm_proposals, crm_invoices (from crm-left-schema.md)
  // All defined in src/lib/crm.ts → CRM_SCHEMA_SQL
  ...CRM_SCHEMA_SQL,

  // ── Social (connections, social_accounts, social_posts, social_post_platforms,
  //           social_queue, social_analytics, social_inbox, social_labels, social_automations)
  // All defined in src/lib/social.ts → SOCIAL_SCHEMA_SQL
  ...SOCIAL_SCHEMA_SQL,
  SOCIAL_ANALYTICS_VIEW_SQL,
  SOCIAL_POSTS_ANALYTICS_VIEW_SQL,

  // ── Chat Agent (chat_sessions, chat_messages) ──
  ...CHAT_AGENT_SCHEMA_SQL,

  // ── Voice calls ──────────────────────────────────────────────────────────
  ...VOICE_CALLS_SCHEMA_SQL,

  // ── Agent infrastructure (agents, agent_skills, agent_memory, agent_notes,
  //    agent_files, agent_tasks, agent_reports, agent_kb, agent_conversations)
  //  All defined in src/lib/agent.ts → AGENTS_SCHEMA_SQL
  ...AGENTS_SCHEMA_SQL,

  // ── Community (communities, community_categories, community_members,
  //    community_posts, community_comments, community_post_reactions,
  //    community_events, community_event_rsvps, community_leaderboard,
  //    community_badges, community_member_badges, community_dms,
  //    community_notifications, community_analytics)
  //  All defined in src/lib/community.ts → COMMUNITY_SCHEMA_SQL
  ...COMMUNITY_SCHEMA_SQL,

  // ── User Affiliate Program (user_affiliate_programs, user_affiliate_referrers,
  //    user_affiliate_commissions, user_affiliate_payouts)
  //  Allows each creator to run their own affiliate program for community/products.
  //  All defined in src/lib/affiliate.ts → AFFILIATE_SCHEMA_SQL
  ...AFFILIATE_SCHEMA_SQL,

  // ── Advertising (ad_accounts, ad_campaigns, ad_groups, ads, ad_creatives,
  //    ad_audiences, ad_analytics, ad_snapshots)
  // All defined in src/lib/ads.ts → ADS_SCHEMA_SQL
  ...ADS_SCHEMA_SQL,
  ...ADS_VIEWS_SQL,

  // ── Email Tracking System
  //  All defined in src/lib/email-tracking.ts → EMAIL_TRACKING_SCHEMA_SQL
  ...EMAIL_TRACKING_SCHEMA_SQL,

  // ── Feedback (boards, posts, votes, comments, etc)
  // All defined in src/lib/feedback.ts → FEEDBACK_SCHEMA_SQL
  ...FEEDBACK_SCHEMA_SQL,
  FEEDBACK_LEADERBOARD_VIEW_SQL,
  FEEDBACK_BOARD_CONTEXT_VIEW_SQL,
  FEEDBACK_TRENDING_VIEW_SQL,
  
  // ── Community views
  COMMUNITY_LEADERBOARD_VIEW_SQL,
  COMMUNITY_ONLINE_VIEW_SQL,
  
  // ── Review views
  ...REVIEW_VIEWS_SQL,

  // ── Asset Management / Media Library ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    url TEXT NOT NULL,
    alt_text TEXT,
    thumbnail_url TEXT,
    size_bytes INTEGER,
    mime_type TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_media_profile_id ON media (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_type ON media (media_type)`,

  `CREATE TABLE IF NOT EXISTS sliders (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sliders_profile_id ON sliders (profile_id)`,

  `CREATE TABLE IF NOT EXISTS slider_items (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    slider_id TEXT NOT NULL,
    media_id TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    caption TEXT,
    link TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_slider_items_profile_id ON slider_items (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_slider_items_slider_id ON slider_items (slider_id)`,

];

// ─────────────────────────────────────────────────────────────────────────────
// Column migrations — ALTER TABLE ADD COLUMN (safe: errors ignored if exists)
// Add one entry per new column. Format: { table, column, definition }
// These run on EVERY provision call so existing DBs get backfilled.
// ─────────────────────────────────────────────────────────────────────────────
// MIGRATIONS_SQL — runs on every provision call, errors ignored per entry.
//
// ✅ Fresh-schema architecture: columns and indexes are defined in CREATE TABLE.
//    Only DATA migrations (DELETE/UPDATE) or ALTER for cols truly not in
//    initial CREATE TABLE belong here.
//
// All module spreads are currently empty []. Kept to avoid import churn.
// ─────────────────────────────────────────────────────────────────────────────
const MIGRATIONS_SQL: Array<{ table: string; sql: string }> = [
  ...EMAIL_TRACKING_MIGRATIONS_SQL,
  ...GSC_MIGRATIONS_SQL,
  ...AFFILIATE_MIGRATIONS_SQL,
  ...CRM_MIGRATIONS_SQL,
  ...SOCIAL_MIGRATIONS_SQL,
  ...ADS_MIGRATIONS_SQL,
  ...CHAT_AGENT_MIGRATIONS_SQL,
  ...COMMUNITY_MIGRATIONS_SQL,
  ...REVIEW_MIGRATIONS_SQL,

  // All spreads above are []. No migrations needed — fresh-schema architecture.

  ];


// ─────────────────────────────────────────────────────────────────────────────
// Derived exports — status page imports these instead of hardcoding numbers
// ─────────────────────────────────────────────────────────────────────────────

function countColumns(sql: string): number {
  const start = sql.indexOf('(');
  const end = sql.lastIndexOf(')');
  if (start === -1 || end === -1) return 0;

  // Strip out SQL comments to prevent counting commas inside them
  let body = sql.slice(start + 1, end);
  body = body.replace(/--.*$/gm, '');
  body = body.replace(/\/\*[\s\S]*?\*\//g, '');

  let depth = 0;
  let inString = false;
  let stringChar = '';
  let separators = 0;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (ch === stringChar && body[i - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === '\'' || ch === '"') { inString = true; stringChar = ch; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (ch === ',' && depth === 0) separators++;
  }

  const tableConstraints = (body.match(/\bCONSTRAINT\b/gi) || []).length;
  const pkConstraints = (body.match(/^\s*(PRIMARY KEY|UNIQUE)\s*\(/gim) || []).length;
  return separators + 1 - tableConstraints - pkConstraints;
}

/** tableName → expected column count (derived from SCHEMA_SQL CREATE TABLEs). */
export const EXPECTED_TABLE_COLUMNS: Record<string, number> = {};
for (const sql of SCHEMA_SQL) {
  const m = sql.match(/create table if not exists (\w+)/i);
  if (m) EXPECTED_TABLE_COLUMNS[m[1]] = countColumns(sql);
}

/** Total expected index count (derived from SCHEMA_SQL CREATE INDEXes). */
export const EXPECTED_INDEX_COUNT = SCHEMA_SQL.filter((s) =>
  s.trimStart().toLowerCase().startsWith('create')
  && s.toLowerCase().includes(' index ')
).length - 2; // Subtract 2 because SQLite optimizes away 2 redundant UNIQUE indexes

// P1-7: Soft-delete / append-only guards on revenue tables
// BEFORE DELETE triggers abort hard deletes — agents must use status fields instead.
export const REVENUE_GUARD_TRIGGERS_SQL = [
  `CREATE TRIGGER IF NOT EXISTS trg_purchases_no_delete
   BEFORE DELETE ON purchases
   BEGIN SELECT RAISE(ABORT, 'purchases are immutable — set status = ''refunded'' instead'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_subscribers_no_hard_delete
   BEFORE DELETE ON subscribers
   BEGIN SELECT RAISE(ABORT, 'subscribers are immutable — set is_unsubscribed = 1 instead'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_products_no_delete
   BEFORE DELETE ON products
   BEGIN SELECT RAISE(ABORT, 'products are immutable — set visibility = ''archived'' instead'); END`,
];

/** All trigger SQL — scans SCHEMA_SQL (has CRM triggers embedded) + separate batch arrays. */
const ALL_TRIGGERS_SQL: string[] = [
  ...SCHEMA_SQL,
  ...EMAIL_TRACKING_TRIGGERS_SQL,
  ...PRODUCT_TRIGGERS_SQL,
  ...SOCIAL_TRIGGERS_SQL,
  ...JOBS_TRIGGERS_SQL,
  ...FORMS_TRIGGERS_SQL,
  ...ADS_TRIGGERS_SQL,
  ...COMMUNITY_TRIGGERS_SQL,
  ...REVIEW_TRIGGERS_SQL,
  ...REVENUE_GUARD_TRIGGERS_SQL,
];

/** Expected trigger count — auto-updates when new triggers are added anywhere. */
export const EXPECTED_TRIGGER_COUNT = ALL_TRIGGERS_SQL.filter((s) =>
  s.trimStart().toLowerCase().includes('create trigger')
).length;

/** Expected view count — auto-updates when new views are added anywhere. */
export const EXPECTED_VIEW_COUNT = SCHEMA_SQL.filter((s) =>
  s.trimStart().toLowerCase().includes('create view')
).length;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Categories seed — mirrors central DB categories (categories.json)
// IDs are stable so they match the category_id values stored in links rows.
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ P2-5: DO NOT CHANGE EXISTING IDs. The casing inconsistency (cat_ vs Cat_) is
// LOAD-BEARING: links.category_id and products.category_id across all production
// UserDBs reference these exact strings. Only APPEND new categories.
// Never rename. Never re-case. Never reorder existing entries.
const CATEGORIES_SEED: Array<{ id: string; name: string; slug: string; description: string; order_index: number }> = [
  { id: "cat_1", name: "Links", slug: "links", description: "General links and bookmarks", order_index: 1 },
  { id: "cat_2", name: "Tools", slug: "tools", description: "Development tools and utilities", order_index: 2 },
  { id: "cat_3", name: "Gears", slug: "gears", description: "Hardware and equipment", order_index: 3 },
  { id: "cat_4", name: "Wears", slug: "wears", description: "Fashion and clothing", order_index: 4 },
  { id: "cat_5", name: "Store", slug: "store", description: "Online stores and shops", order_index: 5 },
  { id: "cat_6", name: "Shop", slug: "shop", description: "Shopping and retail", order_index: 6 },
  { id: "cat_7", name: "Books", slug: "books", description: "Books and reading materials", order_index: 7 },
  { id: "cat_8", name: "Events", slug: "events", description: "Events and conferences", order_index: 8 },
  { id: "cat_9", name: "Movies", slug: "movies", description: "Movies and entertainment", order_index: 9 },
  { id: "cat_10", name: "Music", slug: "music", description: "Music and audio content", order_index: 10 },
  { id: "cat_11", name: "Portfolio", slug: "portfolio", description: "Portfolio and work samples", order_index: 11 },
  { id: "cat_12", name: "News", slug: "news", description: "News and articles", order_index: 12 },
  { id: "cat_13", name: "Gallery", slug: "gallery", description: "Images and galleries", order_index: 13 },
  { id: "cat_14", name: "FAQs", slug: "faqs", description: "Frequently asked questions", order_index: 14 },
  { id: "cat_15", name: "Startups", slug: "startups", description: "Startup resources and tools", order_index: 15 },
  { id: "cat_16", name: "Feed", slug: "feed", description: "RSS feeds and updates", order_index: 16 },
  { id: "cat_17", name: "Groups", slug: "groups", description: "Communities and groups", order_index: 17 },
  { id: "cat_18", name: "Courses", slug: "courses", description: "Online courses and learning", order_index: 18 },
  { id: "cat_19", name: "Downloads", slug: "downloads", description: "Downloadable resources", order_index: 19 },
  { id: "cat_20", name: "Newsletter", slug: "newsletter", description: "Newsletter subscriptions", order_index: 20 },
  { id: "cat_21", name: "Sponsorship", slug: "sponsorship", description: "Sponsorship opportunities", order_index: 21 },
  { id: "cat_22", name: "1:1 Call", slug: "meeting", description: "One-on-one sessions", order_index: 22 },
  { id: "cat_23", name: "Featured", slug: "featured", description: "Press Release", order_index: 23 },
  { id: "cat_24", name: "Webinar", slug: "webinar", description: "Webinars", order_index: 24 },
  { id: "cat_25", name: "Services", slug: "services", description: "Offer Custom or On Demand Services", order_index: 25 },
  { id: "cat_26", name: "Projects", slug: "projects", description: "Showcase your projects and work", order_index: 26 },
  { id: "cat_27", name: "Listing", slug: "listing", description: "List your items or services", order_index: 27 },
  { id: "cat_28", name: "Testimonials", slug: "testimonials", description: "Customer testimonials and reviews", order_index: 28 },
  { id: "cat_29", name: "Menu", slug: "menu", description: "Food and restaurant menus", order_index: 29 },
  { id: "cat_30", name: "Booking", slug: "booking", description: "Bookings and reservations", order_index: 30 },
  { id: "cat_31", name: "Jobs", slug: "jobs", description: "Jobs Listing for hiring", order_index: 31 },
  { id: "cat_32", name: "Docs", slug: "docs", description: "Documentation and Support", order_index: 32 },
  { id: "cat_33", name: "Features", slug: "features", description: "Your Business Features", order_index: 33 },
  { id: "cat_34", name: "Forms", slug: "forms", description: "Fill the form", order_index: 34 },
  { id: "cat_35", name: "Blog", slug: "blog", description: "Read the latest blog", order_index: 35 },
  { id: "cat_36", name: "Guides", slug: "guides", description: "Share guides to your subscribers", order_index: 36 },
  { id: "cat_37", name: "Notes", slug: "notes", description: "Share Notes with audience.", order_index: 37 },
  { id: "cat_38", name: "Skills", slug: "skills", description: "Highlight your Skills", order_index: 38 },
  { id: "cat_39", name: "Prompt", slug: "prompt", description: "Share AI Prompts", order_index: 39 },
  { id: "cat_40", name: "Compare", slug: "compare", description: "Compare options", order_index: 40 },
  { id: "cat_41", name: "Alternative", slug: "alternative", description: "List alternatives", order_index: 41 },
  { id: "cat_42", name: "Community", slug: "community", description: "Join our community", order_index: 42 },
  { id: "cat_43", name: "ShortURL", slug: "shorturl", description: "Shortened links and redirects", order_index: 43 },
  { id: "cat_44", name: "Merch", slug: "merch", description: "Merchandise and products", order_index: 44 },
  { id: "cat_45", name: "Posts", slug: "posts", description: "Short posts and updates", order_index: 45 },
  { id: "cat_46", name: "Videos", slug: "videos", description: "Video content", order_index: 46 },
  { id: "cat_47", name: "Pages", slug: "page", description: "Custom pages", order_index: 47 },
  { id: "cat_all_001", name: "All", slug: "all", description: "Home page section", order_index: 0 },
  { id: "cat_landing_001", name: "Landing", slug: "landing", description: "Landing page section", order_index: 0 },
  { id: "cat_about_001", name: "About", slug: "about", description: "About page section", order_index: 0 },
  { id: "cat_activity_001", name: "Activity", slug: "activity", description: "Activity page", order_index: 0 },
];


export const EXPECTED_CATEGORY_COUNT = CATEGORIES_SEED.length;

/**
 * Seed all categories into userDB (INSERT OR IGNORE — safe to run repeatedly).
 * IDs match central DB so category_id FK values in links/products resolve correctly.
 */
export async function syncCategoriesToUserDB(url: string, authToken: string): Promise<void> {
  const client = createClient({ url, authToken });
  const stmts = CATEGORIES_SEED.map(cat => ({
    sql: `INSERT OR IGNORE INTO categories (id, name, slug, description, order_index)
          VALUES (?, ?, ?, ?, ?)`,
    args: [cat.id, cat.name, cat.slug, cat.description, cat.order_index],
  }));
  try {
    await client.batch(stmts, "write");
  } catch (err) {
    console.error("Categories sync failed:", err);
  }
}

const DEFAULT_DOC_COLLECTIONS = [
  { slug: 'getting-started', title: 'Getting Started', description: 'Learn the basics', icon: '🚀', sort_order: 1 },
  { slug: 'account', title: 'Account', description: 'Manage your account settings', icon: '👤', sort_order: 2 },
  { slug: 'billing', title: 'Billing', description: 'Payment and subscription info', icon: '💳', sort_order: 3 },
  { slug: 'faq', title: 'FAQ', description: 'Frequently asked questions', icon: '❓', sort_order: 4 },
  { slug: 'api-and-integrations', title: 'API & Integrations', description: 'Developer resources', icon: '🔌', sort_order: 5 },
  { slug: 'other-guides', title: 'Other Guides', description: 'Additional help articles', icon: '📚', sort_order: 6 },
];

/**
 * Seed default doc_collections if the table is empty.
 * Safe to run repeatedly — uses INSERT OR IGNORE on slug.
 */
export async function seedDefaultDocCollections(url: string, authToken: string): Promise<void> {
  const client = createClient({ url, authToken });
  try {
    const existing = await client.execute({ sql: `SELECT COUNT(*) as cnt FROM doc_collections`, args: [] });
    if (Number(existing.rows[0]?.cnt ?? 0) > 0) return;
    const stmts = DEFAULT_DOC_COLLECTIONS.map(col => ({
      sql: `INSERT OR IGNORE INTO doc_collections (slug, title, description, icon, sort_order, is_default)
            VALUES (?, ?, ?, ?, ?, 1)`,
      args: [col.slug, col.title, col.description, col.icon, col.sort_order],
    }));
    await client.batch(stmts, "write");
  } catch {
    // ignore if table doesn't exist yet
  }
}


/**
 * Seed default CMS records if the table is empty.
 * Generates initial default page routing structures logic.
 */
export async function seedDefaultCmsRecords(url: string, authToken: string, explicitProfileId?: string): Promise<void> {
  const client = createClient({ url, authToken });
  try {
    let pid = explicitProfileId;
    if (!pid) {
      const pRows = await client.execute("SELECT id FROM profiles LIMIT 1");
      pid = pRows.rows[0]?.id as string | undefined;
    }

    const existing = await client.execute({ sql: `SELECT COUNT(*) as cnt FROM cms`, args: [] });
    if (Number(existing.rows[0]?.cnt ?? 0) > 0) return;

    const stmts = DEFAULT_CMS_PAGES.map(page => ({
      sql: `INSERT OR IGNORE INTO cms (id, profile_id, title, slug, category_id, description)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        (page as any).id || crypto.randomUUID(),
        (page as any).profile_id || pid || null,
        page.title,
        page.slug,
        page.category_id,
        page.description
      ],
    }));
    await client.batch(stmts, "write");
  } catch {
    // ignore if table doesn't exist yet
  }
}

/**
 * Seed default crm_groups for a profile if none exist yet.
 * Safe to run repeatedly — only inserts when table is empty for that profile.
 * profileId comes from the first profile row in the userDB.
 */
export async function seedCrmGroups(url: string, authToken: string, explicitProfileId?: string): Promise<void> {
  const { CRM_GROUP_PRESETS } = await import('./crm');
  const client = createClient({ url, authToken });
  try {
    let profileId = explicitProfileId;
    if (!profileId) {
      const profileRow = await client.execute({ sql: `SELECT id FROM profiles LIMIT 1`, args: [] });
      profileId = profileRow.rows[0]?.id as string | undefined;
    }
    if (!profileId) return;

    const existing = await client.execute({
      sql: `SELECT COUNT(*) as cnt FROM crm_groups WHERE profile_id = ?`,
      args: [profileId],
    });
    if (Number(existing.rows[0]?.cnt ?? 0) > 0) return;

    const stmts = CRM_GROUP_PRESETS.map(preset => ({
      sql: `INSERT OR IGNORE INTO crm_groups (id, profile_id, name, icon) VALUES (?, ?, ?, ?)`,
      args: [crypto.randomUUID(), profileId, preset.name, preset.icon],
    }));
    await client.batch(stmts, "write");
  } catch {
    // Table may not exist on very old DBs — migrations will create it
  }
}

/** Provision all tables + indexes. Safe to run repeatedly (IF NOT EXISTS). */
export async function provisionUserDatabase(
  url: string,
  authToken: string,
  user?: {
    id: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    profile_picture_url?: string | null;
    username?: string | null;
    workos_id?: string | null;
  },
  profileInput?: string | any // string = profileId, object = full profile row
): Promise<void> {
  const client = createClient({ url, authToken });
  const profileId = typeof profileInput === 'string' ? profileInput : profileInput?.id;
  const profileObj = typeof profileInput === 'object' ? profileInput : null;

  // 1. Run column migrations FIRST so existing tables have the right columns
  //    before indexes that reference those columns are created in step 2.
  for (const { sql } of MIGRATIONS_SQL) {
    try {
      await client.execute(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // 2. Provision Tables & Indexes in Batches using executeMultiple
  // executeMultiple is more efficient and handles IF NOT EXISTS without rolling back the whole transaction
  const schemaStmts = SCHEMA_SQL.map(s => s.trim()).filter(s => s.length > 0);
  for (let i = 0; i < schemaStmts.length; i += 1000) {
    const chunk = schemaStmts.slice(i, i + 1000);
    try {
      await client.batch(chunk, "write");
    } catch (e: any) {
      throw new Error(`Schema batch failed (statements ${i} to ${i + chunk.length}): ${e?.message}`);
    }
  }

  if (user) {
    const now = Math.floor(Date.now() / 1000);
    try {
      await client.execute({
        sql: `INSERT OR IGNORE INTO users (
                id, email, first_name, last_name, profile_picture_url, username,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          user.id, user.email, user.first_name ?? null, user.last_name ?? null,
          user.profile_picture_url ?? null, user.username ?? null, now, now
        ],
      });

      // Seed AI Agent Users
      const aiUsers = [
        { id: 'a1b2c3d4-0001-4000-8000-000000000001', name: 'Claude', email: 'claude@businesskit.io', profile_picture_url: 'https://pbs.twimg.com/profile_images/1950950107937185792/QOfEjFoJ_400x400.jpg' },
        { id: 'a1b2c3d4-0002-4000-8000-000000000002', name: 'Gemini', email: 'gemini@businesskit.io', profile_picture_url: 'https://pbs.twimg.com/profile_images/1940093473564073984/jiafRcO0_400x400.png' },
        { id: 'a1b2c3d4-0003-4000-8000-000000000003', name: 'ChatGPT', email: 'chatgpt@businesskit.io', profile_picture_url: 'https://pbs.twimg.com/profile_images/1886916133917487104/dJrir79p_400x400.png' },
        { id: 'a1b2c3d4-0004-4000-8000-000000000004', name: 'Grok', email: 'grok@businesskit.io', profile_picture_url: 'https://pbs.twimg.com/profile_images/1893219113717342208/Vgg2hEPa_400x400.jpg' },
      ];
      const aiStmts = aiUsers.map(ai => ({
        sql: `INSERT OR IGNORE INTO users (
                id, email, first_name, username, profile_picture_url, created_at, updated_at, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [ai.id, ai.email, ai.name, ai.name.toLowerCase(), ai.profile_picture_url, now, now, 1]
      }));
      await client.batch(aiStmts, "write");
    } catch (err) {
      console.error("Failed to seed owner user:", err);
    }
  }

  if (profileObj) {
    try {
      const VALID_COLUMNS = new Set([
        "id", "user_id", "slug", "title", "bio", "navigation_menu", "created_at", "updated_at",
        "enabled_categories", "home_visibility", "category_visibility", "avatar_url", "home_page",
        "about", "profile_theme", "collect_emails", "collect_emails_enabled", "social_links",
        "about_visibility", "landing_visibility", "cover_images", "info_visibility",
        "chat_agent_enabled", "chat_agent_model", "chat_agent_greeting", "chat_agent_personality",
        "chat_agent_accent_color", "voice_agent_enabled", "voice_agent_show_circle",
        "voice_agent_personality", "support_email", "from_email", "chat_widget_tab",
        "page_visibility", "minimum_age", "resume", "profile_settings"
      ]);

      const keys = Object.keys(profileObj).filter(k => profileObj[k] !== undefined);
      const snakeKeys = keys.map(k => k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
      
      const filteredKeys: string[] = [];
      const vals: any[] = [];
      
      for (let i = 0; i < snakeKeys.length; i++) {
        const col = snakeKeys[i];
        if (VALID_COLUMNS.has(col)) {
          filteredKeys.push(col);
          const v = profileObj[keys[i]];
          vals.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
        }
      }

      if (filteredKeys.length > 0) {
        const qms = filteredKeys.map(() => '?').join(', ');
        const setStmts = filteredKeys.map(k => `${k} = excluded.${k}`).join(', ');

        await client.execute({
          sql: `INSERT INTO profiles (${filteredKeys.join(', ')}) VALUES (${qms})
                ON CONFLICT(id) DO UPDATE SET ${setStmts}`,
          args: vals
        });
      }
    } catch (err) {
      console.error("Failed to sync profile to userDB:", err);
    }
  }

  // Seed reference data after tables are created
  await syncCategoriesToUserDB(url, authToken);
  await seedDefaultDocCollections(url, authToken);
  await seedDefaultCmsRecords(url, authToken, profileId);
  await seedCrmGroups(url, authToken, profileId);
  await seedSocialLabels(url, authToken);
  await seedAgents(url, authToken);

  // Combine all standalone triggers into one array and chunk it to save subrequests
  const standaloneTriggers = [
    ...EMAIL_TRACKING_TRIGGERS_SQL,
    ...PRODUCT_TRIGGERS_SQL,
    ...SOCIAL_TRIGGERS_SQL,
    ...JOBS_TRIGGERS_SQL,
    ...FORMS_TRIGGERS_SQL,
    ...ADS_TRIGGERS_SQL,
    ...COMMUNITY_TRIGGERS_SQL,
    ...REVIEW_TRIGGERS_SQL,
    ...REVENUE_GUARD_TRIGGERS_SQL,
  ];
  
  for (let i = 0; i < standaloneTriggers.length; i += 1000) {
    const chunk = standaloneTriggers.slice(i, i + 1000);
    try {
      await client.batch(chunk, "write");
    } catch (e: any) {
      console.warn(`[triggers] batch failed (${i} to ${i + chunk.length}):`, e?.message);
    }
  }

  // Record successful provision in _schema_migrations
  try {
    await client.execute({
      sql: `INSERT OR IGNORE INTO _schema_migrations (id) VALUES ('provision_v1')`,
      args: [],
    });
  } catch { /* _schema_migrations may not exist on very old DBs — safe to skip */ }
}

/**
 * Provision a single table by name.
 * Runs the matching CREATE TABLE, then any CREATE INDEX statements for it.
 */
export async function provisionSingleTable(url: string, authToken: string, tableName: string): Promise<void> {
  const client = createClient({ url, authToken });
  const lower = tableName.toLowerCase();

  for (const sql of SCHEMA_SQL) {
    const s = sql.toLowerCase().trimStart();
    const isTable = s.startsWith('create table') && s.includes(`exists ${lower} `);
    const isIndex = s.startsWith('create') && s.includes(' index ') && s.includes(` on ${lower} `);
    if (isTable || isIndex) {
      try {
        await client.execute(sql);
        // Run column migrations for this specific table
        for (const m of MIGRATIONS_SQL) {
          if (m.table === lower) {
            try { await client.execute(m.sql); } catch { /* column exists */ }
          }
        }
      } catch {
        // Already exists
      }
    }
  }
}

/** Re-run all CREATE INDEX statements. Safe to re-run (IF NOT EXISTS). */
export async function reprovisionAllIndexes(url: string, authToken: string): Promise<void> {
  const client = createClient({ url, authToken });
  const indexStatements = SCHEMA_SQL.filter((s) =>
    s.trimStart().toLowerCase().startsWith('create') && s.toLowerCase().includes(' index ')
  );
  // Batch in chunks of 1000 to stay under subrequest limit
  for (let i = 0; i < indexStatements.length; i += 1000) {
    const chunk = indexStatements.slice(i, i + 1000);
    try {
      await client.batch(chunk, 'write');
    } catch (e: any) {
      throw new Error(`Index batch failed (${i}–${i + chunk.length}): ${e?.message}`);
    }
  }
}

/** Re-run all trigger SQL from every module. Uses DROP+CREATE pattern so triggers are refreshed. */
export async function reprovisionAllTriggers(url: string, authToken: string): Promise<void> {
  const client = createClient({ url, authToken });

  const embeddedTriggers = SCHEMA_SQL.filter((s) =>
    s.trimStart().toLowerCase().includes('create trigger')
  );
  
  const standaloneTriggers = [
    ...EMAIL_TRACKING_TRIGGERS_SQL,
    ...PRODUCT_TRIGGERS_SQL,
    ...SOCIAL_TRIGGERS_SQL,
    ...JOBS_TRIGGERS_SQL,
    ...FORMS_TRIGGERS_SQL,
    ...ADS_TRIGGERS_SQL,
    ...COMMUNITY_TRIGGERS_SQL,
    ...REVIEW_TRIGGERS_SQL,
    ...REVENUE_GUARD_TRIGGERS_SQL,
    ...PROFILE_DATA_SYNC_TRIGGERS_SQL,
  ];

  const allTriggerStmts = [...embeddedTriggers, ...standaloneTriggers];

  // Batch in chunks of 1000 to avoid Too many subrequests error
  for (let i = 0; i < allTriggerStmts.length; i += 1000) {
    const chunk = allTriggerStmts.slice(i, i + 1000);
    try { 
      await client.batch(chunk, 'write'); 
    } catch (e: any) {
      console.warn(`Trigger batch warn (${i}-${i + chunk.length}):`, e?.message);
    }
  }
}

/** Re-run all CREATE VIEW statements from every module. */
export async function reprovisionAllViews(url: string, authToken: string): Promise<void> {
  const client = createClient({ url, authToken });

  const allViews = SCHEMA_SQL.filter((s) =>
    s.trimStart().toLowerCase().includes('create view')
  );

  try {
    await client.batch(allViews, 'write');
  } catch (e: any) {
    throw new Error(`Views batch failed: ${e?.message}`);
  }
}
