/**
 * Hiring Agent — Job listings & applications.
 *
 * DB contract (businesskit-files/jobs.ts):
 *   - job_listings: id, profile_id, user_id, title, company, location,
 *     location_type, employment_type, description, salary_*, slug, published,
 *     hidden, total_applicants (trigger-maintained), expires_at, form_settings
 *   - job_applications: id, job_id, profile_id, resume fields, applicant info,
 *     status ('viewed' default), UTM fields
 *   - job_analytics: 1 row per listing, auto-seeded by trg_job_listing_insert
 *
 * Triggers that fire on our writes:
 *   - trg_job_listing_insert  → seeds job_analytics + bumps cms_analytics (cat_31)
 *   - trg_job_listing_update_published → flips draft/published on cms_analytics
 *   - trg_job_listing_delete  → decrements cms_analytics; we soft-delete instead
 *   - trg_job_application_insert → increments job_analytics.total_applications
 *                                 + job_listings.total_applicants + cms_analytics
 *
 * For the cms_analytics cat_31 updates to land, the Jobs cms row must exist;
 * ensureCmsRow() seeds it on first create().
 *
 * IDs are TEXT ulid(). Timestamps are ISO TEXT.
 */

import { BaseAgent, db, ulid, iso } from '../_base.ts'
import { uniqueSlug }               from '../../lib/slug.ts'
import { ensureCmsRow, CATEGORY }   from '../../lib/cms.ts'

export type LocationType    = 'remote' | 'onsite' | 'hybrid'
export type EmploymentType  = 'full-time' | 'part-time' | 'contract' | 'freelance'
export type ApplicationStatus = 'viewed' | 'shortlisted' | 'interviewing' | 'offered' | 'hired' | 'rejected'

export interface JobInput {
  title: string
  company: string
  location: string
  location_type: LocationType
  employment_type: EmploymentType
  description: string
  excerpt?: string
  requirements?: string
  salary_min?: number
  salary_max?: number
  salary_currency?: string
  image_url?: string
  expires_at?: string
  ai_summary?: string
  additional_details?: string
  form_settings?: Record<string, unknown>
  collection_id?: string
  publish?: boolean
}

export interface JobUpdate {
  title?: string
  company?: string
  location?: string
  location_type?: LocationType
  employment_type?: EmploymentType
  description?: string
  excerpt?: string
  requirements?: string
  salary_min?: number
  salary_max?: number
  salary_currency?: string
  image_url?: string
  expires_at?: string
  ai_summary?: string
  form_settings?: Record<string, unknown>
  collection_id?: string
}

export class JobsManager extends BaseAgent {
  readonly name  = 'Hiring'
  readonly title = 'Hiring Agent'

  // ── Listings ──────────────────────────────────────────────────────────────

  async create(input: JobInput) {
    await this.init()
    // Seed the Jobs cms row so trg_job_listing_insert's cms_analytics UPDATE
    // has a row to hit.
    await ensureCmsRow(this.profileId, CATEGORY.JOBS, { slug: 'jobs', title: 'Jobs' })

    const id   = ulid()
    const slug = await uniqueSlug('job_listings', input.title, this.profileId)
    const ts   = iso()

    // Validate salary bounds early (DB has no CHECK but negative salaries are nonsense).
    const salaryMin = input.salary_min !== undefined ? Math.max(0, Math.round(input.salary_min)) : null
    const salaryMax = input.salary_max !== undefined ? Math.max(0, Math.round(input.salary_max)) : null
    if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) {
      throw new Error(`salary_max (${salaryMax}) must be ≥ salary_min (${salaryMin})`)
    }

    await db.write({
      sql: `INSERT INTO job_listings
            (id, profile_id, user_id, title, company, location, location_type,
             employment_type, description, excerpt, requirements,
             salary_min, salary_max, salary_currency, slug, image_url,
             expires_at, ai_summary, additional_details, collection_id,
             form_settings, published, hidden, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      args: [
        id, this.profileId, this.userId,
        input.title, input.company, input.location, input.location_type,
        input.employment_type, input.description,
        input.excerpt ?? null, input.requirements ?? null,
        salaryMin, salaryMax, input.salary_currency ?? 'USD',
        slug, input.image_url ?? null,
        input.expires_at ?? null, input.ai_summary ?? null,
        input.additional_details ?? null, input.collection_id ?? null,
        JSON.stringify(input.form_settings ?? {}),
        input.publish ? 1 : 0, ts, ts,
      ],
    })

    await this.logMemory(`${input.publish ? 'Published' : 'Drafted'} job listing "${input.title}"`,
      { id, slug, company: input.company })

    return this.get(id)
  }

  async edit(id: string, patch: JobUpdate) {
    await this.init()
    const sets: string[] = ['updated_at=?']
    const args: unknown[] = [iso()]

    const fields: Array<[keyof JobUpdate, string]> = [
      ['title',           'title'],
      ['company',         'company'],
      ['location',        'location'],
      ['location_type',   'location_type'],
      ['employment_type', 'employment_type'],
      ['description',     'description'],
      ['excerpt',         'excerpt'],
      ['requirements',    'requirements'],
      ['salary_min',      'salary_min'],
      ['salary_max',      'salary_max'],
      ['salary_currency', 'salary_currency'],
      ['image_url',       'image_url'],
      ['expires_at',      'expires_at'],
      ['ai_summary',      'ai_summary'],
      ['collection_id',   'collection_id'],
    ]
    for (const [k, col] of fields) {
      if (patch[k] !== undefined) {
        sets.push(`${col}=?`)
        args.push(patch[k] as never)
      }
    }
    if (patch.form_settings !== undefined) {
      sets.push('form_settings=?')
      args.push(JSON.stringify(patch.form_settings))
    }
    if (sets.length === 1) return this.get(id) // nothing to update

    await db.write({
      sql: `UPDATE job_listings SET ${sets.join(',')}
            WHERE id=? AND profile_id=?`,
      args: [...args, id, this.profileId],
    })
    return this.get(id)
  }

  async get(id: string) {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: 'SELECT * FROM job_listings WHERE id=? AND profile_id=? LIMIT 1',
      args: [id, this.profileId],
    })
    if (!r) throw new Error(`Job not found: ${id}`)
    return r
  }

  async list(opts: { published?: boolean; include_hidden?: boolean } = {}) {
    await this.init()
    const args: unknown[] = [this.profileId]
    let where = 'WHERE profile_id=?'
    if (!opts.include_hidden) where += ' AND hidden=0'
    if (opts.published !== undefined) {
      where += ' AND published=?'
      args.push(opts.published ? 1 : 0)
    }
    const { rows } = await db.execute({
      sql: `SELECT id, title, company, location, location_type, employment_type,
                   salary_min, salary_max, salary_currency,
                   published, total_applicants, expires_at,
                   created_at, updated_at
            FROM job_listings ${where}
            ORDER BY created_at DESC`,
      args,
    })
    return rows
  }

  /** Listings whose expires_at has passed — ready for review/soft-archive. */
  async expiringSoon(withinDays = 7) {
    await this.init()
    const cutoff = new Date(Date.now() + withinDays * 86400_000).toISOString().slice(0, 19) + 'Z'
    const { rows } = await db.execute({
      sql: `SELECT id, title, company, expires_at, total_applicants
            FROM job_listings
            WHERE profile_id=? AND hidden=0 AND published=1
              AND expires_at IS NOT NULL AND expires_at <= ?
            ORDER BY expires_at ASC`,
      args: [this.profileId, cutoff],
    })
    return rows
  }

  /** Flip published; trigger updates cms_analytics.total_published/total_draft. */
  async publish(id: string) {
    await super.publish('job_listings', id)
    return this.get(id)
  }

  async unpublish(id: string) {
    await this.init()
    await db.write({
      sql: `UPDATE job_listings SET published=0, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [iso(), id, this.profileId],
    })
    return this.get(id)
  }

  /** Soft archive (hidden=1). Never hard delete — would fire trg_job_listing_delete
   *  and decrement cms_analytics counters. */
  async archive(id: string) {
    await super.archive('job_listings', id)
  }

  // ── Applications ──────────────────────────────────────────────────────────

  async applications(jobId: string, opts: { status?: ApplicationStatus; limit?: number } = {}) {
    await this.init()
    let where = 'WHERE job_id=? AND profile_id=?'
    const args: unknown[] = [jobId, this.profileId]
    if (opts.status) { where += ' AND status=?'; args.push(opts.status) }

    const { rows } = await db.execute({
      sql: `SELECT id, full_name, email, phone, city, country, portfolio,
                   linkedin, github, skills, summary, status, created_at
            FROM job_applications ${where}
            ORDER BY created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 100],
    })
    return rows
  }

  async getApplication(id: string) {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT * FROM job_applications
            WHERE id=? AND profile_id=? LIMIT 1`,
      args: [id, this.profileId],
    })
    if (!r) throw new Error(`Application not found: ${id}`)
    return r
  }

  /** Move application through the pipeline (viewed → shortlisted → … → hired/rejected). */
  async updateApplicationStatus(id: string, status: ApplicationStatus) {
    await this.init()
    await db.write({
      sql: `UPDATE job_applications SET status=?, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [status, iso(), id, this.profileId],
    })
  }

  /** All applications across all the profile's jobs — hiring inbox. */
  async inbox(opts: { status?: ApplicationStatus; limit?: number } = {}) {
    await this.init()
    let where = 'WHERE a.profile_id=?'
    const args: unknown[] = [this.profileId]
    if (opts.status) { where += ' AND a.status=?'; args.push(opts.status) }
    const { rows } = await db.execute({
      sql: `SELECT a.id, a.full_name, a.email, a.city, a.country, a.status,
                   a.created_at, j.title AS job_title, j.company
            FROM job_applications a
            JOIN job_listings j ON j.id = a.job_id
            ${where}
            ORDER BY a.created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 50],
    })
    return rows
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  /** Inventory: totals from cms_analytics (free — trigger-maintained). */
  async summary() {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT a.total_posts, a.total_published, a.total_draft,
                   a.total_applications, a.total_views
            FROM cms c
            LEFT JOIN cms_analytics a ON a.cms_id = c.id
            WHERE c.profile_id=? AND c.category_id=?`,
      args: [this.profileId, CATEGORY.JOBS],
    })
    return {
      total:        Number(r?.total_posts        ?? 0),
      live:         Number(r?.total_published    ?? 0),
      drafts:       Number(r?.total_draft        ?? 0),
      applications: Number(r?.total_applications ?? 0),
      views:        Number(r?.total_views        ?? 0),
    }
  }
}

export const jobsManager = new JobsManager()
