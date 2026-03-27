/**
 * COPY — Copywriter
 * "Words that convert. Nothing more, nothing less."
 * Writes to: pages, product descriptions, link descriptions, profile bio/tagline
 */

import { BaseAgent, db, ulid, now, iso } from '../_base.ts'
import { uniqueSlug }                    from '../../lib/slug.ts'

export interface PageInput {
  title: string; slug?: string; excerpt?: string; text_field?: string
  hero_section?: Record<string, unknown>; cta_section?: Record<string, unknown>
  testimonials?: unknown[]; faq?: unknown[]; pricing?: unknown[]
  intro_section?: Record<string, unknown>; about_section?: Record<string, unknown>
  publish?: boolean
}

export class Copywriter extends BaseAgent {
  readonly name  = 'COPY'
  readonly title = 'Copywriter'

  async createPage(input: PageInput) {
    await this.init()
    const id   = ulid()
    const slug = input.slug ?? await uniqueSlug('pages', input.title, this.profileId)
    const ts   = now()

    await db.execute({
      sql: `INSERT INTO pages (id,profile_id,user_id,title,slug,excerpt,text_field,
            hero_section,cta_section,testimonials,faq,pricing,intro_section,about_section,
            published,hidden,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      args: [
        id, this.profileId, this.userId, input.title, slug,
        input.excerpt ?? null, input.text_field ?? null,
        input.hero_section    ? JSON.stringify(input.hero_section)    : null,
        input.cta_section     ? JSON.stringify(input.cta_section)     : null,
        input.testimonials    ? JSON.stringify(input.testimonials)    : null,
        input.faq             ? JSON.stringify(input.faq)             : null,
        input.pricing         ? JSON.stringify(input.pricing)         : null,
        input.intro_section   ? JSON.stringify(input.intro_section)   : null,
        input.about_section   ? JSON.stringify(input.about_section)   : null,
        input.publish ? 1 : 0, ts, ts,
      ],
    })
    return this.getPage(id)
  }

  async getPage(id: string) {
    const { rows: [r] } = await db.execute({ sql: 'SELECT * FROM pages WHERE id=?', args: [id] })
    if (!r) throw new Error(`Page not found: ${id}`)
    return r
  }

  async listPages() {
    await this.init()
    const { rows } = await db.execute({
      sql: 'SELECT id,title,slug,published,is_active FROM pages WHERE profile_id=? AND hidden=0 ORDER BY order_index',
      args: [this.profileId],
    })
    return rows
  }

  /** Update profile bio and tagline */
  async updateProfileCopy(fields: { bio?: string; tagline?: string; title?: string }) {
    await this.init()
    const sets = [`updated_at=${now()}`]
    const args: unknown[] = []
    if (fields.bio     !== undefined) { sets.push('bio=?');     args.push(fields.bio) }
    if (fields.tagline !== undefined) { sets.push('tagline=?'); args.push(fields.tagline) }
    if (fields.title   !== undefined) { sets.push('title=?');   args.push(fields.title) }
    await db.execute({ sql: `UPDATE profiles SET ${sets.join(',')} WHERE id=?`, args: [...args, this.profileId] })
  }

  /** Update a product's description and excerpt */
  async updateProductCopy(productId: string, fields: { description?: string; excerpt?: string; button_text?: string }) {
    const sets = [`updated_at=${now()}`]
    const args: unknown[] = []
    if (fields.description  !== undefined) { sets.push('description=?');  args.push(fields.description) }
    if (fields.excerpt      !== undefined) { sets.push('excerpt=?');      args.push(fields.excerpt) }
    if (fields.button_text  !== undefined) { sets.push('button_text=?');  args.push(fields.button_text) }
    await db.execute({ sql: `UPDATE products SET ${sets.join(',')} WHERE id=?`, args: [...args, productId] })
  }

  async publishPage(id: string)  { await super.publish('pages', id); return this.getPage(id) }
  async archivePage(id: string)  { await super.archive('pages', id) }
}

export const copywriter = new Copywriter()
