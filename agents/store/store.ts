/**
 * Store Agent — digital commerce. Every product type lives here.
 *
 * DB contract (businesskit-files/provision.ts):
 *   - products: id, profile_id, user_id, category_id, type, title, slug (GLOBAL
 *               unique), price_cents, currency, published, hidden,
 *               type-specific fields (file_url, calendar_link, webinar_*,
 *               event_settings, billing_interval, platform_*, cta_button),
 *               seo_*, course_access_*, visibility, additional_details,
 *               timestamps as INTEGER unix seconds
 *   - product_analytics: 1 row per product, seeded by trg_product_insert
 *   - purchases: append-only in practice (writes come from payment gateway);
 *                we READ them here (sales, revenue, customers)
 *   - profile_analytics: aggregate counters (total_products, total_sales,
 *                        total_earnings) maintained by triggers
 *   - cms_analytics: per-category counters keyed on cms.category_id
 *
 * Triggers that fire on our writes (product-triggers.ts):
 *   - trg_product_insert            → +1 profile_analytics.total_products,
 *                                     INSERT OR IGNORE product_analytics,
 *                                     bumps cms_analytics for the matching
 *                                     (profile_id, category_id) cms row
 *   - trg_product_update_published  → flips cms_analytics.total_published/draft
 *   - trg_product_delete            → decrements cms_analytics; we soft-delete
 *                                     (hidden=1) instead
 *   - trg_purchase_insert           → product_analytics + profile_analytics
 *                                     sales/revenue (READ side only — don't
 *                                     manufacture purchases)
 *
 * Two things that differ from forms/hiring:
 *   1. products.slug is GLOBALLY unique (no profile scope). uniqueSlug without
 *      a profileId does this.
 *   2. products timestamps are INTEGER unix seconds, not ISO. _base.publish/
 *      archive default to ISO for string ids, so we override both.
 *
 * Product types → cms category mapping is critical. Without a matching cms row
 * (via ensureCmsRow), trg_product_insert's cms_analytics UPDATE finds nothing.
 */

import { BaseAgent, db, ulid, now } from '../_base.ts'
import { uniqueSlug }               from '../../lib/slug.ts'
import { ensureCmsRow, CATEGORY }   from '../../lib/cms.ts'

export type ProductType =
  | 'download' | 'course' | 'meeting' | 'webinar'
  | 'event'    | 'listing' | 'sponsorship' | 'service' | 'booking'

export type Visibility     = 'published' | 'unlisted' | 'private'
export type PurchaseStatus = 'active' | 'refunded' | 'cancelled' | 'expired'

/** product.type → cms.category_id. Seeding this cms row is required for
 *  trg_product_insert's cms_analytics UPDATE to land. */
const TYPE_TO_CATEGORY: Record<ProductType, string> = {
  download:    CATEGORY.DOWNLOADS,
  course:      CATEGORY.COURSES,
  meeting:     CATEGORY.MEETINGS,
  webinar:     CATEGORY.WEBINARS,
  event:       CATEGORY.EVENTS,
  listing:     CATEGORY.LISTING,
  sponsorship: CATEGORY.SPONSORSHIP,
  service:     CATEGORY.SERVICES,
  booking:     CATEGORY.BOOKING,
}

const TYPE_TO_SLUG: Record<ProductType, string> = {
  download:    'downloads',
  course:      'courses',
  meeting:     'meetings',
  webinar:     'webinars',
  event:       'events',
  listing:     'listing',
  sponsorship: 'sponsorship',
  service:     'services',
  booking:     'booking',
}

export interface ProductInput {
  type:                ProductType
  title:               string
  description?:        string
  excerpt?:            string
  price_cents:         number
  sale_price_cents?:   number
  currency?:           string
  thumbnail_url?:      string
  hero_image_url?:     string
  cover_video_url?:    string
  tags?:               string[]
  features?:           string[]
  button_text?:        string
  visibility?:         Visibility
  max_sales?:          number
  cta_button?:         Record<string, unknown>
  additional_details?: unknown[]

  // type-specific (only the ones actually used are inserted)
  file_url?:              string                    // download
  calendar_link?:         string                    // meeting
  scheduling_provider?:   string
  scheduling_metadata?:   Record<string, unknown>
  duration_minutes?:      number
  meeting_settings?:      Record<string, unknown>
  webinar_link?:          string                    // webinar
  webinar_platform?:      string
  webinar_schedule?:      Record<string, unknown>
  webinar_settings?:      Record<string, unknown>
  event_settings?:        Record<string, unknown>   // event
  billing_interval?:      'month' | 'year' | 'once' // sponsorship
  platform_name?:         string                    // sponsorship
  platform_url?:          string                    // sponsorship
  post_frequency?:        string                    // sponsorship
  lessons?:               unknown[]                 // course (array)
  course_access_type?:    string
  course_access_config?:  Record<string, unknown>

  // nav / organisation
  category_id?:    string   // override auto-mapping if caller knows better
  collection_id?:  string
  forms_id?:       string

  // confirmation email overrides (per-product)
  confirmation_email_subject?: string
  confirmation_email_body?:    string

  // SEO
  seo_title?:          string
  seo_description?:    string
  seo_og_image?:       string
  seo_robots?:         string
  seo_block_indexing?: boolean

  publish?: boolean
}

export interface ProductPatch extends Partial<Omit<ProductInput, 'type' | 'publish'>> {
  // type is immutable (would invalidate cms_analytics counters); re-create instead
  // publish is handled via publish()/unpublish() so cms_analytics flips
}

export class StoreManager extends BaseAgent {
  readonly name  = 'Store'
  readonly title = 'Store Manager'

  // ── Products ──────────────────────────────────────────────────────────────

  async create(input: ProductInput) {
    await this.init()

    const categoryId = input.category_id ?? TYPE_TO_CATEGORY[input.type]
    if (!categoryId) throw new Error(`No cms category for product type: ${input.type}`)

    // Seed the cms row for this product type so trg_product_insert's
    // cms_analytics UPDATE has a row to hit.
    await ensureCmsRow(this.profileId, categoryId, {
      slug:  TYPE_TO_SLUG[input.type] ?? input.type,
      title: TYPE_TO_SLUG[input.type] ?? input.type,
    })

    const id   = ulid()
    const slug = await uniqueSlug('products', input.title) // GLOBAL unique
    const ts   = now()

    if (input.price_cents < 0)                               throw new Error('price_cents must be ≥ 0')
    if (input.sale_price_cents !== undefined &&
        input.sale_price_cents < 0)                          throw new Error('sale_price_cents must be ≥ 0')
    if (input.sale_price_cents !== undefined &&
        input.sale_price_cents > input.price_cents)          throw new Error('sale_price_cents must be ≤ price_cents')

    await db.write({
      sql: `INSERT INTO products (
              id, profile_id, user_id, type, category_id, title, slug,
              excerpt, description,
              price_cents, sale_price_cents, currency,
              thumbnail_url, hero_image_url, cover_video_url,
              tags, features, button_text, visibility, max_sales,
              cta_button, additional_details,
              file_url,
              calendar_link, scheduling_provider, scheduling_metadata,
              duration_minutes, meeting_settings,
              webinar_link, webinar_platform, webinar_schedule, webinar_settings,
              event_settings, billing_interval,
              platform_name, platform_url, post_frequency,
              lessons, course_access_type, course_access_config,
              collection_id, forms_id,
              confirmation_email_subject, confirmation_email_body,
              seo_title, seo_description, seo_og_image, seo_robots, seo_block_indexing,
              is_active, published, hidden,
              created_at, updated_at, published_at
            ) VALUES (
              ?,?,?,?,?,?,?,
              ?,?,
              ?,?,?,
              ?,?,?,
              ?,?,?,?,?,
              ?,?,
              ?,
              ?,?,?,
              ?,?,
              ?,?,?,?,
              ?,?,
              ?,?,?,
              ?,?,?,
              ?,?,
              ?,?,
              ?,?,?,?,?,
              1,?,0,
              ?,?,?
            )`,
      args: [
        id, this.profileId, this.userId, input.type, categoryId, input.title, slug,
        input.excerpt ?? null, input.description ?? null,
        Math.round(input.price_cents),
        input.sale_price_cents !== undefined ? Math.round(input.sale_price_cents) : null,
        input.currency ?? 'usd',
        input.thumbnail_url ?? null, input.hero_image_url ?? null, input.cover_video_url ?? null,
        input.tags     ? JSON.stringify(input.tags)     : null,
        input.features ? JSON.stringify(input.features) : null,
        input.button_text ?? null, input.visibility ?? 'published',
        input.max_sales ?? null,
        JSON.stringify(input.cta_button ?? {}),
        JSON.stringify(input.additional_details ?? []),
        input.file_url ?? null,
        input.calendar_link ?? null, input.scheduling_provider ?? null,
        input.scheduling_metadata ? JSON.stringify(input.scheduling_metadata) : null,
        input.duration_minutes ?? null,
        input.meeting_settings ? JSON.stringify(input.meeting_settings) : null,
        input.webinar_link ?? null, input.webinar_platform ?? null,
        input.webinar_schedule ? JSON.stringify(input.webinar_schedule) : null,
        input.webinar_settings ? JSON.stringify(input.webinar_settings) : null,
        input.event_settings ? JSON.stringify(input.event_settings) : null,
        input.billing_interval ?? null,
        input.platform_name ?? null, input.platform_url ?? null, input.post_frequency ?? null,
        input.lessons ? JSON.stringify(input.lessons) : null,
        input.course_access_type ?? 'open',
        JSON.stringify(input.course_access_config ?? {}),
        input.collection_id ?? null, input.forms_id ?? null,
        input.confirmation_email_subject ?? null, input.confirmation_email_body ?? null,
        input.seo_title ?? null, input.seo_description ?? null, input.seo_og_image ?? null,
        input.seo_robots ?? null, input.seo_block_indexing ? 1 : 0,
        input.publish ? 1 : 0,
        ts, ts, input.publish ? ts : null,
      ],
    })

    await this.logMemory(
      `${input.publish ? 'Published' : 'Drafted'} ${input.type} "${input.title}"`,
      { id, slug, type: input.type, price_cents: input.price_cents },
    )

    return this.get(id)
  }

  async edit(id: string, patch: ProductPatch) {
    await this.init()
    const sets: string[] = ['updated_at=?']
    const args: unknown[] = [now()]

    // Plain scalar columns — iterate to keep the giant switch short
    const scalar: Array<[keyof ProductPatch, string]> = [
      ['title',                      'title'],
      ['description',                'description'],
      ['excerpt',                    'excerpt'],
      ['price_cents',                'price_cents'],
      ['sale_price_cents',           'sale_price_cents'],
      ['currency',                   'currency'],
      ['thumbnail_url',              'thumbnail_url'],
      ['hero_image_url',             'hero_image_url'],
      ['cover_video_url',            'cover_video_url'],
      ['button_text',                'button_text'],
      ['visibility',                 'visibility'],
      ['max_sales',                  'max_sales'],
      ['file_url',                   'file_url'],
      ['calendar_link',              'calendar_link'],
      ['scheduling_provider',        'scheduling_provider'],
      ['duration_minutes',           'duration_minutes'],
      ['webinar_link',               'webinar_link'],
      ['webinar_platform',           'webinar_platform'],
      ['billing_interval',           'billing_interval'],
      ['platform_name',              'platform_name'],
      ['platform_url',               'platform_url'],
      ['post_frequency',             'post_frequency'],
      ['course_access_type',         'course_access_type'],
      ['collection_id',              'collection_id'],
      ['forms_id',                   'forms_id'],
      ['confirmation_email_subject', 'confirmation_email_subject'],
      ['confirmation_email_body',    'confirmation_email_body'],
      ['seo_title',                  'seo_title'],
      ['seo_description',            'seo_description'],
      ['seo_og_image',               'seo_og_image'],
      ['seo_robots',                 'seo_robots'],
    ]
    for (const [k, col] of scalar) {
      if (patch[k] !== undefined) { sets.push(`${col}=?`); args.push(patch[k] as never) }
    }

    // JSON columns
    const json: Array<[keyof ProductPatch, string]> = [
      ['tags',                 'tags'],
      ['features',             'features'],
      ['cta_button',           'cta_button'],
      ['additional_details',   'additional_details'],
      ['scheduling_metadata',  'scheduling_metadata'],
      ['meeting_settings',     'meeting_settings'],
      ['webinar_schedule',     'webinar_schedule'],
      ['webinar_settings',     'webinar_settings'],
      ['event_settings',       'event_settings'],
      ['lessons',              'lessons'],
      ['course_access_config', 'course_access_config'],
    ]
    for (const [k, col] of json) {
      if (patch[k] !== undefined) { sets.push(`${col}=?`); args.push(JSON.stringify(patch[k])) }
    }

    // Booleans
    if (patch.seo_block_indexing !== undefined) {
      sets.push('seo_block_indexing=?')
      args.push(patch.seo_block_indexing ? 1 : 0)
    }

    if (sets.length === 1) return this.get(id)

    await db.write({
      sql: `UPDATE products SET ${sets.join(',')} WHERE id=? AND profile_id=?`,
      args: [...args, id, this.profileId],
    })
    return this.get(id)
  }

  async get(id: string) {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT * FROM products WHERE id=? AND profile_id=? LIMIT 1`,
      args: [id, this.profileId],
    })
    if (!r) throw new Error(`Product not found: ${id}`)
    return r
  }

  async list(opts: {
    type?:           ProductType
    published?:      boolean
    include_hidden?: boolean
    limit?:          number
  } = {}) {
    await this.init()
    let where = 'WHERE p.profile_id=?'
    const args: unknown[] = [this.profileId]
    if (!opts.include_hidden)         where += ' AND p.hidden=0'
    if (opts.type)                  { where += ' AND p.type=?';      args.push(opts.type) }
    if (opts.published !== undefined){ where += ' AND p.published=?'; args.push(opts.published ? 1 : 0) }

    const { rows } = await db.execute({
      sql: `SELECT p.id, p.type, p.title, p.slug, p.price_cents, p.sale_price_cents,
                   p.currency, p.published, p.visibility, p.created_at,
                   pa.total_sales, pa.total_revenue_cents, pa.total_views
            FROM products p
            LEFT JOIN product_analytics pa ON pa.product_id = p.id
            ${where}
            ORDER BY p.created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 50],
    })
    return rows
  }

  // products timestamps are INTEGER unix seconds; override _base.publish/archive
  // which default to ISO for string ids.
  async publish(id: string) {
    await this.init()
    const ts = now()
    await db.write({
      sql: `UPDATE products SET published=1, published_at=?, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [ts, ts, id, this.profileId],
    })
    return this.get(id)
  }

  async unpublish(id: string) {
    await this.init()
    await db.write({
      sql: `UPDATE products SET published=0, updated_at=? WHERE id=? AND profile_id=?`,
      args: [now(), id, this.profileId],
    })
    return this.get(id)
  }

  /** Soft archive (hidden=1). Never hard delete — trg_product_delete would
   *  decrement cms_analytics and drop product_analytics history. */
  async archive(id: string) {
    await this.init()
    const ts = now()
    await db.write({
      sql: `UPDATE products SET hidden=1, archived_at=?, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [ts, ts, id, this.profileId],
    })
  }

  // ── Purchases (READ only — written by payment gateway / webhooks) ─────────

  async purchases(opts: {
    product_id?:     string
    status?:         PurchaseStatus
    payment_status?: string
    since_ts?:       number
    limit?:          number
  } = {}) {
    await this.init()
    let where = 'WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.product_id)     { where += ' AND product_id=?';     args.push(opts.product_id) }
    if (opts.status)         { where += ' AND status=?';         args.push(opts.status) }
    if (opts.payment_status) { where += ' AND payment_status=?'; args.push(opts.payment_status) }
    if (opts.since_ts)       { where += ' AND created_at>=?';    args.push(opts.since_ts) }

    const { rows } = await db.execute({
      sql: `SELECT id, product_id, email, customer_name, amount_cents, currency,
                   payment_status, status, rating_star, created_at,
                   utm_source, utm_medium, utm_campaign, country, city
            FROM purchases ${where}
            ORDER BY created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 100],
    })
    return rows
  }

  async getPurchase(id: string) {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT * FROM purchases WHERE id=? AND profile_id=? LIMIT 1`,
      args: [id, this.profileId],
    })
    if (!r) throw new Error(`Purchase not found: ${id}`)
    return r
  }

  // ── Summaries ─────────────────────────────────────────────────────────────

  /** Inventory grouped by product type (live vs drafts). */
  async storeOverview() {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT type,
                   COUNT(*) AS total,
                   SUM(CASE WHEN published=1 AND hidden=0 THEN 1 ELSE 0 END) AS live,
                   SUM(CASE WHEN published=0 AND hidden=0 THEN 1 ELSE 0 END) AS drafts
            FROM products
            WHERE profile_id=?
            GROUP BY type
            ORDER BY total DESC`,
      args: [this.profileId],
    })
    return rows
  }

  /** Top-selling products by total_revenue_cents (trigger-maintained). */
  async topProducts(limit = 10) {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT p.id, p.title, p.type, p.slug,
                   pa.total_sales, pa.total_revenue_cents
            FROM products p
            JOIN product_analytics pa ON pa.product_id = p.id
            WHERE p.profile_id=? AND p.hidden=0
            ORDER BY pa.total_revenue_cents DESC
            LIMIT ?`,
      args: [this.profileId, limit],
    })
    return rows
  }

  /** Revenue rollup for a window (default: last 30 days).
   *  Uses raw purchases with payment_status='completed' AND status='active'
   *  so refunds are excluded. */
  async revenueSummary(windowDays = 30) {
    await this.init()
    const since = now() - windowDays * 86400
    const { rows: [r] } = await db.execute({
      sql: `SELECT COUNT(*) AS sales,
                   COALESCE(SUM(amount_cents), 0) AS revenue_cents,
                   COUNT(DISTINCT email) AS customers
            FROM purchases
            WHERE profile_id=?
              AND payment_status='completed'
              AND status='active'
              AND created_at>=?`,
      args: [this.profileId, since],
    })
    return {
      window_days:   windowDays,
      sales:         Number(r?.sales         ?? 0),
      revenue_cents: Number(r?.revenue_cents ?? 0),
      customers:     Number(r?.customers     ?? 0),
    }
  }

  /** Profile-wide totals from profile_analytics (trigger-maintained). */
  async lifetimeStats() {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT total_products, total_sales, total_earnings, total_views
            FROM profile_analytics WHERE profile_id=? LIMIT 1`,
      args: [this.profileId],
    })
    return {
      total_products: Number(r?.total_products ?? 0),
      total_sales:    Number(r?.total_sales    ?? 0),
      total_earnings: Number(r?.total_earnings ?? 0),
      total_views:    Number(r?.total_views    ?? 0),
    }
  }
}

export const storeManager = new StoreManager()
