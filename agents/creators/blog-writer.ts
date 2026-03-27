/**
 * BLAKE — Blog Writer
 * "Give me a topic. I'll give you readers."
 * Writes to: posts table
 */

import { BaseAgent, db, ulid, iso } from '../_base.ts'
import { uniqueSlug }               from '../../lib/slug.ts'

export interface PostInput {
  title: string
  content: string        // full HTML or markdown
  excerpt?: string
  hero_image_url?: string
  cta_button_url?: string
  cta_button_text?: string
  date?: string          // ISO — set for scheduled publish
  publish?: boolean
}

export class BlogWriter extends BaseAgent {
  readonly name  = 'BLAKE'
  readonly title = 'Blog Writer'

  async create(input: PostInput) {
    await this.init()
    const id   = ulid()
    const slug = await uniqueSlug('posts', input.title, this.profileId)
    const ts   = iso()

    await db.execute({
      sql: `INSERT INTO posts (id,profile_id,user_id,slug,title,content,excerpt,
            hero_image_url,cta_button_url,cta_button_text,published,hidden,date,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
      args: [
        id, this.profileId, this.userId, slug,
        input.title, input.content, input.excerpt ?? null,
        input.hero_image_url ?? null, input.cta_button_url ?? null, input.cta_button_text ?? null,
        input.publish ? 1 : 0, input.date ?? ts, ts, ts,
      ],
    })
    return this.get(id)
  }

  async get(id: string) {
    const { rows: [r] } = await db.execute({ sql: 'SELECT * FROM posts WHERE id=?', args: [id] })
    if (!r) throw new Error(`Post not found: ${id}`)
    return r
  }

  async list(opts: { published?: boolean; limit?: number } = {}) {
    await this.init()
    const args: unknown[] = [this.profileId]
    let where = 'WHERE profile_id=? AND hidden=0'
    if (opts.published !== undefined) { where += ' AND published=?'; args.push(opts.published ? 1 : 0) }
    const { rows } = await db.execute({
      sql: `SELECT id,title,slug,published,date FROM posts ${where} ORDER BY created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 20],
    })
    return rows
  }

  async update(id: string, fields: Partial<PostInput>) {
    const sets: string[] = [`updated_at='${iso()}'`]
    const args: unknown[] = []
    if (fields.title !== undefined)          { sets.push('title=?');           args.push(fields.title) }
    if (fields.content !== undefined)        { sets.push('content=?');          args.push(fields.content) }
    if (fields.excerpt !== undefined)        { sets.push('excerpt=?');          args.push(fields.excerpt) }
    if (fields.hero_image_url !== undefined) { sets.push('hero_image_url=?');  args.push(fields.hero_image_url) }
    if (fields.date !== undefined)           { sets.push('date=?');             args.push(fields.date) }
    if (fields.publish !== undefined)        { sets.push('published=?');        args.push(fields.publish ? 1 : 0) }
    await db.execute({ sql: `UPDATE posts SET ${sets.join(',')} WHERE id=?`, args: [...args, id] })
    return this.get(id)
  }

  async publish(id: string)  { return this.update(id, { publish: true }) }
  async archive(id: string)  { await super.archive('posts', id) }
  async summary()            { await this.init(); return this.count('posts') }
}

export const blogWriter = new BlogWriter()
