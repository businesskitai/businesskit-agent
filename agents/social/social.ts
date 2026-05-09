/**
 * Social Agent — one post per (post, platform). Zernio primary, direct
 * platform APIs secondary, n8n fallback.
 *
 * DB contract (businesskit-files/social.ts):
 *   - connections       : encrypted API creds. service='zernio' for BYOK,
 *                         service='{platform}_direct' for direct mode.
 *   - social_accounts   : one row per connected account. Owns connection_mode:
 *                         'zernio_platform' | 'zernio_byok' | 'direct' | 'n8n'
 *   - social_posts      : ★ ONE ROW PER POST PER PLATFORM. Same content to
 *                         N platforms → N rows + one shared group_id.
 *                         platform_post_id is first-class indexed column,
 *                         written by Zernio webhook / direct API response.
 *                         UNIQUE (idempotency_key) WHERE NOT NULL.
 *   - social_post_groups: 1 row per cross-post. trg_social_post_group_count
 *                         auto-bumps platform_count on each child insert.
 *   - social_post_analytics: auto-seeded by trg_social_post_analytics_insert
 *                         on every social_posts INSERT. Never INSERT here.
 *   - social_analytics  : per-account aggregate. total_posts/published/
 *                         scheduled/failed trigger-maintained. Rest written
 *                         by aggregator job.
 *   - social_queue      : recurring slots (day_of_week + time_of_day).
 *                         Zernio mirrors slots via zernio_slot_id.
 *   - social_inbox      : DMs/comments/reviews. CRM bridge via crm_contact_id.
 *
 * Triggers that fire on our writes (all auto):
 *   - trg_social_post_analytics_insert  → seeds social_post_analytics
 *   - trg_social_post_group_count       → +1 social_post_groups.platform_count
 *   - trg_social_post_published_insert  → bumps social_analytics when
 *                                         status='published' at INSERT time
 *   - trg_social_post_scheduled_insert  → bumps social_analytics when
 *                                         status='scheduled' at INSERT time
 *
 * Posting modes (Mode A platform key is Phase 2 — session-required, skipped):
 *   Mode B (primary)  — Zernio BYOK. connections WHERE service='zernio'
 *                       → POST {ZERNIO_BASE}/posts with Bearer key.
 *   Mode C (secondary)— Direct platform API. connections WHERE
 *                       service='{platform}_direct'. Agent writes the row
 *                       with status='scheduled'; the app-side dispatcher
 *                       cron calls the platform API. Agent does NOT call
 *                       the platform APIs itself (wildly divergent shapes).
 *   Mode D (fallback) — n8n. POST credentials.n8n_webhook_url with payload,
 *                       n8n callback sets platform_post_id + status.
 *
 * Timestamps on social_posts are INTEGER unix seconds except `scheduled_for`
 * (ISO TEXT) and `published_at` (INTEGER).
 */

import { BaseAgent, db, ulid, now } from '../_base.ts'

const ZERNIO_BASE     = 'https://zernio.com/api/v1'
const FREE_TIER_CAP   = 20   // posts/month via platform key (matches social.ts)
const MAX_CONTENT_DEF = 2200 // fallback when platform unknown

export type SocialPlatform =
  | 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'
  | 'youtube' | 'pinterest' | 'reddit' | 'bluesky' | 'threads'
  | 'googlebusiness' | 'telegram' | 'snapchat'

export type ConnectionMode = 'zernio_platform' | 'zernio_byok' | 'direct' | 'n8n'

export type PostStatus =
  | 'draft' | 'scheduled' | 'queued' | 'publishing' | 'published'
  | 'partial' | 'failed' | 'cancelled'

export type InboxStatus = 'unread' | 'read' | 'replied' | 'archived' | 'spam'
export type InboxType   = 'dm' | 'comment' | 'review'

export interface MediaItem {
  url:            string
  type:           'image' | 'video' | 'document'
  thumbnail_url?: string
  alt_text?:      string
}

export interface PostInput {
  content:                  string
  platforms?:               SocialPlatform[]   // omit = all connected active accounts
  account_ids?:             string[]           // or target specific social_accounts.id
  scheduled_for?:           string             // ISO e.g. '2026-04-01T09:00:00'
  timezone?:                string             // default 'UTC'
  publish_now?:             boolean
  use_queue?:               boolean
  media_items?:             MediaItem[]
  link_url?:                string
  platform_specific_data?:  Record<string, unknown>
  source?:                  string             // 'manual' | 'agent' | 'blog_crosspost' | …
  source_id?:               string             // FK → posts.id / products.id
  ai_generated?:            boolean
  ai_prompt?:               string
  approval_status?:         'pending' | 'approved' | 'auto_sent'
  group_name?:              string             // optional label for the cross-post
  idempotency_prefix?:      string             // customise retry dedup scope
}

export interface PerPlatformResult {
  account_id:         string
  platform:           SocialPlatform
  social_post_id:     string
  status:             PostStatus
  zernio_post_id?:    string | null
  platform_post_id?:  string | null
  error?:             string
  scheduled_via:      'byok' | 'platform' | 'direct' | 'n8n'
}

export interface PostResult {
  ok:         boolean
  group_id?:  string
  results:    PerPlatformResult[]
  error?:     string
}

export class SocialAgent extends BaseAgent {
  readonly name  = 'Social'
  readonly title = 'Social Agent'

  // ── Reads ────────────────────────────────────────────────────────────────

  async listAccounts(opts: {
    platform?:   SocialPlatform
    active_only?: boolean
  } = {}) {
    await this.init()
    let where = 'WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.active_only !== false) where += ' AND is_active=1 AND is_connected=1'
    if (opts.platform)             { where += ' AND platform=?'; args.push(opts.platform) }
    const { rows } = await db.execute({
      sql: `SELECT id, connection_id, connection_mode, platform,
                   platform_username, platform_display_name, platform_avatar_url,
                   zernio_account_id, follower_count,
                   token_status, is_connected, is_active, last_health_check_at,
                   default_timezone
            FROM social_accounts ${where}
            ORDER BY platform ASC`,
      args,
    })
    return rows
  }

  async listPosts(opts: {
    status?:   PostStatus
    platform?: SocialPlatform
    account_id?: string
    group_id?: string
    limit?:    number
  } = {}) {
    await this.init()
    let where = 'WHERE profile_id=? AND hidden=0'
    const args: unknown[] = [this.profileId]
    if (opts.status)     { where += ' AND status=?';     args.push(opts.status) }
    if (opts.platform)   { where += ' AND platform=?';   args.push(opts.platform) }
    if (opts.account_id) { where += ' AND account_id=?'; args.push(opts.account_id) }
    if (opts.group_id)   { where += ' AND group_id=?';   args.push(opts.group_id) }
    const { rows } = await db.execute({
      sql: `SELECT id, account_id, group_id, platform, status, scheduled_for,
                   published_at, platform_post_id, platform_post_url,
                   zernio_post_id, content, approval_status, scheduled_via,
                   error, created_at
            FROM social_posts ${where}
            ORDER BY created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 50],
    })
    return rows
  }

  getDrafts()    { return this.listPosts({ status: 'draft' }) }
  getScheduled() { return this.listPosts({ status: 'scheduled' }) }
  getPublished() { return this.listPosts({ status: 'published' }) }

  async getPost(id: string) {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT * FROM social_posts WHERE id=? AND profile_id=? LIMIT 1`,
      args: [id, this.profileId],
    })
    if (!r) throw new Error(`Social post not found: ${id}`)
    return r
  }

  async getGroup(groupId: string) {
    await this.init()
    const [{ rows: [group] }, { rows: posts }] = await Promise.all([
      db.execute({
        sql: `SELECT * FROM social_post_groups WHERE id=? AND profile_id=? LIMIT 1`,
        args: [groupId, this.profileId],
      }),
      db.execute({
        sql: `SELECT id, account_id, platform, status, platform_post_id,
                     platform_post_url, zernio_post_id, scheduled_via, error
              FROM social_posts
              WHERE group_id=? AND profile_id=?
              ORDER BY platform ASC`,
        args: [groupId, this.profileId],
      }),
    ])
    if (!group) throw new Error(`Group not found: ${groupId}`)
    return { ...group, posts }
  }

  // ── Core: create + dispatch ──────────────────────────────────────────────

  async post(input: PostInput): Promise<PostResult> {
    await this.init()

    if (!input.content?.trim()) {
      return { ok: false, results: [], error: 'content is required' }
    }

    // 1. Resolve target accounts
    const allAccounts = await this.listAccounts({ active_only: true })
    if (!allAccounts.length) {
      return {
        ok: false, results: [],
        error: 'No connected social accounts. Connect platforms in BusinessKit → Settings → Social.',
      }
    }

    let targets = allAccounts as Array<Record<string, unknown>>
    if (input.account_ids?.length) {
      const ids = new Set(input.account_ids)
      targets = targets.filter(a => ids.has(a.id as string))
    } else if (input.platforms?.length) {
      const ps = new Set(input.platforms)
      targets = targets.filter(a => ps.has(a.platform as SocialPlatform))
    }
    if (!targets.length) {
      return {
        ok: false, results: [],
        error: `No matching accounts for: ${
          input.account_ids?.join(', ') ?? input.platforms?.join(', ') ?? '(all)'
        }`,
      }
    }

    // 2. Per-platform content length check (truncate upstream; we just warn).
    for (const a of targets) {
      const max = getMaxContentLength(a.platform as SocialPlatform)
      if (input.content.length > max) {
        return {
          ok: false, results: [],
          error: `Content exceeds ${a.platform} max length (${max}). Shorten or target platforms separately.`,
        }
      }
    }

    // 3. Create cross-post group if >1 target.
    const ts = now()
    let groupId: string | null = null
    if (targets.length > 1) {
      groupId = ulid()
      await db.write({
        sql: `INSERT INTO social_post_groups (id, profile_id, name, source_content, platform_count)
              VALUES (?,?,?,?,0)`,
        args: [groupId, this.profileId, input.group_name ?? null, input.content],
      })
    }

    // 4. Resolve a Zernio BYOK key once — reused for every zernio_byok account.
    const zernioByokKey = await this.resolveZernioByokKey()

    // 5. Dispatch per account. One social_posts row per account/platform.
    const results: PerPlatformResult[] = []
    for (const acc of targets) {
      const mode = (acc.connection_mode as ConnectionMode) ?? 'zernio_byok'
      const r = await this.dispatchOne({
        account: acc, mode, input, ts, groupId,
        zernioByokKey,
      })
      results.push(r)
    }

    const ok = results.every(r => r.status !== 'failed')
    await this.logMemory(
      ok
        ? `Posted "${input.content.slice(0, 60)}..." to ${results.map(r => r.platform).join(', ')}`
        : `Post partially failed: ${results.filter(r => r.error).map(r => r.platform).join(', ')}`,
      { group_id: groupId, count: results.length, ok },
    )

    return { ok, group_id: groupId ?? undefined, results }
  }

  // ── Convenience wrappers ─────────────────────────────────────────────────

  async crossPostBlog(postId: string, title: string, slug: string, excerpt?: string) {
    const url = `https://${this.ctx.profile.slug}.businesskit.io/blog/${slug}`
    const content = excerpt ? `${title}\n\n${excerpt}\n\n${url}` : `${title}\n\n${url}`
    return this.post({
      content,
      source:    'blog_crosspost',
      source_id: postId,
    })
  }

  async announceProduct(productId: string, title: string, slug: string, priceCents: number) {
    const url   = `https://${this.ctx.profile.slug}.businesskit.io/store/${slug}`
    const price = `$${(priceCents / 100).toFixed(2)}`
    return this.post({
      content:  `New: ${title} — ${price}\n\n${url}`,
      source:   'product_launch',
      source_id: productId,
    })
  }

  // ── Queue ────────────────────────────────────────────────────────────────

  async listQueueSlots(accountId?: string) {
    await this.init()
    let where = 'WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (accountId) { where += ' AND account_id=?'; args.push(accountId) }
    const { rows } = await db.execute({
      sql: `SELECT id, account_id, day_of_week, time_of_day, timezone,
                   is_active, next_scheduled_at, last_used_at, zernio_slot_id
            FROM social_queue ${where}
            ORDER BY day_of_week ASC, time_of_day ASC`,
      args,
    })
    return rows
  }

  async addQueueSlot(input: {
    account_id:  string
    day_of_week: number            // 0=Sun … 6=Sat
    time_of_day: string            // 'HH:MM'
    timezone?:   string
  }) {
    await this.init()
    if (input.day_of_week < 0 || input.day_of_week > 6) {
      throw new Error(`day_of_week must be 0..6, got ${input.day_of_week}`)
    }
    if (!/^\d{2}:\d{2}$/.test(input.time_of_day)) {
      throw new Error(`time_of_day must be 'HH:MM', got ${input.time_of_day}`)
    }
    const id  = ulid()
    const ikey = `queue:${input.account_id}:${input.day_of_week}:${input.time_of_day}`
    await db.write({
      sql: `INSERT OR IGNORE INTO social_queue
              (id, profile_id, account_id, day_of_week, time_of_day, timezone,
               is_active, idempotency_key)
            VALUES (?,?,?,?,?,?,1,?)`,
      args: [
        id, this.profileId, input.account_id, input.day_of_week,
        input.time_of_day, input.timezone ?? 'UTC', ikey,
      ],
    })
    return id
  }

  async removeQueueSlot(slotId: string) {
    await this.init()
    await db.write({
      sql: `DELETE FROM social_queue WHERE id=? AND profile_id=?`,
      args: [slotId, this.profileId],
    })
  }

  // ── Inbox ────────────────────────────────────────────────────────────────

  async inbox(opts: {
    status?:   InboxStatus
    type?:     InboxType
    platform?: SocialPlatform
    limit?:    number
  } = {}) {
    await this.init()
    let where = 'WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.status)   { where += ' AND status=?';   args.push(opts.status) }
    if (opts.type)     { where += ' AND type=?';     args.push(opts.type) }
    if (opts.platform) { where += ' AND platform=?'; args.push(opts.platform) }
    const { rows } = await db.execute({
      sql: `SELECT id, account_id, type, platform, status, sender_username,
                   sender_display_name, crm_contact_id, post_id,
                   content, rating, sentiment, is_starred,
                   agent_draft, agent_suggested_action, approval_status,
                   received_at
            FROM social_inbox ${where}
            ORDER BY received_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 50],
    })
    return rows
  }

  async markInbox(id: string, status: InboxStatus) {
    await this.init()
    await db.write({
      sql: `UPDATE social_inbox SET status=?, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [status, now(), id, this.profileId],
    })
  }

  // ── Analytics summary ────────────────────────────────────────────────────

  /** Per-profile cross-platform overview using social_analytics_view (1 row
   *  per profile, auto-joined across accounts). Falls back to ad-hoc query
   *  if the view isn't provisioned yet. */
  async socialSummary() {
    await this.init()
    try {
      const { rows: [r] } = await db.execute({
        sql: `SELECT * FROM social_analytics_view WHERE profile_id=? LIMIT 1`,
        args: [this.profileId],
      })
      if (r) return r
    } catch { /* view missing — fall through */ }

    const { rows: accountRows } = await db.execute({
      sql: `SELECT COUNT(*) AS accounts
            FROM social_accounts
            WHERE profile_id=? AND is_active=1 AND is_connected=1`,
      args: [this.profileId],
    })
    const { rows: [counts] } = await db.execute({
      sql: `SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
              SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) AS scheduled,
              SUM(CASE WHEN status='draft'     THEN 1 ELSE 0 END) AS drafts,
              SUM(CASE WHEN status='failed'    THEN 1 ELSE 0 END) AS failed
            FROM social_posts
            WHERE profile_id=? AND hidden=0`,
      args: [this.profileId],
    })
    return {
      accounts:  Number(accountRows[0]?.accounts ?? 0),
      total:     Number(counts?.total     ?? 0),
      published: Number(counts?.published ?? 0),
      scheduled: Number(counts?.scheduled ?? 0),
      drafts:    Number(counts?.drafts    ?? 0),
      failed:    Number(counts?.failed    ?? 0),
    }
  }

  async accountAnalytics(accountId: string) {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT * FROM social_analytics WHERE account_id=? AND profile_id=? LIMIT 1`,
      args: [accountId, this.profileId],
    })
    return r ?? null
  }

  // ── Dispatch (private) ───────────────────────────────────────────────────

  /** Write one social_posts row + dispatch per its mode. Never throws —
   *  catches and stuffs error into the row so you still get a record. */
  private async dispatchOne(args: {
    account:        Record<string, unknown>
    mode:           ConnectionMode
    input:          PostInput
    ts:             number
    groupId:        string | null
    zernioByokKey:  string | null
  }): Promise<PerPlatformResult> {
    const { account, mode, input, ts, groupId, zernioByokKey } = args
    const accountId = account.id as string
    const platform  = account.platform as SocialPlatform
    const postId    = ulid()
    const month     = new Date(ts * 1000).toISOString().slice(0, 7)
    const scheduledVia: PerPlatformResult['scheduled_via'] =
      mode === 'zernio_byok' ? 'byok'
      : mode === 'zernio_platform' ? 'platform'
      : mode === 'direct' ? 'direct'
      : 'n8n'

    const base: PerPlatformResult = {
      account_id: accountId, platform, social_post_id: postId,
      status: 'draft', scheduled_via: scheduledVia,
    }

    // Initial status from mode + options
    let status: PostStatus =
      input.publish_now     ? 'queued'    :
      input.scheduled_for   ? 'scheduled' :
      input.use_queue       ? 'queued'    :
      'draft'
    let zernioPostId:  string | null = null
    let platformPostId: string | null = null
    let errorText:     string | null = null

    // ── Zernio BYOK — actually call the API ────────────────────────────────
    if (mode === 'zernio_byok') {
      if (!zernioByokKey) {
        errorText = 'No Zernio BYOK key in connections (service=zernio)'
        status    = 'failed'
      } else if (!account.zernio_account_id) {
        errorText = `Account missing zernio_account_id — reconnect via Zernio`
        status    = 'failed'
      } else {
        const resp = await callZernio({
          apiKey:           zernioByokKey,
          content:          input.content,
          platforms: [{ platform, accountId: account.zernio_account_id as string }],
          publishNow:       input.publish_now,
          useQueue:         input.use_queue,
          scheduledFor:     input.scheduled_for,
          timezone:         input.timezone ?? (account.default_timezone as string) ?? 'UTC',
          mediaItems:       input.media_items,
          platformSpecific: input.platform_specific_data,
        })
        if (resp.ok) {
          zernioPostId   = resp.zernio_post_id ?? null
          platformPostId = resp.platform_post_id ?? null
          status         = input.publish_now
            ? (platformPostId ? 'published' : 'publishing')
            : input.scheduled_for ? 'scheduled' : 'queued'
        } else {
          errorText = resp.error ?? 'Zernio API error'
          status    = 'failed'
        }
      }
    }

    // ── Zernio platform key — requires session; refuse from agent ──────────
    if (mode === 'zernio_platform') {
      errorText = 'Platform-key posting requires dashboard session. Use /api/social/schedule.'
      status    = 'failed'
    }

    // ── Direct mode — write row, let app-side dispatcher call the API ──────
    if (mode === 'direct') {
      // Leave status so the cron picks it up:
      //   publish_now  → 'queued' (dispatcher promotes to 'publishing' → 'published')
      //   scheduled_for→ 'scheduled' (dispatcher picks up when scheduled_for<=now)
      //   use_queue    → 'queued' (dispatcher picks next queue slot)
      //   otherwise    → 'draft'
      // Nothing to do here — writing the row is the action.
    }

    // ── n8n mode — forward payload, treat as fire-and-forget ──────────────
    if (mode === 'n8n') {
      const webhook = this.ctx.credentials?.n8n_webhook_url as string | undefined
      if (!webhook) {
        errorText = 'No n8n_webhook_url in credentials'
        status    = 'failed'
      } else {
        try {
          const r = await fetch(webhook, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              event:         'social_post',
              profile_id:    this.profileId,
              account_id:    accountId,
              platform,
              content:       input.content,
              media_items:   input.media_items ?? [],
              scheduled_for: input.scheduled_for ?? null,
              publish_now:   input.publish_now ?? false,
              timezone:      input.timezone ?? 'UTC',
              source:        input.source ?? 'agent',
              source_id:     input.source_id ?? null,
              post_id:       postId,
            }),
          })
          if (!r.ok) {
            errorText = `n8n returned ${r.status}`
            status    = 'failed'
          } else {
            // n8n callback sets platform_post_id + final status async
            status = input.publish_now ? 'queued' : status
          }
        } catch (e) {
          errorText = `n8n error: ${(e as Error).message}`
          status    = 'failed'
        }
      }
    }

    // ── Write the social_posts row ────────────────────────────────────────
    // idempotency_key dedupes retries of the same logical send.
    const ikey = (input.idempotency_prefix ?? 'sp')
               + `:${accountId}:${input.source_id ?? 'none'}:${sha(input.content).slice(0, 16)}`

    await db.write({
      sql: `INSERT OR IGNORE INTO social_posts (
              id, profile_id, account_id, group_id, platform,
              platform_post_id, platform_post_url,
              zernio_post_id, zernio_account_id,
              content, media_items, link_url,
              platform_specific_data,
              status, scheduled_for, timezone, publish_now, use_queue,
              published_at,
              approval_status,
              source, source_id,
              ai_generated, ai_prompt,
              scheduled_via, platform_schedule_count, platform_schedule_month,
              error,
              idempotency_key,
              created_at, updated_at
            ) VALUES (
              ?,?,?,?,?,
              ?,?,
              ?,?,
              ?,?,?,
              ?,
              ?,?,?,?,?,
              ?,
              ?,
              ?,?,
              ?,?,
              ?,?,?,
              ?,
              ?,
              ?,?
            )`,
      args: [
        postId, this.profileId, accountId, groupId, platform,
        platformPostId, null,
        zernioPostId, (account.zernio_account_id as string) ?? null,
        input.content,
        JSON.stringify(input.media_items ?? []),
        input.link_url ?? null,
        JSON.stringify(input.platform_specific_data ?? {}),
        status, input.scheduled_for ?? null, input.timezone ?? 'UTC',
        input.publish_now ? 1 : 0, input.use_queue ? 1 : 0,
        status === 'published' ? ts : null,
        input.approval_status ?? 'auto_sent',
        input.source ?? 'agent', input.source_id ?? null,
        input.ai_generated ? 1 : 0, input.ai_prompt ?? null,
        scheduledVia, 0, month,
        errorText,
        ikey,
        ts, ts,
      ],
    })

    return {
      ...base,
      status,
      zernio_post_id:   zernioPostId,
      platform_post_id: platformPostId,
      error:            errorText ?? undefined,
    }
  }

  // ── Zernio BYOK resolver ─────────────────────────────────────────────────
  // Priority matches app-side resolveZernioKey(): BYOK first. We do NOT
  // fall through to a platform key — that path requires session auth.
  private async resolveZernioByokKey(): Promise<string | null> {
    try {
      const { rows: [r] } = await db.execute({
        sql: `SELECT client_id FROM connections
              WHERE profile_id=? AND service='zernio'
                AND is_active=1 AND client_id IS NOT NULL
              LIMIT 1`,
        args: [this.profileId],
      })
      return (r?.client_id as string) ?? null
    } catch {
      return null
    }
  }
}

// ── Zernio API client ──────────────────────────────────────────────────────

interface ZernioCallArgs {
  apiKey:           string
  content:          string
  platforms:        Array<{ platform: string; accountId: string }>
  publishNow?:      boolean
  useQueue?:        boolean
  scheduledFor?:    string
  timezone?:        string
  mediaItems?:      MediaItem[]
  platformSpecific?: Record<string, unknown>
}

interface ZernioCallResult {
  ok:                boolean
  zernio_post_id?:   string | null
  platform_post_id?: string | null
  error?:            string
}

async function callZernio(args: ZernioCallArgs): Promise<ZernioCallResult> {
  const payload: Record<string, unknown> = {
    content:   args.content,
    platforms: args.platforms,
  }
  if (args.publishNow)                 payload.publishNow    = true
  if (args.useQueue)                   payload.useQueue      = true
  if (args.scheduledFor)               payload.scheduledFor  = args.scheduledFor
  if (args.timezone)                   payload.timezone      = args.timezone
  if (args.mediaItems?.length)         payload.mediaItems    = args.mediaItems
  if (args.platformSpecific &&
      Object.keys(args.platformSpecific).length)
                                       payload.platformSpecific = args.platformSpecific

  try {
    const res = await fetch(`${ZERNIO_BASE}/posts`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, error: `Zernio ${res.status}: ${text.slice(0, 300)}` }
    const body = safeJson(text) as Record<string, unknown> | null
    // Zernio shape can vary; grab the first result we recognise.
    const first = Array.isArray(body?.results) ? (body.results as Record<string, unknown>[])[0]
                : Array.isArray(body?.posts)   ? (body.posts as Record<string, unknown>[])[0]
                : body
    return {
      ok:                true,
      zernio_post_id:    (first?.id ?? first?.post_id ?? first?.zernio_post_id ?? null) as string | null,
      platform_post_id:  (first?.platform_post_id ?? first?.platformPostId ?? null) as string | null,
    }
  } catch (e) {
    return { ok: false, error: `Zernio fetch failed: ${(e as Error).message}` }
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function getMaxContentLength(platform: SocialPlatform): number {
  // Matches businesskit-files/social.ts SOCIAL_PLATFORMS.
  const m: Record<SocialPlatform, number> = {
    twitter: 280, instagram: 2200, facebook: 63206, linkedin: 3000, tiktok: 2200,
    youtube: 5000, pinterest: 500, reddit: 40000, bluesky: 300, threads: 500,
    googlebusiness: 1500, telegram: 4096, snapchat: 0,
  }
  return m[platform] ?? MAX_CONTENT_DEF
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

/** Small non-crypto hash for idempotency_key disambiguation. */
function sha(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36).padStart(8, '0')
}

export const socialAgent = new SocialAgent()
