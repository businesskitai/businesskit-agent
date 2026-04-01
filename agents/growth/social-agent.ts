/**
 * Social Agent — Agent-First SMM
 *
 * All posting goes through Zernio API (https://zernio.com/api/v1).
 * Reads from social_accounts, social_posts, social_post_platforms in Turso.
 * Writes social_posts rows, then calls Zernio to schedule/publish.
 *
 * Three modes (from social.ts):
 *   zernio_byok     → user's own Zernio key from connections table
 *   zernio_platform → BusinessKit platform key via POST /api/social/schedule
 *   direct          → n8n webhook fallback
 *
 * Agent reads mode from social_accounts.connection_mode and routes accordingly.
 * Platform key (ZERNIO_API_KEY) is NEVER used here — that's the Worker's job.
 */

import { BaseAgent, db, ulid, now, iso } from '../_base.ts'

const ZERNIO_BASE = 'https://zernio.com/api/v1'

export type SocialPlatform =
  | 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'
  | 'youtube' | 'pinterest' | 'reddit' | 'bluesky' | 'threads'
  | 'googlebusiness' | 'telegram' | 'snapchat'

export interface PostInput {
  content: string
  platforms?: SocialPlatform[]    // omit = all connected accounts
  scheduledFor?: string           // ISO: '2026-04-01T09:00:00'
  timezone?: string               // default: 'UTC'
  publishNow?: boolean
  useQueue?: boolean              // use Zernio's recurring queue
  mediaItems?: Array<{ url: string; type: 'image' | 'video' | 'document' }>
  sourceId?: string               // FK to posts.id / products.id for cross-post
  sourceType?: 'blog_crosspost' | 'product_launch' | 'manual'
}

export interface PostResult {
  ok: boolean
  post_id?: string           // local social_posts.id
  zernio_post_id?: string    // Zernio's post ID
  platforms: string[]
  status: string
  error?: string
}

export class SocialAgent extends BaseAgent {
  readonly name  = 'Social Agent'
  readonly title = 'Social Agent'

  // ── Read state from DB ──────────────────────────────────────────────────────

  async listAccounts(activeOnly = true) {
    await this.init()
    let sql = 'SELECT * FROM social_accounts WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (activeOnly) { sql += ' AND is_active=1 AND is_connected=1' }
    const { rows } = await db.execute({ sql, args })
    return rows
  }

  async listPosts(opts: { status?: string; limit?: number } = {}) {
    await this.init()
    let sql = 'SELECT * FROM social_posts WHERE profile_id=? AND hidden=0'
    const args: unknown[] = [this.profileId]
    if (opts.status) { sql += ' AND status=?'; args.push(opts.status) }
    sql += ` ORDER BY created_at DESC LIMIT ${opts.limit ?? 20}`
    const { rows } = await db.execute({ sql, args })
    return rows
  }

  async getDrafts() { return this.listPosts({ status: 'draft' }) }
  async getScheduled() { return this.listPosts({ status: 'scheduled' }) }

  async getAnalytics(accountId: string) {
    const { rows: [r] } = await db.execute({
      sql: 'SELECT * FROM social_analytics WHERE account_id=? LIMIT 1',
      args: [accountId],
    })
    return r ?? null
  }

  async getInbox(opts: { status?: string; type?: string; limit?: number } = {}) {
    await this.init()
    let sql = 'SELECT * FROM social_inbox WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.status) { sql += ' AND status=?'; args.push(opts.status) }
    if (opts.type)   { sql += ' AND type=?';   args.push(opts.type) }
    sql += ` ORDER BY received_at DESC LIMIT ${opts.limit ?? 50}`
    const { rows } = await db.execute({ sql, args })
    return rows
  }

  // ── Core: create + schedule a post ─────────────────────────────────────────

  async post(input: PostInput): Promise<PostResult> {
    await this.init()

    // 1. Determine which accounts to post to
    const accounts = await this.listAccounts()
    if (!accounts.length) {
      return { ok: false, platforms: [], status: 'no_accounts',
        error: 'No connected social accounts. Connect platforms in BusinessKit → Settings → Social.' }
    }

    const targets = input.platforms
      ? accounts.filter(a => input.platforms!.includes(a.platform as SocialPlatform))
      : accounts

    if (!targets.length) {
      return { ok: false, platforms: [], status: 'no_matching_accounts',
        error: `No accounts connected for: ${input.platforms?.join(', ')}` }
    }

    // 2. Resolve Zernio key (BYOK only — platform key goes via /api/social/schedule)
    const zernioKey = await this.resolveZernioKey()

    // 3. Determine connection mode
    const mode = targets[0].connection_mode as string

    if (mode === 'zernio_byok' && zernioKey) {
      return this.postViaZernio(input, targets, zernioKey, 'byok')
    }

    if (mode === 'zernio_platform') {
      // Needs session token — only works in-app (Phase 2)
      return {
        ok: false, platforms: [], status: 'requires_session',
        error: 'Platform key posting requires authentication. Use /api/social/schedule from the dashboard.',
      }
    }

    if (mode === 'n8n' || this.ctx.credentials.n8n_webhook_url) {
      return this.postViaN8n(input, targets)
    }

    return { ok: false, platforms: [], status: 'no_method',
      error: 'No Zernio key or n8n webhook configured.' }
  }

  // ── Zernio posting (BYOK) ───────────────────────────────────────────────────

  private async postViaZernio(
    input: PostInput,
    accounts: typeof Object[],
    apiKey: string,
    scheduledVia: 'byok' | 'platform'
  ): Promise<PostResult> {
    const platforms = accounts.map((a: any) => ({
      platform:  a.platform,
      accountId: a.zernio_account_id,
    }))

    const payload: Record<string, unknown> = {
      content:   input.content,
      platforms,
    }

    if (input.publishNow)    payload.publishNow    = true
    if (input.useQueue)      payload.useQueue      = true
    if (input.scheduledFor)  payload.scheduledFor  = input.scheduledFor
    if (input.timezone)      payload.timezone      = input.timezone ?? 'UTC'
    if (input.mediaItems?.length) payload.mediaItems = input.mediaItems

    let zernioRes: { id?: string; status?: string } = {}
    let ok = false
    let error: string | undefined

    try {
      const res = await fetch(`${ZERNIO_BASE}/posts`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (res.ok) {
        zernioRes = await res.json() as typeof zernioRes
        ok = true
      } else {
        const errBody = await res.text()
        error = `Zernio ${res.status}: ${errBody}`
      }
    } catch (e) {
      error = String(e)
    }

    // Write to social_posts regardless — draft if failed
    const postId = ulid()
    const ts     = now()
    const month  = new Date().toISOString().slice(0, 7)
    const status = ok
      ? (input.publishNow ? 'published' : input.scheduledFor ? 'scheduled' : 'queued')
      : 'failed'

    await db.execute({
      sql: `INSERT INTO social_posts
            (id,profile_id,content,status,scheduled_for,timezone,publish_now,use_queue,
             source,source_id,zernio_post_id,scheduled_via,platform_schedule_month,
             ai_generated,error,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
      args: [
        postId, this.profileId, input.content, status,
        input.scheduledFor ?? null, input.timezone ?? 'UTC',
        input.publishNow ? 1 : 0, input.useQueue ? 1 : 0,
        input.sourceType ?? 'manual', input.sourceId ?? null,
        zernioRes.id ?? null, scheduledVia, month,
        error ?? null, ts, ts,
      ],
    })

    // Write per-platform rows
    if (ok && zernioRes.id) {
      const stmts = (accounts as any[]).map(a => ({
        sql: `INSERT INTO social_post_platforms
              (id,post_id,profile_id,account_id,platform,zernio_account_id,zernio_post_id,
               status,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [
          ulid(), postId, this.profileId, a.id, a.platform,
          a.zernio_account_id, zernioRes.id, status, ts, ts,
        ],
      }))
      await db.batch(stmts)
    }

    await this.logProgress(ok, input.content.slice(0, 60), (accounts as any[]).map(a => a.platform))

    return {
      ok,
      post_id:       postId,
      zernio_post_id: zernioRes.id,
      platforms:     (accounts as any[]).map(a => a.platform),
      status,
      error,
    }
  }

  // ── n8n fallback ────────────────────────────────────────────────────────────

  private async postViaN8n(input: PostInput, accounts: typeof Object[]): Promise<PostResult> {
    const { n8n_webhook_url } = this.ctx.credentials
    if (!n8n_webhook_url) {
      return { ok: false, platforms: [], status: 'no_n8n', error: 'No n8n webhook URL in credentials.' }
    }

    try {
      const res = await fetch(n8n_webhook_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          event:         'social_post',
          profile_id:    this.profileId,
          business:      this.ctx.profile.title,
          content:       input.content,
          platforms:     (accounts as any[]).map(a => a.platform),
          scheduled_for: input.scheduledFor ?? null,
          publish_now:   input.publishNow ?? false,
          source_id:     input.sourceId ?? null,
          timestamp:     iso(),
        }),
      })
      return {
        ok:       res.ok,
        platforms: (accounts as any[]).map(a => a.platform),
        status:   res.ok ? 'sent_to_n8n' : 'n8n_error',
        error:    res.ok ? undefined : `n8n returned ${res.status}`,
      }
    } catch (e) {
      return { ok: false, platforms: [], status: 'n8n_error', error: String(e) }
    }
  }

  // ── Convenience: cross-post from content ────────────────────────────────────

  async crossPostBlog(postId: string, title: string, slug: string, excerpt?: string) {
    const url     = `https://${this.ctx.profile.slug}.businesskit.io/blog/${slug}`
    const content = excerpt ? `${title}\n\n${excerpt}\n\n${url}` : `${title}\n\n${url}`
    return this.post({ content, sourceId: postId, sourceType: 'blog_crosspost' })
  }

  async announceProduct(productId: string, title: string, slug: string, priceCents: number) {
    const url     = `https://${this.ctx.profile.slug}.businesskit.io/store/${slug}`
    const price   = `$${(priceCents / 100).toFixed(2)}`
    const content = `New: ${title} — ${price}\n\n${url}`
    return this.post({ content, sourceId: productId, sourceType: 'product_launch' })
  }

  // ── Queue management ────────────────────────────────────────────────────────

  async listQueueSlots(accountId?: string) {
    await this.init()
    let sql  = 'SELECT * FROM social_queue WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (accountId) { sql += ' AND account_id=?'; args.push(accountId) }
    sql += ' ORDER BY day_of_week ASC, time_of_day ASC'
    const { rows } = await db.execute({ sql, args })
    return rows
  }

  // ── Analytics summary ───────────────────────────────────────────────────────

  async socialSummary() {
    await this.init()
    const accounts = await this.listAccounts()
    const { rows: [counts] } = await db.execute({
      sql: `SELECT
            COUNT(*) total,
            SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published,
            SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) scheduled,
            SUM(CASE WHEN status='draft'     THEN 1 ELSE 0 END) drafts
            FROM social_posts WHERE profile_id=? AND hidden=0`,
      args: [this.profileId],
    })
    return { accounts: accounts.length, posts: counts }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async resolveZernioKey(): Promise<string | null> {
    try {
      const { rows: [r] } = await db.execute({
        sql: `SELECT client_id FROM connections
              WHERE profile_id=? AND service='zernio' AND is_active=1 AND client_id IS NOT NULL
              LIMIT 1`,
        args: [this.profileId],
      })
      return (r?.client_id as string) ?? null
    } catch {
      return null
    }
  }

  private async logProgress(ok: boolean, preview: string, platforms: string[]) {
    try {
      const { appendFileSync } = await import('fs')
      const ts   = new Date().toISOString().slice(0, 16).replace('T', ' ')
      const line = ok
        ? `- ${ts}: Posted "${preview}..." to ${platforms.join(', ')}\n`
        : `- ${ts}: Failed to post "${preview}..." to ${platforms.join(', ')}\n`
      appendFileSync('./progress.md', line, 'utf8')
    } catch { /* progress.md is optional */ }
  }
}

export const socialAgent = new SocialAgent()