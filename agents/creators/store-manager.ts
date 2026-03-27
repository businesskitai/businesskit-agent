/**
 * LEO — Store Manager
 * "Every product type lives here. Digital commerce is my domain."
 *
 * Handles: digital downloads, courses (SAGE delegates here), 1:1 meetings,
 *          webinars, events, listings, sponsorships, services
 * Writes to: products table
 */

import { BaseAgent, db, ulid, now } from '../_base.ts'
import { uniqueSlug }               from '../../lib/slug.ts'

export type ProductType =
  | 'download' | 'course' | 'meeting' | 'webinar'
  | 'event' | 'listing' | 'sponsorship' | 'service'

export interface ProductInput {
  type: ProductType
  title: string
  description?: string
  excerpt?: string
  price_cents: number
  sale_price_cents?: number
  currency?: string
  thumbnail_url?: string
  // type-specific
  file_url?: string           // download
  calendar_link?: string      // meeting
  scheduling_provider?: string
  webinar_link?: string       // webinar
  webinar_platform?: string
  webinar_schedule?: string   // JSON schedule
  webinar_settings?: string
  event_settings?: string     // event
  meeting_settings?: string
  billing_interval?: string   // sponsorship: 'month'|'year'|'once'
  features?: string[]
  tags?: string[]
  button_text?: string
  platform_name?: string      // listing
  platform_url?: string
  post_frequency?: string
  cta_button?: Record<string, string>
  publish?: boolean
}

export class StoreManager extends BaseAgent {
  readonly name  = 'LEO'
  readonly title = 'Store Manager'

  async create(input: ProductInput) {
    await this.init()
    const id   = ulid()
    const slug = await uniqueSlug('products', input.title) // global unique
    const ts   = now()

    await db.execute({
      sql: `INSERT INTO products
            (id,profile_id,user_id,type,title,excerpt,description,
             price_cents,sale_price_cents,currency,slug,thumbnail_url,
             file_url,calendar_link,scheduling_provider,
             webinar_link,webinar_platform,webinar_schedule,webinar_settings,
             event_settings,meeting_settings,billing_interval,
             features,tags,button_text,platform_name,platform_url,post_frequency,
             cta_button,is_active,published,hidden,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,0,?,?)`,
      args: [
        id, this.profileId, this.userId,
        input.type, input.title, input.excerpt ?? null, input.description ?? null,
        input.price_cents, input.sale_price_cents ?? null, input.currency ?? 'usd',
        slug, input.thumbnail_url ?? null,
        input.file_url ?? null, input.calendar_link ?? null, input.scheduling_provider ?? null,
        input.webinar_link ?? null, input.webinar_platform ?? null,
        input.webinar_schedule ?? null, input.webinar_settings ?? null,
        input.event_settings ?? null, input.meeting_settings ?? null,
        input.billing_interval ?? null,
        input.features ? JSON.stringify(input.features) : null,
        input.tags     ? JSON.stringify(input.tags)     : null,
        input.button_text ?? null,
        input.platform_name ?? null, input.platform_url ?? null, input.post_frequency ?? null,
        input.cta_button ? JSON.stringify(input.cta_button) : '{}',
        input.publish ? 1 : 0, ts, ts,
      ],
    })

    // Seed analytics row
    await db.execute({
      sql: `INSERT OR IGNORE INTO product_analytics (id,product_id,profile_id,created_at,updated_at)
            VALUES (?,?,?,?,?)`,
      args: [id, id, this.profileId, ts, ts],
    })

    return this.get(id)
  }

  async get(id: string) {
    const { rows: [r] } = await db.execute({ sql: 'SELECT * FROM products WHERE id=?', args: [id] })
    if (!r) throw new Error(`Product not found: ${id}`)
    return r
  }

  async list(opts: { type?: ProductType; published?: boolean; limit?: number } = {}) {
    await this.init()
    const args: unknown[] = [this.profileId]
    let where = 'WHERE profile_id=? AND hidden=0'
    if (opts.type)      { where += ' AND type=?';      args.push(opts.type) }
    if (opts.published !== undefined) { where += ' AND published=?'; args.push(opts.published ? 1 : 0) }
    const { rows } = await db.execute({
      sql: `SELECT id,type,title,slug,price_cents,published FROM products
            ${where} ORDER BY created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 50],
    })
    return rows
  }

  async publish(id: string) {
    const ts = now()
    await db.execute({
      sql: 'UPDATE products SET published=1,published_at=?,updated_at=? WHERE id=?',
      args: [ts, ts, id],
    })
    return this.get(id)
  }

  async archive(id: string)  { await super.archive('products', id) }

  async storeOverview() {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT type, COUNT(*) n, SUM(CASE WHEN published=1 THEN 1 ELSE 0 END) live
            FROM products WHERE profile_id=? AND hidden=0 GROUP BY type ORDER BY n DESC`,
      args: [this.profileId],
    })
    return rows
  }
}

export const storeManager = new StoreManager()
