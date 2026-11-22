// ─────────────────────────────────────────────────────────────────────────────
// social.ts — Social Media Schema + Provision Helpers
// Provisioned via provision.ts → provisionUserDatabase()
//
// ── Design principles ────────────────────────────────────────────────────────
//
//  1. social_posts = 1 row per post per platform
//     - If same content posted to 5 platforms → 5 rows
//     - group_id links them (cross-post group, optional)
//     - Content column is platform-specific (Twitter 280 chars, LinkedIn longer)
//     - platform_post_id is a first-class indexed column on this table
//     - Works for Zernio AND direct platform API AND n8n
//
//  2. social_post_analytics = 1 row per social_post.id (the "hot table")
//     - All engagement counters here: likes, comments, shares, impressions etc
//     - Written by: Zernio webhook, direct platform API polling, or analytics sync
//     - Indexed heavily for time-series queries
//
//  3. social_accounts = identity + connection + audience demographics ONLY
//     - NO engagement/analytics columns here
//     - Audience demographics (city/country/gender/age) live here — they describe
//       the account's audience, not its posts
//     - Platform metrics like follower_count and following_count live here
//       because they're account-level, not post-level
//
//  4. social_analytics = per-account aggregate analytics (1 row per account)
//     - Time-series JSON arrays, aggregate totals
//     - Updated by: analytics aggregator job (daily/weekly)
//     - Trigger-updated columns: total_posts (INSERT on social_posts)
//     - API-call-updated: everything else (follower trends, engagement series)
//
//  5. social_analytics_view = 1 row per profile_id (agent fast lookup)
//     - Joins social_accounts + social_analytics across all accounts for a profile
//     - Used by AI agents for cross-platform overview without N queries
//
//  6. social_posts_analytics_view = 1 row per profile_id last-30d summary
//     - Aggregates social_post_analytics for agent briefings
//
//  7. social_post_groups = lightweight table, 1 row per cross-post group
//     - id only + profile_id + created_at
//     - social_posts.group_id → FK → social_post_groups.id
//
//  8. social_competitors + social_competitor_posts = competitor monitoring
//     - Track competitor/inspiration accounts and their posts
//     - For strategy analysis and content inspiration
//
// ── Posting modes ─────────────────────────────────────────────────────────────
//
//  Mode A — Zernio platform key (env.ZERNIO_API_KEY)
//    scheduled_via = 'platform'
//    zernio_post_id set after API call
//    platform_post_id set by Zernio webhook (post.published event)
//
//  Mode B — Zernio BYOK (user's own Zernio key in connections table)
//    scheduled_via = 'byok'
//    zernio_post_id set after API call
//    platform_post_id set by Zernio webhook
//
//  Mode C — Direct platform API (user brings own developer app tokens)
//    scheduled_via = 'direct'
//    zernio_post_id = NULL
//    platform_post_id set by direct API response
//    Requires connections row: service='twitter_direct' etc
//    Schedule: cron reads social_posts WHERE status='scheduled' AND scheduled_for<=now()
//
//  Mode D — n8n webhook
//    scheduled_via = 'n8n'
//    zernio_post_id = NULL
//    Payload forwarded to n8n, callback sets platform_post_id + status
//
// ── Which columns are updated by what ────────────────────────────────────────
//
//  social_posts:
//    status, platform_post_id, platform_post_url, published_at
//      → Zernio webhook (post.published / post.failed)
//      → Direct API response
//      → n8n callback
//    retry_count, last_retry_at
//      → App-level retry logic
//    approval_status
//      → App dashboard approval flow
//
//  social_post_analytics:
//    All engagement columns (likes, comments, shares, impressions, reach, etc.)
//      → Zernio analytics webhook / analytics sync job (daily)
//      → Direct platform API polling (social_accounts.metrics_synced_at gate)
//    analytics_synced_at
//      → Written on every sync
//
//  social_analytics (per-account aggregate):
//    total_posts
//      → DB TRIGGER on social_posts INSERT (when status='published')
//    total_scheduled
//      → DB TRIGGER on social_posts INSERT (when status='scheduled')
//    Everything else (time series, totals, breakdowns)
//      → Analytics aggregator job (daily/on-demand)
//    follower_count mirrored from social_accounts
//      → API call (platform metrics sync)
//
//  social_accounts:
//    follower_count, following_count, post_count
//      → API call (platform metrics sync, scheduled or on-demand)
//    audience_* demographics
//      → API call (Zernio analytics add-on or direct platform API)
//    token_status, health_error
//      → Health check job / webhook token revocation events
//
// ─────────────────────────────────────────────────────────────────────────────

export const SOCIAL_SCHEMA_SQL: string[] = [

  // ── connections ───────────────────────────────────────────────────────────────
  // One row per API credential/connection. All sensitive columns encrypted via vault.ts.
  //
  // service values (non-exhaustive):
  //   Social (Zernio BYOK):    'zernio'
  //   Social (direct):         'twitter_direct' | 'instagram_direct' | 'facebook_direct'
  //                            'linkedin_direct' | 'tiktok_direct' | 'youtube_direct'
  //   Email:                   'ses' | 'resend'
  //   AI:                      'openai' | 'anthropic'
  //   Payments:                'stripe' | 'paddle'
  //   Automation:              'n8n'
  //   Other:                   'google_analytics' | 'zapier'
  `CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,

    name TEXT NOT NULL,
    -- Human label: "Main Twitter App", "SES Production", "OpenAI GPT-4o"
    label TEXT,
    -- UI grouping: "Social", "Email", "AI", "Payments", "Automation"
    service TEXT NOT NULL,
    -- 'zernio' | 'twitter_direct' | 'instagram_direct' | 'facebook_direct'
    -- | 'linkedin_direct' | 'tiktok_direct' | 'youtube_direct'
    -- | 'openai' | 'anthropic' | 'resend' | 'ses' | 'stripe' | 'paddle' | 'n8n'

    -- All encrypted at rest via vault.ts
    client_id TEXT,          -- API Key / Access Key ID / Consumer Key / Publishable Key
    client_secret TEXT,      -- API Secret / Secret Key / Consumer Secret
    access_token TEXT,       -- OAuth Access Token / Bearer Token / Secret Key
    refresh_token TEXT,      -- OAuth Refresh Token / OAuth Token Secret (OAuth 1.0a)
    token_expires_at INTEGER,-- Unix timestamp (NULL = non-expiring key)

    -- For services that use a workspace/profile concept (e.g. Zernio profile _id)
    external_profile_id TEXT,

    url TEXT,
    username TEXT,
    password TEXT,

    -- For webhook-based services (n8n, Zapier, custom)
    webhook_url TEXT,

    -- For MCP server integrations
    mcp_server_url TEXT,

    -- OAuth specific fields
    provider TEXT,           -- Identifies the OAuth provider if different from service
    scopes TEXT,             -- Granted OAuth scopes space-separated
    email TEXT,              -- Associated email address from the provider

    -- Extra fields (JSON) for anything not covered above
    -- ses:    {"region":"us-east-1","from_email":"hello@example.com"}
    -- stripe: {"webhook_secret":"whsec_xxx"}
    extra TEXT NOT NULL DEFAULT '{}',

    is_active INTEGER NOT NULL DEFAULT 1,
    is_verified INTEGER NOT NULL DEFAULT 0,  -- passed a test-ping
    last_verified_at INTEGER,
    last_error TEXT,
    error_count INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_connections_profile     ON connections (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_connections_service     ON connections (profile_id, service)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_name ON connections (profile_id, name)`,

  // ── social_accounts ───────────────────────────────────────────────────────────
  // One row per connected social account.
  // Contains: identity, connection state, audience demographics.
  // Does NOT contain: post engagement stats (those are in social_post_analytics +
  // social_analytics). Follower count IS here — it's an account attribute, not
  // a post metric.
  //
  // connection_mode:
  //   'zernio_platform' → env.ZERNIO_API_KEY + zernio_account_id
  //   'zernio_byok'     → connections WHERE service='zernio' + zernio_account_id
  //   'direct'          → connections WHERE service='{platform}_direct' tokens
  //   'n8n'             → forward payload to n8n webhook URL
  //
  // Audience demographics come from:
  //   Zernio analytics add-on  → synced via analytics API call
  //   Direct platform API       → Instagram Insights, LinkedIn Page Analytics, etc.
  //   NULL = not yet fetched or platform doesn't provide
  //
  // metrics_synced_at = timestamp of last follower/reach metrics sync
  // audience_synced_at = timestamp of last audience demographics sync
  `CREATE TABLE IF NOT EXISTS social_accounts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    connection_mode TEXT NOT NULL DEFAULT 'zernio_platform',
    -- 'zernio_platform' | 'zernio_byok' | 'direct' | 'n8n'

    -- Zernio identifiers (NULL for direct/n8n modes)
    zernio_account_id TEXT UNIQUE,
    zernio_profile_id TEXT,

    -- Platform
    platform TEXT NOT NULL,
    -- 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'
    -- | 'youtube' | 'pinterest' | 'reddit' | 'bluesky' | 'threads'
    -- | 'googlebusiness' | 'telegram' | 'snapchat'

    -- Creator's own account identity (from platform after OAuth/connection)
    platform_username TEXT,
    platform_user_id TEXT,
    platform_display_name TEXT,
    platform_avatar_url TEXT,
    platform_bio TEXT,
    platform_url TEXT,
    platform_website TEXT,
    platform_category TEXT,
    platform_verified INTEGER NOT NULL DEFAULT 0,

    -- Account-level reach metrics (synced periodically from platform / Zernio)
    -- These are ACCOUNT attributes, not post metrics.
    follower_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    platform_post_count INTEGER NOT NULL DEFAULT 0,
    -- ↑ total posts ever on the platform (their historical count, not ours)

    -- ── Audience Demographics ─────────────────────────────────────────────────
    -- JSON objects with percentage values (floats).
    -- Weighted average across time; updated by API call, not triggers.
    -- Used for media kit page (public-facing creator stats for brand deals).

    audience_city_breakdown TEXT,
    -- {"New York":12.5,"London":8.3,"Mumbai":5.1,...}
    -- Available: Instagram, Facebook, LinkedIn, TikTok, YouTube

    audience_country_breakdown TEXT,
    -- {"US":45.2,"UK":18.1,"IN":8.4,...}
    -- Available: all platforms with analytics APIs

    audience_gender_breakdown TEXT,
    -- {"male":48.2,"female":44.8,"other":7.0}
    -- Available: Instagram, Facebook, TikTok, YouTube, LinkedIn
    -- NOT available: Twitter/X (not provided by platform)

    audience_age_breakdown TEXT,
    -- {"13-17":2.5,"18-24":22.1,"25-34":38.4,"35-44":24.8,"45-54":8.1,"55+":4.1}
    -- Available: Instagram, Facebook, TikTok, YouTube, LinkedIn

    audience_language_breakdown TEXT,
    -- {"en":78.2,"es":11.8,"pt":5.6,"fr":2.1,...}
    -- Available: Instagram, Facebook, TikTok, YouTube

    audience_interest_breakdown TEXT,
    -- {"Technology":44.2,"Business":29.8,"Science":15.1,...}
    -- Available: Instagram, Facebook only (Meta audience insights)

    audience_device_breakdown TEXT,
    -- {"mobile":82.4,"desktop":14.1,"tablet":3.5}
    -- Available: Instagram, Facebook, TikTok, YouTube

    audience_reachability TEXT,
    -- {"mass":35,"micro":28,"nano":37}  — follower distribution of YOUR followers
    -- Useful for LinkedIn B2B positioning

    audience_synced_at INTEGER,
    -- Timestamp of last audience demographics sync (API call)
    metrics_synced_at INTEGER,
    -- Timestamp of last follower_count / platform_post_count sync (API call)

    -- Connection health
    is_connected INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    token_status TEXT NOT NULL DEFAULT 'valid',
    -- 'valid' | 'expired' | 'revoked' | 'error'
    token_expires_at INTEGER,
    last_health_check_at INTEGER,
    health_error TEXT,

    -- Secondary selection (Facebook page, LinkedIn org, Pinterest board, GMB location)
    selected_page_id TEXT,
    selected_page_name TEXT,

    -- Posting defaults
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    auto_post INTEGER NOT NULL DEFAULT 0,

    -- Platform-specific extra data (JSON)
    -- twitter:   {"tweet_mode":"extended","max_tweet_length":280}
    -- instagram: {"ig_user_id":"12345","account_type":"BUSINESS"}
    -- reddit:    {"default_subreddit":"r/webdev"}
    -- youtube:   {"channel_id":"UCxxx","upload_default_privacy":"public"}
    -- tiktok:    {"open_id":"xxx","union_id":"xxx"}
    platform_data TEXT NOT NULL DEFAULT '{}',

    connected_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    disconnected_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_accounts_profile    ON social_accounts (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_accounts_platform   ON social_accounts (profile_id, platform)`,
  `CREATE INDEX IF NOT EXISTS idx_social_accounts_zernio     ON social_accounts (zernio_account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_accounts_active     ON social_accounts (profile_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_social_accounts_connection ON social_accounts (connection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_accounts_mode       ON social_accounts (profile_id, connection_mode)`,

  // ── social_post_groups ────────────────────────────────────────────────────────
  // Lightweight table. One row = one cross-post group.
  // When user posts the same content to 5 platforms → 1 group_id, 5 social_posts rows.
  // social_posts.group_id → FK here (NULL = standalone single-platform post).
  //
  // Why separate table and not just a UUID in social_posts?
  //   - Allows metadata: group name, source content, creation context
  //   - Enables "show all posts from this cross-post campaign" query
  //   - FK gives integrity — no orphaned group_ids
  `CREATE TABLE IF NOT EXISTS social_post_groups (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    -- Optional label (e.g. "Product launch Jan 2026")
    name TEXT,
    -- The "source" content before platform-specific adaptation
    -- Useful when AI rewrites content per platform from a single brief
    source_content TEXT,
    -- Number of platforms in this group (denormalized for UI)
    platform_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_post_groups_profile ON social_post_groups (profile_id, created_at DESC)`,

  // ── social_posts ──────────────────────────────────────────────────────────────
  // ONE ROW PER POST PER PLATFORM.
  //
  // If the same content is sent to Twitter + Instagram + LinkedIn:
  //   → 3 rows, all sharing the same group_id
  //   → content can differ per row (platform character limits, formatting)
  //
  // platform_post_id = the actual tweet ID / IG media ID / LinkedIn share URN etc.
  //   Set by: Zernio webhook (post.published) OR direct API response OR n8n callback.
  //   Indexed heavily — used for analytics sync and inbox linking.
  //
  // Zernio provides one zernio_post_id per post-per-platform in their response.
  //   If 3 platforms → 3 Zernio post IDs → 3 rows, each with its own zernio_post_id.
  //
  // Works for all modes: Zernio platform key, Zernio BYOK, direct API, n8n.
  //
  // Platform-specific publishing options (platform_specific_data JSON):
  //   twitter:       {threadItems:[{content,mediaItems}]}
  //   threads:       {threadItems:[{content,mediaItems}]}
  //   facebook:      {contentType:'story'|null, firstComment, pageId}
  //   instagram:     {contentType:'story'|'reel'|'carousel'|null,
  //                   shareToFeed, collaborators, firstComment, userTags,
  //                   audioName, thumbOffset, trialParams}
  //   linkedin:      {organizationUrn, firstComment, disableLinkPreview}
  //   tiktok:        {tiktokSettings:{privacy_level:'PUBLIC_TO_EVERYONE',
  //                   allow_comment:true, allow_duet:true, allow_stitch:true,
  //                   content_preview_confirmed:true, express_consent_given:true,
  //                   draft:false, description, video_cover_timestamp_ms}}
  //   youtube:       {title, visibility:'public'|'private'|'unlisted',
  //                   madeForKids:false, firstComment, tags:[], categoryId,
  //                   containsSyntheticMedia:false}
  //   googlebusiness:{locationId, languageCode, callToAction:{type,url}}
  //   pinterest:     {title, boardId, link, coverImageUrl}
  //   reddit:        {subreddit, title, url, forceSelf, flairId}
  //   telegram:      {parseMode:'HTML'|'Markdown', disableWebPagePreview:false}
  //   snapchat:      {contentType:'story'|'saved_story'|'spotlight'}
  //   bluesky:       {}
  `CREATE TABLE IF NOT EXISTS social_posts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,    -- FK → social_accounts.id
    group_id TEXT,               -- FK → social_post_groups.id (NULL = single-platform)

    -- Platform (denormalized from social_accounts for fast queries)
    platform TEXT NOT NULL,
    -- 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'
    -- | 'youtube' | 'pinterest' | 'reddit' | 'bluesky' | 'threads'
    -- | 'googlebusiness' | 'telegram' | 'snapchat'

    -- ★ Platform post ID — first-class indexed column
    -- The actual tweet ID / IG media ID / LinkedIn share URN / YouTube video ID etc.
    -- Set by: Zernio webhook (post.published), direct API response, or n8n callback.
    -- NULL = not yet published.
    platform_post_id TEXT,
    platform_post_url TEXT,
    -- Direct URL to the live post on the platform

    -- Zernio identifiers (NULL for direct/n8n modes)
    -- One zernio_post_id per post-per-platform (Zernio gives separate IDs per platform)
    zernio_post_id TEXT UNIQUE,
    zernio_account_id TEXT,      -- mirrors social_accounts.zernio_account_id (fast webhook lookup)

    -- Content
    -- Platform-specific content (can differ per row even in same group)
    -- Twitter: max 280 chars | LinkedIn: max 3000 | Instagram: max 2200 etc.
    content TEXT NOT NULL,
    media_items TEXT NOT NULL DEFAULT '[]',
    -- JSON: [{url, type:'image'|'video'|'document', thumbnail_url?, alt_text?}]
    link_url TEXT,
    link_title TEXT,
    link_description TEXT,
    link_thumbnail_url TEXT,

    -- Platform-specific publishing options (see per-platform JSON schema above)
    platform_specific_data TEXT NOT NULL DEFAULT '{}',

    -- Scheduling
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'scheduled' | 'queued' | 'publishing' | 'published'
    -- | 'partial' | 'failed' | 'cancelled'
    scheduled_for TEXT,          -- ISO 8601 e.g. '2026-04-01T09:00:00'
    timezone TEXT NOT NULL DEFAULT 'UTC',
    publish_now INTEGER NOT NULL DEFAULT 0,
    use_queue INTEGER NOT NULL DEFAULT 0,
    queue_slot_id TEXT,          -- FK → social_queue.id (direct mode queue only)
    published_at INTEGER,        -- Unix timestamp, set when status → 'published'

    -- Agent approval loop
    approval_status TEXT NOT NULL DEFAULT 'auto_sent',
    -- 'pending' | 'approved' | 'rejected' | 'auto_sent'
    approval_requested_at INTEGER,
    approved_at INTEGER,

    -- Content origin / attribution
    source TEXT,
    -- 'manual' | 'agent' | 'blog_crosspost' | 'product_launch'
    -- | 'rss' | 'n8n' | 'automation' | 'competitor_inspired'
    source_id TEXT,              -- FK → posts.id / products.id when cross-posted

    -- AI generation
    ai_generated INTEGER NOT NULL DEFAULT 0,
    ai_prompt TEXT,
    -- Future: ML content classification label (topic, sentiment, content_type)
    -- Written by a background labeling job, NULL until processed
    ai_labeled INTEGER NOT NULL DEFAULT 0,
    ai_label TEXT,
    -- e.g. 'promotional' | 'educational' | 'engagement' | 'testimonial' | 'announcement'

    -- User labels (FK → social_labels.id, JSON array)
    labels TEXT NOT NULL DEFAULT '[]',

    -- Security / posting path tracking
    scheduled_via TEXT NOT NULL DEFAULT 'byok',
    -- 'byok'     = user's own Zernio key
    -- 'platform' = BusinessKit platform Zernio key (capped at FREE_TIER_CAP/month)
    -- 'direct'   = posted directly to platform API (Mode C)
    -- 'n8n'      = dispatched via n8n webhook (Mode D)
    platform_schedule_count INTEGER NOT NULL DEFAULT 0,
    -- Posts sent via 'platform' key this calendar month
    platform_schedule_month TEXT,
    -- 'YYYY-MM' — checked to reset counter on new month

    -- Error state
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_retry_at INTEGER,

    hidden INTEGER NOT NULL DEFAULT 0,
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate posts
    idempotency_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sp_profile          ON social_posts (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_account          ON social_posts (account_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_platform         ON social_posts (profile_id, platform)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_status           ON social_posts (profile_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_scheduled        ON social_posts (status, scheduled_for ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_queued           ON social_posts (account_id, use_queue, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_platform_post_id ON social_posts (platform_post_id)`,
  // Unique when platform_post_id IS NOT NULL (SQLite NULLs are each distinct — safe)
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_platform_unique ON social_posts (platform, platform_post_id) WHERE platform_post_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_sp_zernio_post      ON social_posts (zernio_post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_zernio_account   ON social_posts (zernio_account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_group            ON social_posts (group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_source           ON social_posts (source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_approval         ON social_posts (profile_id, approval_status)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_platform_cap     ON social_posts (profile_id, scheduled_via, platform_schedule_month)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_published_at     ON social_posts (profile_id, published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_ai_labeled       ON social_posts (profile_id, ai_labeled)`,
  `CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts (profile_id, status, scheduled_for) WHERE status = 'scheduled'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_idem ON social_posts (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── social_post_analytics ─────────────────────────────────────────────────────
  // THE HOT TABLE — 1 row per social_post.id.
  // All engagement counters for a published post live here.
  //
  // Written by:
  //   - Zernio analytics webhook (post engagement events)
  //   - Zernio analytics sync job (daily poll for recent posts)
  //   - Direct platform API polling (Twitter API v2, Instagram Graph API etc)
  //   - n8n callback
  //
  // analytics_synced_at gates re-polling (skip if synced within last X hours).
  //
  // watch_time_seconds / completion_rate_pct:
  //   Video platforms only (YouTube, TikTok, Instagram Reels)
  //   NULL for non-video posts
  //
  // engagement_rate: basis points (e.g. 320 = 3.20%)
  //   Computed: (likes + comments + shares + saves) / impressions * 10000
  //   Written by the analytics sync job after fetching raw numbers
  `CREATE TABLE IF NOT EXISTS social_post_analytics (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL UNIQUE,   -- FK → social_posts.id
    profile_id TEXT NOT NULL,       -- denormalized for profile-level aggregation
    account_id TEXT NOT NULL,       -- denormalized for account-level aggregation
    platform TEXT NOT NULL,         -- denormalized for platform-level queries

    -- Engagement counters
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    reposts INTEGER NOT NULL DEFAULT 0,  -- Twitter retweets / LinkedIn reshares
    impressions INTEGER NOT NULL DEFAULT 0,
    reach INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,   -- link clicks in post
    saves INTEGER NOT NULL DEFAULT 0,    -- Pinterest saves / Instagram saves
    views INTEGER NOT NULL DEFAULT 0,    -- YouTube/TikTok/Reels video views

    -- Video-specific (NULL for non-video)
    watch_time_seconds INTEGER,
    completion_rate_pct INTEGER,         -- basis points e.g. 6500 = 65.00%
    avg_view_duration_seconds INTEGER,

    -- Derived metric — computed by analytics sync job
    engagement_rate INTEGER NOT NULL DEFAULT 0,
    -- basis points: (likes + comments + shares + saves) / impressions * 10000

    -- Audience breakdown for THIS post (where did impressions come from)
    -- JSON objects, same format as social_accounts audience_* columns
    post_country_breakdown TEXT,
    post_city_breakdown TEXT,
    post_age_breakdown TEXT,
    post_gender_breakdown TEXT,
    post_device_breakdown TEXT,

    -- Raw analytics payload from last sync (cached for re-processing)
    raw_analytics TEXT,

    analytics_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_spa_post_id      ON social_post_analytics (post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_spa_profile             ON social_post_analytics (profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_spa_account             ON social_post_analytics (account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_spa_platform            ON social_post_analytics (profile_id, platform)`,
  `CREATE INDEX IF NOT EXISTS idx_spa_sync                ON social_post_analytics (profile_id, analytics_synced_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_spa_engagement          ON social_post_analytics (profile_id, engagement_rate DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_spa_impressions         ON social_post_analytics (profile_id, impressions DESC)`,

  // ── social_analytics ─────────────────────────────────────────────────────────
  // Per-account aggregate analytics. ONE ROW PER social_account.
  //
  // Update sources per column:
  //   total_posts           → DB TRIGGER: INSERT on social_posts WHERE status='published'
  //   total_scheduled       → DB TRIGGER: INSERT on social_posts WHERE status='scheduled'
  //   total_published       → DB TRIGGER: UPDATE social_posts status → 'published'
  //   total_failed          → DB TRIGGER: UPDATE social_posts status → 'failed'
  //   Everything else       → Analytics aggregator job (daily / on-demand)
  //     follower_count mirrored   → API call (platform sync)
  //     time series JSON arrays   → Aggregator job
  //     best_time_breakdown       → Aggregator job
  //     content_type_breakdown    → Aggregator job
  //
  // Time series JSON arrays:
  //   posts_7d / posts_30d / posts_12m
  //     → daily post counts for last 7 / 30 days, monthly for last 12 months
  //     → int arrays e.g. [0,2,1,0,3,1,0] (index 0 = oldest)
  //   impressions_*, engagement_*, follower_* — same pattern
  //
  // top_posts: [{post_id, platform_post_id, platform, likes, impressions, url}]
  // best_time_breakdown: {"0":{"9":12,"10":8},...} weekday→hour→score heatmap
  // content_type_breakdown: {"image":42,"video":18,"text":7,"link":3}
  `CREATE TABLE IF NOT EXISTS social_analytics (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL UNIQUE, -- FK → social_accounts.id

    -- Mirrored from social_accounts (set by aggregator, not trigger)
    follower_count INTEGER NOT NULL DEFAULT 0,
    follower_change_7d INTEGER NOT NULL DEFAULT 0,
    follower_change_30d INTEGER NOT NULL DEFAULT 0,

    -- Post volume (trigger-updated for published/scheduled; aggregator for the rest)
    total_posts INTEGER NOT NULL DEFAULT 0,       -- TRIGGER: INSERT published
    total_scheduled INTEGER NOT NULL DEFAULT 0,   -- TRIGGER: INSERT scheduled
    total_published INTEGER NOT NULL DEFAULT 0,   -- TRIGGER: UPDATE → published
    total_failed INTEGER NOT NULL DEFAULT 0,      -- TRIGGER: UPDATE → failed

    -- Engagement aggregates (aggregator job)
    total_likes INTEGER NOT NULL DEFAULT 0,
    total_comments INTEGER NOT NULL DEFAULT 0,
    total_shares INTEGER NOT NULL DEFAULT 0,
    total_impressions INTEGER NOT NULL DEFAULT 0,
    total_reach INTEGER NOT NULL DEFAULT 0,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    total_saves INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    avg_engagement_rate INTEGER NOT NULL DEFAULT 0, -- basis points

    -- Time series (aggregator job — int arrays, index 0 = oldest)
    posts_7d TEXT NOT NULL DEFAULT '[]',
    posts_30d TEXT NOT NULL DEFAULT '[]',
    posts_12m TEXT NOT NULL DEFAULT '[]',
    impressions_7d TEXT NOT NULL DEFAULT '[]',
    impressions_30d TEXT NOT NULL DEFAULT '[]',
    impressions_12m TEXT NOT NULL DEFAULT '[]',
    engagement_7d TEXT NOT NULL DEFAULT '[]',
    engagement_30d TEXT NOT NULL DEFAULT '[]',
    engagement_12m TEXT NOT NULL DEFAULT '[]',
    follower_7d TEXT NOT NULL DEFAULT '[]',
    follower_30d TEXT NOT NULL DEFAULT '[]',

    -- Breakdown analytics (aggregator job)
    top_posts TEXT NOT NULL DEFAULT '[]',
    best_time_breakdown TEXT NOT NULL DEFAULT '{}',
    content_type_breakdown TEXT NOT NULL DEFAULT '{}',
    -- {"image":42,"video":18,"text":7,"link":3}

    -- Raw Zernio analytics response cache (for re-processing without API call)
    zernio_analytics_raw TEXT,

    last_aggregated_at INTEGER,
    last_synced_at INTEGER,    -- last platform metrics sync (follower_count etc)
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_social_analytics_account ON social_analytics (account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_analytics_profile        ON social_analytics (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_analytics_sync           ON social_analytics (last_synced_at ASC)`,

  // ── social_media_kit ──────────────────────────────────────────────────────────
  // Cross-platform aggregate for the PUBLIC media kit page (beacons.ai-style).
  // ONE row per profile — updated by aggregator after any account analytics sync.
  //
  // Why separate from profile_analytics?
  //   profile_analytics = internal BusinessKit visitor + product analytics
  //   social_media_kit  = creator's social presence for brand deals + sponsorships
  //   Different audience: one is internal dashboard, one is public-facing
  //
  // platform_breakdown JSON schema:
  //   {"twitter":{"followers":12400,"engagement_rate":320,"growth_30d":150},
  //    "instagram":{"followers":8200,"engagement_rate":480,"growth_30d":320}}
  //
  // Audience fields = weighted average across all accounts (weight = follower_count)
  `CREATE TABLE IF NOT EXISTS social_media_kit (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL UNIQUE,
    total_followers INTEGER NOT NULL DEFAULT 0,
    total_reach_30d INTEGER NOT NULL DEFAULT 0,
    avg_engagement_rate INTEGER NOT NULL DEFAULT 0,
    follower_growth_30d INTEGER NOT NULL DEFAULT 0,
    platform_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_country_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_city_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_gender_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_age_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_language_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_interest_breakdown TEXT NOT NULL DEFAULT '{}',
    audience_device_breakdown TEXT NOT NULL DEFAULT '{}',
    top_posts TEXT NOT NULL DEFAULT '[]',
    content_type_breakdown TEXT NOT NULL DEFAULT '{}',
    best_time_breakdown TEXT NOT NULL DEFAULT '{}',
    -- Visibility settings
    is_public INTEGER NOT NULL DEFAULT 1,
    show_country INTEGER NOT NULL DEFAULT 1,
    show_city INTEGER NOT NULL DEFAULT 0,
    show_gender INTEGER NOT NULL DEFAULT 1,
    show_age INTEGER NOT NULL DEFAULT 1,
    show_platform_breakdown INTEGER NOT NULL DEFAULT 1,
    show_engagement_rate INTEGER NOT NULL DEFAULT 1,
    last_computed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_social_media_kit_profile ON social_media_kit (profile_id)`,

  // ── social_queue ──────────────────────────────────────────────────────────────
  // Recurring time slots for auto-scheduling posts.
  // One slot = one day-of-week + time-of-day per account.
  //
  // Zernio modes:
  //   zernio_slot_id is set when slot is synced to Zernio's queue API
  //   POST /v1/posts with useQueue:true → Zernio picks next available slot
  //   Sync Zernio queue via GET /v1/queue to keep zernio_slot_id fresh
  //
  // Direct mode (no Zernio):
  //   zernio_slot_id = NULL
  //   next_scheduled_at computed by BusinessKit cron (cron sets scheduled_for on
  //   oldest draft social_posts WHERE use_queue=1 for this account)
  //
  // Multiple slots per account are allowed (e.g. Mon 9am, Wed 12pm, Fri 5pm)
  `CREATE TABLE IF NOT EXISTS social_queue (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    zernio_slot_id TEXT UNIQUE,
    day_of_week INTEGER NOT NULL,
    -- 0=Sunday 1=Monday 2=Tuesday 3=Wednesday 4=Thursday 5=Friday 6=Saturday
    time_of_day TEXT NOT NULL,   -- HH:MM 24-hour e.g. '09:00'
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_active INTEGER NOT NULL DEFAULT 1,
    last_used_at INTEGER,
    next_scheduled_at INTEGER,   -- computed Unix timestamp of next slot occurrence
    -- P0-1: agent retries use INSERT OR IGNORE on this key to prevent duplicate queue slots
    idempotency_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_queue_profile  ON social_queue (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_queue_account  ON social_queue (account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_queue_next     ON social_queue (is_active, next_scheduled_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_queue_schedule ON social_queue (account_id, day_of_week, time_of_day)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_social_queue_idem ON social_queue (idempotency_key) WHERE idempotency_key IS NOT NULL`,

  // ── social_inbox ──────────────────────────────────────────────────────────────
  // Unified inbox — DMs, comments, reviews across all connected platforms.
  //
  // Powered by:
  //   Zernio Inbox add-on → zernio webhook pushes new items (inbox_source='zernio')
  //   Direct platform API  → polled on schedule (inbox_source='direct')
  //   n8n                  → forwarded by n8n (inbox_source='n8n')
  //
  // Platform inbox support (from Zernio docs):
  //   DMs:      Facebook, Instagram, Twitter/X, WhatsApp, Bluesky, Reddit, Telegram
  //   Comments: Facebook, Instagram, Twitter/X, Bluesky, Threads, YouTube,
  //             LinkedIn, Reddit, TikTok
  //   Reviews:  Facebook, Google Business
  //
  // CRM bridge via crm_contact_id:
  //   NULL = sender not yet in CRM
  //   SET  = agent auto-matched or user manually linked
  //   When SET: agent surfaces full deal history, purchases, notes for this sender
  //
  // thread_messages JSON: [{id, sender, content, media_urls, timestamp, direction}]
  //   direction: 'inbound' | 'outbound'
  `CREATE TABLE IF NOT EXISTS social_inbox (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    inbox_source TEXT NOT NULL DEFAULT 'zernio',
    -- 'zernio' | 'direct' | 'n8n' | 'manual'

    -- Zernio identifiers (NULL for direct/n8n)
    zernio_thread_id TEXT,
    zernio_message_id TEXT,

    -- Classification
    type TEXT NOT NULL,
    -- 'dm' | 'comment' | 'review'
    platform TEXT NOT NULL,

    -- Sender identity
    sender_platform_id TEXT,
    sender_username TEXT,
    sender_display_name TEXT,
    sender_avatar_url TEXT,
    sender_profile_url TEXT,
    sender_follower_count INTEGER,

    -- ★ CRM bridge — cross-platform sync point
    crm_contact_id TEXT,
    -- FK → crm_contacts.id (NULL if not yet linked)

    -- Linked post context (for comments)
    post_id TEXT,                -- FK → social_posts.id (if comment on our post)
    platform_post_id TEXT,       -- platform-native post ID (indexed for inbox linking)

    -- Content
    content TEXT,
    media_urls TEXT NOT NULL DEFAULT '[]',

    -- Review fields
    rating INTEGER,
    review_title TEXT,

    -- State
    status TEXT NOT NULL DEFAULT 'unread',
    -- 'unread' | 'read' | 'replied' | 'archived' | 'spam'
    is_starred INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    sentiment TEXT,
    -- 'positive' | 'neutral' | 'negative' (AI-derived, set by agent)

    -- User labels
    labels TEXT NOT NULL DEFAULT '[]',

    -- Reply tracking
    reply_content TEXT,
    replied_at INTEGER,
    replied_by TEXT,             -- 'agent' | 'user'

    -- DM thread history
    thread_messages TEXT NOT NULL DEFAULT '[]',

    -- Agent processing state
    agent_draft TEXT,
    agent_sentiment TEXT,
    agent_suggested_action TEXT,
    -- 'reply' | 'archive' | 'escalate' | 'add_to_crm' | 'ignore'
    agent_processed INTEGER NOT NULL DEFAULT 0,
    approval_status TEXT NOT NULL DEFAULT 'auto_sent',
    -- 'pending' | 'approved' | 'rejected' | 'auto_sent'

    received_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_profile       ON social_inbox (profile_id, received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_account       ON social_inbox (account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_status        ON social_inbox (profile_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_type          ON social_inbox (profile_id, type)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_platform      ON social_inbox (profile_id, platform)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_crm           ON social_inbox (crm_contact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_thread        ON social_inbox (zernio_thread_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_sender        ON social_inbox (profile_id, sender_platform_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_platform_post ON social_inbox (platform_post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_unread        ON social_inbox (profile_id, status, received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_social_inbox_approval      ON social_inbox (profile_id, approval_status)`,

  // ── social_labels ─────────────────────────────────────────────────────────────
  // User-defined labels for tagging posts and inbox threads.
  `CREATE TABLE IF NOT EXISTS social_labels (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    icon TEXT,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_labels_profile    ON social_labels (profile_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_social_labels_name ON social_labels (profile_id, name)`,

  // ── social_automations ────────────────────────────────────────────────────────
  // Trigger → action automation rules.
  //
  // ⚠️ PLATFORM CONSTRAINT:
  //   comment_keyword_dm is ONLY supported on Instagram and Facebook.
  //   Validate: social_accounts.platform IN ('instagram','facebook') before creating.
  //   All other platforms will fail this automation type.
  //
  // Two automation families:
  //   'content'    → triggered event creates/schedules a new post
  //   'engagement' → triggered comment/DM sends a DM or reply
  //
  // For engagement automations (comment_keyword_dm):
  //   Zernio handles matching keywords, sending DMs, rate limiting.
  //   We handle: storing zernio_automation_id, mirroring logs, CRM sync.
  //   Server does NOTHING between create and webhook callback — Zernio executes.
  //
  // trigger_config JSON schema per trigger_type:
  //   new_blog_post:      {}
  //   new_product:        {"category_filter":"digital"}
  //   milestone:          {"metric":"subscribers","count":1000}
  //   rss_update:         {"rss_url":"https://...","check_interval_minutes":60}
  //   n8n_webhook:        {"webhook_url":"https://..."}
  //   comment_keyword_dm: {
  //     "platform_post_id":"xxx",        -- post to watch (platform-native ID)
  //     "zernio_post_id":"zrn_xxx",      -- Zernio's reference
  //     "keywords":["PLAYBOOK","DEMO"],  -- [] = trigger on ALL comments
  //     "dm_message":"Hey {{firstName}}, here's the link: {{url}}",
  //     "comment_reply":"Check your DMs! 👀",
  //     "send_to_crm":true,
  //     "enroll_sequence_id":"seq_xxx"
  //   }
  `CREATE TABLE IF NOT EXISTS social_automations (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT,             -- FK → social_accounts.id (required for engagement)
    name TEXT NOT NULL,
    description TEXT,
    automation_family TEXT NOT NULL DEFAULT 'content',
    -- 'content' | 'engagement'

    trigger_type TEXT NOT NULL,
    -- Content:
    --   'new_blog_post' | 'new_product' | 'new_subscriber_milestone'
    --   | 'schedule' | 'manual' | 'n8n_webhook' | 'rss_update'
    -- Engagement:
    --   'comment_keyword_dm'
    trigger_config TEXT NOT NULL DEFAULT '{}',

    -- Zernio automation ID (engagement type only — set after POST /v1/automations)
    zernio_automation_id TEXT UNIQUE,

    -- Content automation: target accounts + action
    target_account_ids TEXT NOT NULL DEFAULT '[]',
    -- JSON: [account_id, ...]
    action_type TEXT NOT NULL DEFAULT 'schedule_post',
    -- 'schedule_post' | 'publish_now' | 'add_to_queue' | 'draft_only'
    content_template TEXT,
    -- Handlebars: {{title}} {{url}} {{excerpt}} {{price}} {{firstName}}
    ai_generate INTEGER NOT NULL DEFAULT 0,
    ai_prompt_template TEXT,
    use_queue INTEGER NOT NULL DEFAULT 0,

    is_active INTEGER NOT NULL DEFAULT 1,
    last_triggered_at INTEGER,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    dm_sent_count INTEGER NOT NULL DEFAULT 0,
    crm_leads_created INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_automations_profile  ON social_automations (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_automations_active   ON social_automations (profile_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_social_automations_trigger  ON social_automations (profile_id, trigger_type)`,
  `CREATE INDEX IF NOT EXISTS idx_social_automations_family   ON social_automations (profile_id, automation_family)`,
  `CREATE INDEX IF NOT EXISTS idx_social_automations_zernio   ON social_automations (zernio_automation_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_automations_account  ON social_automations (account_id)`,

  // ── social_automation_logs ────────────────────────────────────────────────────
  // Append-only log of every automation trigger event.
  // Engagement: 1 row per commenter who triggered a DM.
  // Content:    1 row per post created by automation.
  `CREATE TABLE IF NOT EXISTS social_automation_logs (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    automation_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    triggered_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    -- Engagement: commenter context
    commenter_platform_id TEXT,
    commenter_username TEXT,
    commenter_display_name TEXT,
    comment_content TEXT,
    keyword_matched TEXT,
    -- Result
    status TEXT NOT NULL DEFAULT 'sent',
    -- 'sent' | 'failed' | 'skipped'
    dm_sent INTEGER NOT NULL DEFAULT 0,
    comment_reply_sent INTEGER NOT NULL DEFAULT 0,
    -- CRM
    crm_contact_id TEXT,
    -- Content automation
    social_post_id TEXT,         -- FK → social_posts.id
    error TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sal_automation  ON social_automation_logs (automation_id, triggered_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sal_profile     ON social_automation_logs (profile_id, triggered_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sal_commenter   ON social_automation_logs (commenter_platform_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sal_crm         ON social_automation_logs (crm_contact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sal_status      ON social_automation_logs (automation_id, status)`,

  // ── social_sequences ──────────────────────────────────────────────────────────
  // Drip DM sequences — timed multi-step messages sent over days/hours.
  //
  // Zernio sequences API:
  //   POST   /v1/sequences              → create sequence
  //   POST   /v1/sequences/{id}/activate → activate
  //   POST   /v1/sequences/{id}/enroll   → enroll contacts
  //   GET    /v1/sequences/{id}/enrollments → track progress
  //
  // zernio_sequence_id = set after successful POST /v1/sequences
  // total_* stats updated by aggregator polling /v1/sequences/{id}/enrollments
  `CREATE TABLE IF NOT EXISTS social_sequences (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    zernio_sequence_id TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'active' | 'paused' | 'archived'
    total_enrolled INTEGER NOT NULL DEFAULT 0,
    total_completed INTEGER NOT NULL DEFAULT 0,
    total_unsubscribed INTEGER NOT NULL DEFAULT 0,
    total_replied INTEGER NOT NULL DEFAULT 0,
    reply_rate_pct INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    activated_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_sequences_profile  ON social_sequences (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_sequences_account  ON social_sequences (account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_sequences_active   ON social_sequences (profile_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_social_sequences_zernio   ON social_sequences (zernio_sequence_id)`,

  // ── social_sequence_steps ─────────────────────────────────────────────────────
  // Individual steps in a drip sequence.
  // step_order: 1, 2, 3...
  // delay_minutes: 0 = immediate | 60 = 1hr | 1440 = 1 day | 4320 = 3 days
  // message_text supports: {{firstName}} {{fullName}} {{headline}} {{company}}
  `CREATE TABLE IF NOT EXISTS social_sequence_steps (
    id TEXT PRIMARY KEY,
    sequence_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    step_order INTEGER NOT NULL DEFAULT 1,
    delay_minutes INTEGER NOT NULL DEFAULT 0,
    message_text TEXT NOT NULL,
    media_urls TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sss_sequence ON social_sequence_steps (sequence_id, step_order ASC)`,

  // ── social_sequence_enrollments ───────────────────────────────────────────────
  // Tracks every contact enrolled in a sequence.
  // zernio_contact_id = Zernio's internal contact ID (needed for enroll API call).
  // crm_contact_id = FK → crm_contacts.id (NULL if contact not yet in CRM).
  `CREATE TABLE IF NOT EXISTS social_sequence_enrollments (
    id TEXT PRIMARY KEY,
    sequence_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    zernio_enrollment_id TEXT,
    zernio_contact_id TEXT,
    contact_platform_id TEXT NOT NULL,
    contact_username TEXT,
    contact_display_name TEXT,
    crm_contact_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    -- 'active' | 'completed' | 'unsubscribed' | 'failed' | 'paused'
    current_step INTEGER NOT NULL DEFAULT 1,
    last_message_sent_at INTEGER,
    next_message_at INTEGER,
    replied INTEGER NOT NULL DEFAULT 0,
    replied_at INTEGER,
    enrolled_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sse_sequence     ON social_sequence_enrollments (sequence_id, enrolled_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sse_profile      ON social_sequence_enrollments (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sse_status       ON social_sequence_enrollments (sequence_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sse_crm          ON social_sequence_enrollments (crm_contact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sse_contact      ON social_sequence_enrollments (contact_platform_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sse_next_message ON social_sequence_enrollments (status, next_message_at ASC)`,

  // ── social_broadcasts ────────────────────────────────────────────────────────
  // Bulk DM sends. One-shot (not drip).
  // Zernio broadcasts API: POST /v1/broadcasts
  // segment_config JSON: {"tags":["vip"],"platforms":["instagram"]}
  `CREATE TABLE IF NOT EXISTS social_broadcasts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    zernio_broadcast_id TEXT UNIQUE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    message_text TEXT NOT NULL,
    media_urls TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed'
    scheduled_at INTEGER,
    sent_at INTEGER,
    recipient_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    segment_config TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_social_broadcasts_profile ON social_broadcasts (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_social_broadcasts_status  ON social_broadcasts (profile_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_social_broadcasts_zernio  ON social_broadcasts (zernio_broadcast_id)`,

  // ── social_competitors ────────────────────────────────────────────────────────
  // Track competitor or inspiration accounts across any platform.
  // Use case: "Monitor @competitor on Twitter", "Analyze top 10 accounts in my niche"
  //
  // Data sources:
  //   Zernio:       GET /v1/competitors or /v1/analytics/profile/{username}
  //   Direct API:   Twitter API v2 /users/by/username, IG Basic Display, LinkedIn etc
  //   Manual:       User pastes profile info manually
  //
  // follower_count + recent metrics synced periodically by a background job.
  // analysis_notes = AI-generated strategic notes from the /seo or /cmo agent.
  //
  // tags JSON example: ["competitor","inspiration","niche-leader","collaboration"]
  `CREATE TABLE IF NOT EXISTS social_competitors (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    -- Platform handle / username (without @)
    username TEXT NOT NULL,
    -- Platform-native user/page/channel ID (set after first API lookup)
    platform_user_id TEXT,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    platform_url TEXT,
    website TEXT,
    category TEXT,
    is_verified INTEGER NOT NULL DEFAULT 0,
    -- Reach metrics (synced periodically)
    follower_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    platform_post_count INTEGER NOT NULL DEFAULT 0,
    avg_engagement_rate INTEGER NOT NULL DEFAULT 0, -- basis points
    avg_likes_per_post INTEGER NOT NULL DEFAULT 0,
    avg_comments_per_post INTEGER NOT NULL DEFAULT 0,
    avg_views_per_post INTEGER NOT NULL DEFAULT 0,
    -- Audience demographics (JSON, same format as social_accounts)
    audience_country_breakdown TEXT,
    audience_age_breakdown TEXT,
    audience_gender_breakdown TEXT,
    -- Classification / relationship
    relationship TEXT NOT NULL DEFAULT 'competitor',
    -- 'competitor' | 'inspiration' | 'partner' | 'client' | 'influencer' | 'watch'
    tags TEXT NOT NULL DEFAULT '[]',    -- JSON string[]
    niche TEXT,                          -- e.g. "SaaS" "Creator Economy" "Fitness"
    -- Agent-generated notes (updated by /cmo or /seo agent)
    analysis_notes TEXT,
    last_analyzed_at INTEGER,
    -- Tracking state
    is_active INTEGER NOT NULL DEFAULT 1,
    track_posts INTEGER NOT NULL DEFAULT 1,   -- whether to mirror their posts
    metrics_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_competitors_profile    ON social_competitors (profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_competitors_platform   ON social_competitors (profile_id, platform)`,
  `CREATE INDEX IF NOT EXISTS idx_competitors_username   ON social_competitors (profile_id, platform, username)`,
  `CREATE INDEX IF NOT EXISTS idx_competitors_active     ON social_competitors (profile_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_competitors_rel        ON social_competitors (profile_id, relationship)`,
  `CREATE INDEX IF NOT EXISTS idx_competitors_sync       ON social_competitors (profile_id, metrics_synced_at ASC)`,

  // ── social_competitor_posts ───────────────────────────────────────────────────
  // Mirrored posts from tracked competitor accounts.
  // Filled by:
  //   Zernio analytics add-on (profile post feed)
  //   Direct platform API polling (Twitter timeline, IG feed etc)
  //   Manual import
  //
  // Purpose:
  //   - Content inspiration dashboard
  //   - Posting time pattern analysis (what works for them)
  //   - Engagement benchmarking (compare our engagement_rate vs theirs)
  //   - Agent strategy analysis (/cmo → "analyse competitor posts last 30 days")
  //   - Content gap identification (/seo → "what topics are they covering that we're not")
  //
  // post_type values match platform conventions:
  //   'post' | 'reel' | 'story' | 'video' | 'article' | 'carousel'
  //   | 'thread' | 'poll' | 'link' | 'live'
  //
  // analysis columns (set by AI agent, NULL until processed):
  //   ai_topic       — detected content topic / category
  //   ai_hook        — identified hook pattern (e.g. "question hook", "stat hook")
  //   ai_cta         — detected call to action
  //   ai_notes       — agent-written notes about why this post worked
  `CREATE TABLE IF NOT EXISTS social_competitor_posts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    competitor_id TEXT NOT NULL,    -- FK → social_competitors.id
    platform TEXT NOT NULL,
    platform_post_id TEXT NOT NULL, -- the actual post ID on the platform
    platform_post_url TEXT,
    -- Content snapshot (truncated/summarized — we don't store full copyrighted text)
    content_preview TEXT,           -- first 500 chars max
    media_type TEXT,                -- 'image' | 'video' | 'carousel' | 'text' | 'link'
    thumbnail_url TEXT,
    post_type TEXT NOT NULL DEFAULT 'post',
    -- Published timestamp on the platform
    posted_at INTEGER NOT NULL,
    -- Engagement metrics at time of sync
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    saves INTEGER NOT NULL DEFAULT 0,
    engagement_rate INTEGER NOT NULL DEFAULT 0,  -- basis points
    -- AI analysis (set by agent, NULL until processed)
    ai_analyzed INTEGER NOT NULL DEFAULT 0,
    ai_topic TEXT,
    ai_hook TEXT,
    ai_cta TEXT,
    ai_notes TEXT,
    -- How interesting is this post? 0-100 score set by agent (for sorting/filtering)
    ai_score INTEGER NOT NULL DEFAULT 0,
    -- User actions
    is_bookmarked INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    metrics_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comp_posts_profile     ON social_competitor_posts (profile_id, posted_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_comp_posts_competitor  ON social_competitor_posts (competitor_id, posted_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_comp_posts_platform    ON social_competitor_posts (profile_id, platform, posted_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_posts_unique ON social_competitor_posts (competitor_id, platform_post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comp_posts_score       ON social_competitor_posts (profile_id, ai_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_comp_posts_bookmarked  ON social_competitor_posts (profile_id, is_bookmarked)`,
  `CREATE INDEX IF NOT EXISTS idx_comp_posts_analyzed    ON social_competitor_posts (profile_id, ai_analyzed)`,
  `CREATE INDEX IF NOT EXISTS idx_comp_posts_sync        ON social_competitor_posts (competitor_id, metrics_synced_at ASC)`,

];

// ─────────────────────────────────────────────────────────────────────────────
// social_analytics_view
// ONE ROW PER profile_id — agent fast lookup.
// Joins social_accounts + social_analytics across ALL accounts for a profile.
// Agents use this for cross-platform overview without N queries.
//
// Provides:
//   - Per-platform follower count and engagement rate
//   - Total followers + reach across all platforms
//   - Platform count
//   - Last sync timestamps
//   - Aggregated totals (posts, impressions, likes etc)
//
// Used by:
//   /analytics agent → "How are my social accounts performing?"
//   /cmo agent       → weekly social briefing
//   /social agent    → account health overview
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_ANALYTICS_VIEW_SQL = `
CREATE VIEW IF NOT EXISTS social_analytics_view AS
SELECT
  sa.profile_id,
  COUNT(DISTINCT sa.id) AS total_accounts,
  -- Follower totals
  SUM(sa.follower_count) AS total_followers,
  MAX(sa.follower_count) AS top_account_followers,
  -- Platform breakdown JSON: {"twitter":{"followers":X,"engagement_rate":Y},...}
  -- Built as aggregated JSON — SQLite json_group_object
  json_group_object(
    sa.platform,
    json_object(
      'account_id',       sa.id,
      'username',         sa.platform_username,
      'followers',        sa.follower_count,
      'engagement_rate',  COALESCE(san.avg_engagement_rate, 0),
      'total_posts',      COALESCE(san.total_posts, 0),
      'total_impressions',COALESCE(san.total_impressions, 0),
      'total_likes',      COALESCE(san.total_likes, 0),
      'follower_change_30d', COALESCE(san.follower_change_30d, 0),
      'metrics_synced_at',COALESCE(sa.metrics_synced_at, 0),
      'token_status',     sa.token_status,
      'is_connected',     sa.is_connected
    )
  ) AS platform_breakdown,
  -- Aggregate totals across all accounts for this profile
  SUM(COALESCE(san.total_posts, 0)) AS total_posts_all_platforms,
  SUM(COALESCE(san.total_published, 0)) AS total_published_all_platforms,
  SUM(COALESCE(san.total_impressions, 0)) AS total_impressions_all_platforms,
  SUM(COALESCE(san.total_likes, 0)) AS total_likes_all_platforms,
  SUM(COALESCE(san.total_comments, 0)) AS total_comments_all_platforms,
  SUM(COALESCE(san.total_shares, 0)) AS total_shares_all_platforms,
  SUM(COALESCE(san.total_reach, 0)) AS total_reach_all_platforms,
  SUM(COALESCE(san.total_views, 0)) AS total_views_all_platforms,
  -- Weighted avg engagement rate
  CASE
    WHEN SUM(sa.follower_count) > 0
    THEN CAST(
      SUM(COALESCE(san.avg_engagement_rate, 0) * sa.follower_count) / SUM(sa.follower_count)
    AS INTEGER)
    ELSE 0
  END AS weighted_avg_engagement_rate,
  -- Follower growth (sum across platforms)
  SUM(COALESCE(san.follower_change_30d, 0)) AS total_follower_change_30d,
  -- Health: any accounts with token issues?
  SUM(CASE WHEN sa.token_status != 'valid' THEN 1 ELSE 0 END) AS unhealthy_accounts,
  -- Last sync timestamps
  MIN(COALESCE(sa.metrics_synced_at, 0)) AS oldest_metrics_sync,
  MAX(COALESCE(sa.metrics_synced_at, 0)) AS newest_metrics_sync
FROM social_accounts sa
LEFT JOIN social_analytics san ON san.account_id = sa.id
WHERE sa.is_active = 1
GROUP BY sa.profile_id;
`;

// ─────────────────────────────────────────────────────────────────────────────
// social_posts_analytics_view
// ONE ROW PER profile_id — last 30-day post performance summary.
// Agent fast lookup for briefings and strategy recommendations.
//
// Aggregates social_post_analytics for all published posts in last 30 days.
// Provides: total posts, impressions, likes, avg engagement, top platform.
//
// Used by:
//   /social agent   → "How are my posts performing?"
//   /analytics agent → weekly post metrics briefing
//   /cmo agent       → content strategy input
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_POSTS_ANALYTICS_VIEW_SQL = `
CREATE VIEW IF NOT EXISTS social_posts_analytics_view AS
SELECT
  sp.profile_id,
  -- Total posts across all platforms last 30 days
  COUNT(DISTINCT sp.id)                          AS posts_30d,
  COUNT(DISTINCT sp.platform)                    AS active_platforms_30d,
  -- Engagement totals
  SUM(COALESCE(spa.impressions, 0))              AS impressions_30d,
  SUM(COALESCE(spa.reach, 0))                    AS reach_30d,
  SUM(COALESCE(spa.likes, 0))                    AS likes_30d,
  SUM(COALESCE(spa.comments, 0))                 AS comments_30d,
  SUM(COALESCE(spa.shares, 0))                   AS shares_30d,
  SUM(COALESCE(spa.clicks, 0))                   AS clicks_30d,
  SUM(COALESCE(spa.saves, 0))                    AS saves_30d,
  SUM(COALESCE(spa.views, 0))                    AS video_views_30d,
  -- Averages
  CAST(AVG(COALESCE(spa.engagement_rate, 0)) AS INTEGER) AS avg_engagement_rate_30d,
  CAST(AVG(COALESCE(spa.impressions, 0)) AS INTEGER)     AS avg_impressions_per_post_30d,
  CAST(AVG(COALESCE(spa.likes, 0)) AS INTEGER)           AS avg_likes_per_post_30d,
  -- Platform with most posts in period
  (
    SELECT sp2.platform
    FROM social_posts sp2
    WHERE sp2.profile_id = sp.profile_id
      AND sp2.status = 'published'
      AND sp2.published_at >= strftime('%s','now') - 2592000
    GROUP BY sp2.platform
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ) AS top_platform_by_posts,
  -- Platform with highest avg engagement
  (
    SELECT sp3.platform
    FROM social_posts sp3
    LEFT JOIN social_post_analytics spa3 ON spa3.post_id = sp3.id
    WHERE sp3.profile_id = sp.profile_id
      AND sp3.status = 'published'
      AND sp3.published_at >= strftime('%s','now') - 2592000
    GROUP BY sp3.platform
    ORDER BY AVG(COALESCE(spa3.engagement_rate, 0)) DESC
    LIMIT 1
  ) AS top_platform_by_engagement,
  -- AI label breakdown (JSON object: {"promotional":12,"educational":8,...})
  -- Only counts rows where ai_labeled = 1
  json_group_object(
    COALESCE(sp.ai_label, 'unlabeled'),
    COUNT(CASE WHEN sp.ai_labeled = 1 THEN 1 ELSE NULL END)
  ) AS ai_label_breakdown,
  MIN(sp.published_at) AS first_post_at_30d,
  MAX(sp.published_at) AS last_post_at_30d
FROM social_posts sp
LEFT JOIN social_post_analytics spa ON spa.post_id = sp.id
WHERE sp.status = 'published'
  AND sp.published_at >= strftime('%s','now') - 2592000
GROUP BY sp.profile_id;
`;

// ─────────────────────────────────────────────────────────────────────────────
// DB Triggers for social_analytics counters
// ─────────────────────────────────────────────────────────────────────────────
// These keep total_posts / total_scheduled / total_published / total_failed
// in social_analytics in sync without requiring an aggregator job.
//
// All other analytics columns (time series, breakdowns, averages) are updated
// by the analytics aggregator job (daily / on-demand).
//
// Use CREATE TRIGGER IF NOT EXISTS — safe to run repeatedly.
// DROP + recreate pattern (same as community-triggers.ts) for schema changes.
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_TRIGGERS_SQL: string[] = [
  `DROP TRIGGER IF EXISTS trg_social_post_published_insert`,
  `DROP TRIGGER IF EXISTS trg_social_post_scheduled_insert`,
  `DROP TRIGGER IF EXISTS trg_social_post_status_published`,
  `DROP TRIGGER IF EXISTS trg_social_post_status_failed`,
  `DROP TRIGGER IF EXISTS trg_social_post_analytics_insert`,
  `DROP TRIGGER IF EXISTS trg_social_post_group_count`,

  // Trigger 1: New post inserted as 'published' → total_posts + 1
  `CREATE TRIGGER IF NOT EXISTS trg_social_post_published_insert
   AFTER INSERT ON social_posts
   WHEN NEW.status = 'published'
   BEGIN
     INSERT INTO social_analytics (id, profile_id, account_id, total_posts, total_published)
     VALUES (hex(randomblob(16)), NEW.profile_id, NEW.account_id, 1, 1)
     ON CONFLICT(account_id) DO UPDATE SET
       total_posts     = total_posts + 1,
       total_published = total_published + 1,
       updated_at      = strftime('%s','now');
   END`,

  // Trigger 2: New post inserted as 'scheduled' → total_scheduled + 1
  `CREATE TRIGGER IF NOT EXISTS trg_social_post_scheduled_insert
   AFTER INSERT ON social_posts
   WHEN NEW.status = 'scheduled'
   BEGIN
     INSERT INTO social_analytics (id, profile_id, account_id, total_posts, total_scheduled)
     VALUES (hex(randomblob(16)), NEW.profile_id, NEW.account_id, 1, 1)
     ON CONFLICT(account_id) DO UPDATE SET
       total_posts     = total_posts + 1,
       total_scheduled = total_scheduled + 1,
       updated_at      = strftime('%s','now');
   END`,

  // Trigger 3: Post status changes to 'published' (was scheduled/queued/publishing/draft)
  // P0-3 FIX: decrement whichever pre-publish counter matches OLD.status.
  // Before: only 'scheduled' was decremented — 'queued'/'publishing'/'draft' leaked.
  `CREATE TRIGGER IF NOT EXISTS trg_social_post_status_published
   AFTER UPDATE OF status ON social_posts
   WHEN NEW.status = 'published'
     AND OLD.status != 'published'
   BEGIN
     UPDATE social_analytics SET
       total_published  = total_published + 1,
       total_scheduled  = MAX(0, total_scheduled - CASE
                               WHEN OLD.status IN ('scheduled','queued','publishing','draft') THEN 1
                               ELSE 0 END),
       updated_at       = strftime('%s','now')
     WHERE account_id = NEW.account_id;
   END`,

  // Trigger 4: Post status changes to 'failed' (was scheduled/queued/publishing/draft)
  // P0-3 FIX: same fix — decrement from the correct pre-publish counter.
  `CREATE TRIGGER IF NOT EXISTS trg_social_post_status_failed
   AFTER UPDATE OF status ON social_posts
   WHEN NEW.status = 'failed'
     AND OLD.status != 'failed'
   BEGIN
     UPDATE social_analytics SET
       total_failed    = total_failed + 1,
       total_scheduled = MAX(0, total_scheduled - CASE
                              WHEN OLD.status IN ('scheduled','queued','publishing','draft') THEN 1
                              ELSE 0 END),
       updated_at      = strftime('%s','now')
     WHERE account_id = NEW.account_id;
   END`,

  // Trigger 5: Auto-insert social_post_analytics row on social_posts INSERT
  // Ensures analytics row exists immediately for every post (no NULL joins)
  `CREATE TRIGGER IF NOT EXISTS trg_social_post_analytics_insert
   AFTER INSERT ON social_posts
   BEGIN
     INSERT OR IGNORE INTO social_post_analytics
       (id, post_id, profile_id, account_id, platform)
     VALUES
       (hex(randomblob(16)), NEW.id, NEW.profile_id, NEW.account_id, NEW.platform);
   END`,

  // Trigger 6: Keep social_post_groups.platform_count in sync
  `CREATE TRIGGER IF NOT EXISTS trg_social_post_group_count
   AFTER INSERT ON social_posts
   WHEN NEW.group_id IS NOT NULL
   BEGIN
     UPDATE social_post_groups SET
       platform_count = platform_count + 1
     WHERE id = NEW.group_id;
   END`,
];

// ─────────────────────────────────────────────────────────────────────────────
// Column migrations — EMPTY: automation_family already in CREATE TABLE above;
// idempotency_key + scheduled index now baked in. Safe to keep empty forever.
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_MIGRATIONS_SQL: Array<{ table: string; sql: string }> = [];

// ─────────────────────────────────────────────────────────────────────────────
// Provision
// ─────────────────────────────────────────────────────────────────────────────

export async function provisionSocialTables(url: string, authToken: string): Promise<void> {
  const { createClient } = await import('@libsql/client/web');
  const client = createClient({ url, authToken });

  // Schema
  for (const sql of SOCIAL_SCHEMA_SQL) {
    try { await client.execute(sql); } catch { /* already exists */ }
  }

  // Migrations
  for (const { sql } of SOCIAL_MIGRATIONS_SQL) {
    try { await client.execute(sql); } catch { /* column already exists */ }
  }

  // Triggers
  for (const sql of SOCIAL_TRIGGERS_SQL) {
    try { await client.execute(sql); } catch (err) {
      console.warn(`[social-triggers] Failed: ${(err as Error).message}`);
    }
  }

  // Views — CREATE VIEW IF NOT EXISTS is idempotent
  try { await client.execute(SOCIAL_ANALYTICS_VIEW_SQL); } catch { /* exists */ }
  try { await client.execute(SOCIAL_POSTS_ANALYTICS_VIEW_SQL); } catch { /* exists */ }

  // Seed default labels
  await seedSocialLabels(url, authToken);
}

// ─────────────────────────────────────────────────────────────────────────────
// Zernio key resolver
// Priority: 1) BYOK from connections table  2) platform key from env
// Returns null if neither is configured.
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveZernioKey(
  userDB: any,
  profileId: string,
  env: { ZERNIO_API_KEY?: string }
): Promise<string | null> {
  try {
    const rows = await userDB.execute({
      sql: `SELECT client_id FROM connections
            WHERE profile_id = ? AND service = 'zernio'
            AND is_active = 1 AND client_id IS NOT NULL
            LIMIT 1`,
      args: [profileId],
    });
    const byok = rows?.rows?.[0]?.client_id as string | undefined;
    if (byok) return byok;
  } catch {
    // connections table not provisioned on very old DBs — fall through
  }
  return env.ZERNIO_API_KEY ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Free-tier cap for platform key scheduling
// ─────────────────────────────────────────────────────────────────────────────
export const FREE_TIER_CAP = 20; // posts/month via platform key

// ─────────────────────────────────────────────────────────────────────────────
// Default social labels — seeded on first provision
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_LABEL_PRESETS = [
  { name: 'Promotional',    color: '#f59e0b', icon: '📢' },
  { name: 'Engagement',     color: '#10b981', icon: '💬' },
  { name: 'Educational',    color: '#6366f1', icon: '📚' },
  { name: 'Behind Scenes',  color: '#ec4899', icon: '🎬' },
  { name: 'Product Launch', color: '#ef4444', icon: '🚀' },
  { name: 'Testimonial',    color: '#14b8a6', icon: '⭐' },
  { name: 'Repurposed',     color: '#8b5cf6', icon: '♻️' },
  { name: 'Urgent Reply',   color: '#ef4444', icon: '🔥' },
  { name: 'VIP',            color: '#f59e0b', icon: '👑' },
  { name: 'Spam',           color: '#6b7280', icon: '🚫' },
] as const;

export async function seedSocialLabels(url: string, authToken: string): Promise<void> {
  const { createClient } = await import('@libsql/client/web');
  const client = createClient({ url, authToken });
  try {
    const existing = await client.execute({
      sql: `SELECT COUNT(*) as cnt FROM social_labels LIMIT 1`,
      args: [],
    });
    if (Number(existing.rows[0]?.cnt ?? 0) > 0) return;
    const profileRow = await client.execute({ sql: `SELECT id FROM profiles LIMIT 1`, args: [] });
    const profileId = profileRow.rows[0]?.id as string | undefined;
    if (!profileId) return;
    for (const preset of SOCIAL_LABEL_PRESETS) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO social_labels (id, profile_id, name, color, icon)
              VALUES (?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), profileId, preset.name, preset.color, preset.icon],
      });
    }
  } catch { /* table not yet created */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform registry
// supports_inbox          = DMs/comments/reviews via Zernio Inbox add-on
// supports_comments_dm    = comment_keyword_dm automation supported
//                           ⚠️  Instagram + Facebook ONLY
// requires_selection      = needs secondary page/org/board after OAuth
// max_content_length      = platform character limit for post content
// supports_video          = can upload video content
// auth                    = connection method
//   'oauth'               = standard OAuth (Zernio handles)
//   'credentials'         = username + app password (Bluesky)
//   'code'                = bot code flow (Telegram)
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_PLATFORMS = [
  { value: 'twitter',        label: 'X (Twitter)',     supports_inbox: true,  supports_comments_dm: false, requires_selection: false, max_content_length: 280,   supports_video: true,  auth: 'oauth'       },
  { value: 'instagram',      label: 'Instagram',       supports_inbox: true,  supports_comments_dm: true,  requires_selection: false, max_content_length: 2200,  supports_video: true,  auth: 'oauth'       },
  { value: 'facebook',       label: 'Facebook',        supports_inbox: true,  supports_comments_dm: true,  requires_selection: true,  max_content_length: 63206, supports_video: true,  auth: 'oauth'       },
  { value: 'linkedin',       label: 'LinkedIn',        supports_inbox: true,  supports_comments_dm: false, requires_selection: true,  max_content_length: 3000,  supports_video: true,  auth: 'oauth'       },
  { value: 'tiktok',         label: 'TikTok',          supports_inbox: true,  supports_comments_dm: false, requires_selection: false, max_content_length: 2200,  supports_video: true,  auth: 'oauth'       },
  { value: 'youtube',        label: 'YouTube',         supports_inbox: false, supports_comments_dm: false, requires_selection: false, max_content_length: 5000,  supports_video: true,  auth: 'oauth'       },
  { value: 'pinterest',      label: 'Pinterest',       supports_inbox: false, supports_comments_dm: false, requires_selection: true,  max_content_length: 500,   supports_video: true,  auth: 'oauth'       },
  { value: 'reddit',         label: 'Reddit',          supports_inbox: true,  supports_comments_dm: false, requires_selection: false, max_content_length: 40000, supports_video: true,  auth: 'oauth'       },
  { value: 'bluesky',        label: 'Bluesky',         supports_inbox: true,  supports_comments_dm: false, requires_selection: false, max_content_length: 300,   supports_video: true,  auth: 'credentials' },
  { value: 'threads',        label: 'Threads',         supports_inbox: true,  supports_comments_dm: false, requires_selection: false, max_content_length: 500,   supports_video: true,  auth: 'oauth'       },
  { value: 'googlebusiness', label: 'Google Business', supports_inbox: true,  supports_comments_dm: false, requires_selection: true,  max_content_length: 1500,  supports_video: false, auth: 'oauth'       },
  { value: 'telegram',       label: 'Telegram',        supports_inbox: true,  supports_comments_dm: false, requires_selection: false, max_content_length: 4096,  supports_video: true,  auth: 'code'        },
  { value: 'snapchat',       label: 'Snapchat',        supports_inbox: false, supports_comments_dm: false, requires_selection: true,  max_content_length: 0,     supports_video: true,  auth: 'oauth'       },
] as const;

export type SocialPlatform = typeof SOCIAL_PLATFORMS[number]['value'];

// Platforms that support Zernio Inbox add-on
export const INBOX_SUPPORTED_PLATFORMS = SOCIAL_PLATFORMS
  .filter(p => p.supports_inbox)
  .map(p => p.value);

// Platforms that support comment_keyword_dm automations (Instagram + Facebook only)
export const COMMENT_DM_PLATFORMS = SOCIAL_PLATFORMS
  .filter(p => p.supports_comments_dm)
  .map(p => p.value);
// ['instagram', 'facebook']

// Helper: get max content length for a given platform
export function getMaxContentLength(platform: SocialPlatform): number {
  return SOCIAL_PLATFORMS.find(p => p.value === platform)?.max_content_length ?? 2200;
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook event routing map
// Maps Zernio webhook event types to which table/column to update.
//
// Handler at api/webhooks/zernio/index.ts:
//   1. Validate HMAC or Bearer token against connections.extra.webhook_secret
//      OR env.ZERNIO_WEBHOOK_SECRET for platform-key mode
//   2. Look up social_posts WHERE zernio_post_id = event.post_id
//      AND platform = event.platform
//   3. Apply update per ZERNIO_WEBHOOK_EVENTS map below
// ─────────────────────────────────────────────────────────────────────────────
export const ZERNIO_WEBHOOK_EVENTS = {
  'post.published': {
    table: 'social_posts',
    updates: ['status=published', 'platform_post_id', 'platform_post_url', 'published_at'],
  },
  'post.failed': {
    table: 'social_posts',
    updates: ['status=failed', 'error'],
  },
  'post.scheduled': {
    table: 'social_posts',
    updates: ['status=scheduled'],
  },
  'account.connected': {
    table: 'social_accounts',
    updates: ['zernio_account_id', 'is_connected=1', 'token_status=valid'],
  },
  'account.token_expired': {
    table: 'social_accounts',
    updates: ['token_status=expired', 'health_error'],
  },
  'account.token_revoked': {
    table: 'social_accounts',
    updates: ['token_status=revoked', 'is_connected=0'],
  },
  'inbox.message': {
    table: 'social_inbox',
    updates: ['INSERT new row'],
    // Requires Zernio Inbox add-on
  },
  'automation.triggered': {
    table: 'social_automation_logs',
    updates: ['INSERT new row', 'social_automations.trigger_count+1'],
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// AI label values — used for ai_label column in social_posts
// Written by background ML labeling job (ai_labeled = 0 → 1 after processing)
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_POST_AI_LABELS = [
  'promotional',
  'educational',
  'engagement',
  'testimonial',
  'announcement',
  'behind_scenes',
  'product_launch',
  'thought_leadership',
  'community',
  'entertainment',
  'news',
  'question',
  'repurposed',
] as const;

export type SocialPostAiLabel = typeof SOCIAL_POST_AI_LABELS[number];

// ─────────────────────────────────────────────────────────────────────────────
// Competitor relationship types
// ─────────────────────────────────────────────────────────────────────────────
export const COMPETITOR_RELATIONSHIPS = [
  'competitor',
  'inspiration',
  'partner',
  'client',
  'influencer',
  'watch',
] as const;

export type CompetitorRelationship = typeof COMPETITOR_RELATIONSHIPS[number];
