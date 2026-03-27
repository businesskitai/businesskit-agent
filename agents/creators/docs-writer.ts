/**
 * DOC — Docs Writer
 * "I make complex things simple. In writing."
 * Writes to: doc_collections (AUTOINCREMENT), doc_articles (AUTOINCREMENT)
 */

import { BaseAgent, db, iso } from '../_base.ts'
import { toSlug }              from '../../lib/slug.ts'

export class DocsWriter extends BaseAgent {
  readonly name  = 'DOC'
  readonly title = 'Docs Writer'

  async createCollection(input: { slug: string; title: string; description?: string; icon?: string; sort_order?: number }) {
    const { lastInsertRowid } = await db.execute({
      sql: 'INSERT INTO doc_collections (slug,title,description,icon,sort_order,is_default,created_at) VALUES (?,?,?,?,?,0,?)',
      args: [input.slug, input.title, input.description ?? null, input.icon ?? null, input.sort_order ?? 0, iso()],
    })
    return Number(lastInsertRowid)
  }

  async listCollections() {
    const { rows } = await db.execute({ sql: 'SELECT * FROM doc_collections ORDER BY sort_order', args: [] })
    return rows
  }

  async createArticle(input: {
    collection_id: number; title: string; body: string
    excerpt?: string; slug?: string; publish?: boolean
  }) {
    await this.init()
    const slug = input.slug ?? toSlug(input.title)
    const ts   = iso()

    const { lastInsertRowid } = await db.execute({
      sql: `INSERT INTO doc_articles (collection_id,profile_id,user_id,slug,title,excerpt,body,published,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [input.collection_id, this.profileId, this.userId, slug, input.title,
             input.excerpt ?? null, input.body, input.publish ? 1 : 0, ts, ts],
    })
    return this.getArticle(Number(lastInsertRowid))
  }

  async getArticle(id: number) {
    const { rows: [r] } = await db.execute({ sql: 'SELECT * FROM doc_articles WHERE id=?', args: [id] })
    if (!r) throw new Error(`Article not found: ${id}`)
    return r
  }

  async listArticles(collectionId?: number, published?: boolean) {
    await this.init()
    let where = 'WHERE profile_id=?'
    const args: unknown[] = [this.profileId]
    if (collectionId !== undefined) { where += ' AND collection_id=?'; args.push(collectionId) }
    if (published !== undefined)    { where += ' AND published=?';     args.push(published ? 1 : 0) }
    const { rows } = await db.execute({
      sql: `SELECT id,collection_id,title,slug,published,views FROM doc_articles ${where} ORDER BY updated_at DESC`,
      args,
    })
    return rows
  }

  async updateArticle(id: number, fields: { title?: string; body?: string; excerpt?: string; publish?: boolean }) {
    const sets = [`updated_at='${iso()}'`]
    const args: unknown[] = []
    if (fields.title   !== undefined) { sets.push('title=?');     args.push(fields.title) }
    if (fields.body    !== undefined) { sets.push('body=?');      args.push(fields.body) }
    if (fields.excerpt !== undefined) { sets.push('excerpt=?');   args.push(fields.excerpt) }
    if (fields.publish !== undefined) { sets.push('published=?'); args.push(fields.publish ? 1 : 0) }
    await db.execute({ sql: `UPDATE doc_articles SET ${sets.join(',')} WHERE id=?`, args: [...args, id] })
    return this.getArticle(id)
  }

  async publishArticle(id: number) { return this.updateArticle(id, { publish: true }) }
}

export const docsWriter = new DocsWriter()
