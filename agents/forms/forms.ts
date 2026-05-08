/**
 * Forms Agent — build forms, read submissions.
 *
 * DB contract (businesskit-files/forms.ts):
 *   - forms:        id, profile_id, title, slug, published, hidden,
 *                   thank_you_settings JSON, collection_id
 *   - questions:    id, form_id, type, title, description, position,
 *                   options JSON, embed_url, required, settings JSON
 *   - submissions:  append-only (trg_submissions_no_delete blocks DELETE);
 *                   has answers JSON, status ('viewed' default), UTM fields,
 *                   device/os/browser, timing (started/submitted/duration_ms)
 *   - form_analytics: auto-seeded by trg_form_insert, trigger-maintained
 *
 * Triggers fire on our writes:
 *   - trg_form_insert → INSERT OR IGNORE form_analytics + bump cms_analytics (cat_34)
 *   - trg_form_update_published → flips cms_analytics draft/published
 *   - trg_form_delete → decrements cms_analytics; we soft-delete instead
 *   - trg_submission_insert → +1 form_analytics.submissions + cms_analytics.total_submissions
 *   - trg_submissions_no_delete → BEFORE DELETE raises ABORT
 *
 * The Forms cms row (cat_34) must exist for cms_analytics updates to land.
 */

import { BaseAgent, db, ulid, iso } from '../_base.ts'
import { uniqueSlug }               from '../../lib/slug.ts'
import { ensureCmsRow, CATEGORY }   from '../../lib/cms.ts'

export type QuestionType =
  | 'text' | 'textarea' | 'email' | 'select' | 'multiselect'
  | 'rating' | 'date' | 'file' | 'url' | 'embed' | 'number' | 'boolean'

export type SubmissionStatus = 'viewed' | 'started' | 'partial' | 'submitted'

export interface Question {
  type: QuestionType
  title: string
  description?: string
  required?: boolean
  options?: string[]
  embed_url?: string
  settings?: Record<string, unknown>
}

export interface ThankYou {
  title?: string
  message?: string
  redirect_url?: string
}

export interface FormInput {
  title: string
  questions: Question[]
  thank_you?: ThankYou
  collection_id?: string
  publish?: boolean
}

export interface FormPatch {
  title?: string
  thank_you?: ThankYou
  collection_id?: string
}

export class FormsBuilder extends BaseAgent {
  readonly name  = 'Forms'
  readonly title = 'Forms Builder'

  // ── Forms ─────────────────────────────────────────────────────────────────

  async create(input: FormInput) {
    await this.init()
    // Seed the Forms cms row so trg_form_insert's cms_analytics UPDATE lands.
    await ensureCmsRow(this.profileId, CATEGORY.FORMS, { slug: 'forms', title: 'Forms' })

    const id   = ulid()
    const slug = await uniqueSlug('forms', input.title, this.profileId)
    const ts   = iso()

    // form_analytics is seeded by trg_form_insert — no manual INSERT needed.
    const stmts: Array<{ sql: string; args: unknown[] }> = [{
      sql: `INSERT INTO forms
             (id, profile_id, title, slug, published, hidden,
              thank_you_settings, collection_id, created_at)
             VALUES (?,?,?,?,?,0,?,?,?)`,
      args: [
        id, this.profileId, input.title, slug,
        input.publish ? 1 : 0,
        input.thank_you ? JSON.stringify(input.thank_you) : null,
        input.collection_id ?? null, ts,
      ],
    }]

    input.questions.forEach((q, i) => {
      stmts.push({
        sql: `INSERT INTO questions
               (id, form_id, type, title, description, position, options,
                embed_url, required, settings)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [
          ulid(), id, q.type, q.title, q.description ?? null, i,
          q.options ? JSON.stringify(q.options) : null,
          q.embed_url ?? null, q.required ? 1 : 0,
          q.settings ? JSON.stringify(q.settings) : null,
        ],
      })
    })

    await db.batch(stmts)
    await this.logMemory(`${input.publish ? 'Published' : 'Drafted'} form "${input.title}"`,
      { id, slug, questions: input.questions.length })
    return this.get(id)
  }

  async edit(id: string, patch: FormPatch) {
    await this.init()
    const sets: string[] = []
    const args: unknown[] = []
    if (patch.title !== undefined)         { sets.push('title=?');              args.push(patch.title) }
    if (patch.thank_you !== undefined)     { sets.push('thank_you_settings=?'); args.push(JSON.stringify(patch.thank_you)) }
    if (patch.collection_id !== undefined) { sets.push('collection_id=?');      args.push(patch.collection_id) }
    if (!sets.length) return this.get(id)

    await db.write({
      sql: `UPDATE forms SET ${sets.join(',')} WHERE id=? AND profile_id=?`,
      args: [...args, id, this.profileId],
    })
    return this.get(id)
  }

  async get(id: string) {
    await this.init()
    const [{ rows: [form] }, { rows: questions }] = await Promise.all([
      db.execute({
        sql: 'SELECT * FROM forms WHERE id=? AND profile_id=? LIMIT 1',
        args: [id, this.profileId],
      }),
      db.execute({
        sql: `SELECT q.* FROM questions q
              JOIN forms f ON f.id = q.form_id
              WHERE q.form_id=? AND f.profile_id=?
              ORDER BY q.position ASC`,
        args: [id, this.profileId],
      }),
    ])
    if (!form) throw new Error(`Form not found: ${id}`)
    return { ...form, questions }
  }

  async list(opts: { published?: boolean; include_hidden?: boolean } = {}) {
    await this.init()
    let where = 'WHERE f.profile_id=?'
    const args: unknown[] = [this.profileId]
    if (!opts.include_hidden)         where += ' AND f.hidden=0'
    if (opts.published !== undefined) { where += ' AND f.published=?'; args.push(opts.published ? 1 : 0) }

    const { rows } = await db.execute({
      sql: `SELECT f.id, f.title, f.slug, f.published, f.created_at,
                   fa.total_views, fa.submissions, fa.starts, fa.partials,
                   fa.avg_completion_ms
            FROM forms f
            LEFT JOIN form_analytics fa ON fa.form_id = f.id
            ${where}
            ORDER BY f.created_at DESC`,
      args,
    })
    return rows
  }

  async publish(id: string) {
    await super.publish('forms', id)
    return this.get(id)
  }

  async unpublish(id: string) {
    await this.init()
    await db.write({
      sql: `UPDATE forms SET published=0 WHERE id=? AND profile_id=?`,
      args: [id, this.profileId],
    })
    return this.get(id)
  }

  /** Soft archive — never hard DELETE (trg_form_delete would decrement
   *  cms_analytics and also cascade-delete form_analytics). */
  async archive(id: string) {
    await super.archive('forms', id)
  }

  // ── Questions ─────────────────────────────────────────────────────────────

  async addQuestion(formId: string, q: Question): Promise<string> {
    await this.init()
    await this.assertOwned(formId)
    const { rows: [r] } = await db.execute({
      sql: `SELECT COALESCE(MAX(position), -1) + 1 AS next
            FROM questions WHERE form_id=?`,
      args: [formId],
    })
    const id = ulid()
    await db.write({
      sql: `INSERT INTO questions
             (id, form_id, type, title, description, position, options,
              embed_url, required, settings)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, formId, q.type, q.title, q.description ?? null,
        Number(r?.next ?? 0),
        q.options ? JSON.stringify(q.options) : null,
        q.embed_url ?? null, q.required ? 1 : 0,
        q.settings ? JSON.stringify(q.settings) : null,
      ],
    })
    return id
  }

  async updateQuestion(formId: string, questionId: string, patch: Partial<Question>) {
    await this.init()
    await this.assertOwned(formId)
    const sets: string[] = []
    const args: unknown[] = []
    if (patch.type        !== undefined) { sets.push('type=?');        args.push(patch.type) }
    if (patch.title       !== undefined) { sets.push('title=?');       args.push(patch.title) }
    if (patch.description !== undefined) { sets.push('description=?'); args.push(patch.description) }
    if (patch.options     !== undefined) { sets.push('options=?');     args.push(JSON.stringify(patch.options)) }
    if (patch.embed_url   !== undefined) { sets.push('embed_url=?');   args.push(patch.embed_url) }
    if (patch.required    !== undefined) { sets.push('required=?');    args.push(patch.required ? 1 : 0) }
    if (patch.settings    !== undefined) { sets.push('settings=?');    args.push(JSON.stringify(patch.settings)) }
    if (!sets.length) return

    await db.write({
      sql: `UPDATE questions SET ${sets.join(',')}
            WHERE id=? AND form_id=?`,
      args: [...args, questionId, formId],
    })
  }

  async removeQuestion(formId: string, questionId: string) {
    await this.init()
    await this.assertOwned(formId)
    await db.write({
      sql: `DELETE FROM questions WHERE id=? AND form_id=?`,
      args: [questionId, formId],
    })
    // questions has no DELETE guard — safe to remove; just renumber positions.
    await this.renumber(formId)
  }

  /** Reorder questions. Pass the new full order as a list of question ids. */
  async reorderQuestions(formId: string, orderedIds: string[]) {
    await this.init()
    await this.assertOwned(formId)
    const stmts = orderedIds.map((qid, i) => ({
      sql: `UPDATE questions SET position=? WHERE id=? AND form_id=?`,
      args: [i, qid, formId],
    }))
    if (stmts.length) await db.batch(stmts)
  }

  // ── Submissions (READ + status updates only — append-only by DB trigger) ──

  async submissions(formId: string, opts: { status?: SubmissionStatus; limit?: number } = {}) {
    await this.init()
    await this.assertOwned(formId)
    let where = 'WHERE form_id=?'
    const args: unknown[] = [formId]
    if (opts.status) { where += ' AND status=?'; args.push(opts.status) }
    const { rows } = await db.execute({
      sql: `SELECT id, status, answers, city, country, referrer,
                   utm_source, utm_medium, utm_campaign,
                   started_at, submitted_at, duration_ms, created_at
            FROM submissions ${where}
            ORDER BY created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 100],
    })
    return rows
  }

  async getSubmission(formId: string, submissionId: string) {
    await this.init()
    await this.assertOwned(formId)
    const { rows: [r] } = await db.execute({
      sql: `SELECT * FROM submissions WHERE id=? AND form_id=? LIMIT 1`,
      args: [submissionId, formId],
    })
    if (!r) throw new Error(`Submission not found: ${submissionId}`)
    return r
  }

  async updateSubmissionStatus(formId: string, submissionId: string, status: SubmissionStatus) {
    await this.init()
    await this.assertOwned(formId)
    await db.write({
      sql: `UPDATE submissions SET status=? WHERE id=? AND form_id=?`,
      args: [status, submissionId, formId],
    })
  }

  /** Submissions inbox across every form the profile owns. */
  async inbox(opts: { status?: SubmissionStatus; limit?: number } = {}) {
    await this.init()
    let where = 'WHERE f.profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.status) { where += ' AND s.status=?'; args.push(opts.status) }
    const { rows } = await db.execute({
      sql: `SELECT s.id, s.form_id, s.status, s.city, s.country,
                   s.submitted_at, s.created_at,
                   f.title AS form_title, f.slug AS form_slug
            FROM submissions s
            JOIN forms f ON f.id = s.form_id
            ${where}
            ORDER BY s.created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 50],
    })
    return rows
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  /** Free inventory via cms_analytics (trigger-maintained, cat_34 = Forms). */
  async summary() {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT a.total_posts, a.total_published, a.total_draft,
                   a.total_submissions, a.total_views
            FROM cms c
            LEFT JOIN cms_analytics a ON a.cms_id = c.id
            WHERE c.profile_id=? AND c.category_id=?`,
      args: [this.profileId, CATEGORY.FORMS],
    })
    return {
      total:       Number(r?.total_posts       ?? 0),
      live:        Number(r?.total_published   ?? 0),
      drafts:      Number(r?.total_draft       ?? 0),
      submissions: Number(r?.total_submissions ?? 0),
      views:       Number(r?.total_views       ?? 0),
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Assert the form belongs to this profile — guards question + submission ops
   *  since those tables have no profile_id column of their own. */
  private async assertOwned(formId: string): Promise<void> {
    const { rows: [r] } = await db.execute({
      sql: `SELECT id FROM forms WHERE id=? AND profile_id=? LIMIT 1`,
      args: [formId, this.profileId],
    })
    if (!r) throw new Error(`Form not found (or not yours): ${formId}`)
  }

  private async renumber(formId: string): Promise<void> {
    const { rows } = await db.execute({
      sql: `SELECT id FROM questions WHERE form_id=? ORDER BY position ASC`,
      args: [formId],
    })
    const stmts = rows.map((r, i) => ({
      sql: `UPDATE questions SET position=? WHERE id=? AND form_id=?`,
      args: [i, r.id, formId],
    }))
    if (stmts.length) await db.batch(stmts)
  }
}

export const formsBuilder = new FormsBuilder()
