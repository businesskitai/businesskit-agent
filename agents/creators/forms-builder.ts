/**
 * FELIX — Forms Builder
 * "I turn questions into insights."
 * Writes to: forms, questions. Reads: submissions, form_analytics
 */

import { BaseAgent, db, ulid, iso } from '../_base.ts'
import { uniqueSlug }               from '../../lib/slug.ts'

export type QuestionType = 'text'|'email'|'select'|'multiselect'|'rating'|'date'|'file'|'url'|'embed'

export interface Question {
  type: QuestionType; title: string; description?: string
  required?: boolean; options?: string[]; embed_url?: string
  settings?: Record<string, unknown>
}

export interface FormInput {
  title: string; questions: Question[]
  thank_you?: { title?: string; message?: string; redirect_url?: string }
  publish?: boolean
}

export class FormsBuilder extends BaseAgent {
  readonly name  = 'FELIX'
  readonly title = 'Forms Builder'

  async create(input: FormInput) {
    await this.init()
    const id   = ulid()
    const slug = await uniqueSlug('forms', input.title, this.profileId)
    const ts   = iso()

    await db.execute({
      sql: 'INSERT INTO forms (id,profile_id,title,slug,published,hidden,thank_you_settings,created_at) VALUES (?,?,?,?,?,0,?,?)',
      args: [id, this.profileId, input.title, slug, input.publish ? 1 : 0,
             input.thank_you ? JSON.stringify(input.thank_you) : null, ts],
    })

    if (input.questions.length) {
      await db.batch(input.questions.map((q, i) => ({
        sql: `INSERT INTO questions (id,form_id,type,title,description,position,options,embed_url,required,settings)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [
          ulid(), id, q.type, q.title, q.description ?? null, i,
          q.options ? JSON.stringify(q.options) : null,
          q.embed_url ?? null, q.required ? 1 : 0,
          q.settings ? JSON.stringify(q.settings) : null,
        ],
      })))
    }

    // Seed analytics
    await db.execute({ sql: 'INSERT OR IGNORE INTO form_analytics (form_id,updated_at) VALUES (?,?)', args: [id, ts] })
    return this.get(id)
  }

  async get(id: string) {
    const [{ rows: [form] }, { rows: questions }] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM forms WHERE id=?', args: [id] }),
      db.execute({ sql: 'SELECT * FROM questions WHERE form_id=? ORDER BY position', args: [id] }),
    ])
    if (!form) throw new Error(`Form not found: ${id}`)
    return { ...form, questions }
  }

  async list() {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT f.id,f.title,f.slug,f.published,fa.views,fa.submissions
            FROM forms f LEFT JOIN form_analytics fa ON fa.form_id=f.id
            WHERE f.profile_id=? AND f.hidden=0 ORDER BY f.created_at DESC`,
      args: [this.profileId],
    })
    return rows
  }

  async submissions(formId: string, limit = 50) {
    const { rows } = await db.execute({
      sql: 'SELECT * FROM submissions WHERE form_id=? ORDER BY created_at DESC LIMIT ?',
      args: [formId, limit],
    })
    return rows
  }

  async publish(id: string)  { await super.publish('forms', id); return this.get(id) }
  async archive(id: string)  { await super.archive('forms', id) }
}

export const formsBuilder = new FormsBuilder()
