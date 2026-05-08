/**
 * JOB — Jobs Manager
 * "Every great team starts with a great listing."
 * Writes to: job_listings, reads job_applications
 */

import { BaseAgent, db, ulid, iso } from '../_base.ts'
import { uniqueSlug }               from '../../lib/slug.ts'

export interface JobInput {
  title: string; company: string; location: string
  location_type: 'remote' | 'onsite' | 'hybrid'
  employment_type: 'full-time' | 'part-time' | 'contract' | 'freelance'
  description: string; excerpt?: string; requirements?: string
  salary_min?: number; salary_max?: number; salary_currency?: string
  image_url?: string; expires_at?: string; publish?: boolean
}

export class JobsManager extends BaseAgent {
  readonly name  = 'JOB'
  readonly title = 'Jobs Manager'

  async create(input: JobInput) {
    await this.init()
    const id   = ulid()
    const slug = await uniqueSlug('job_listings', input.title, this.profileId)
    const ts   = iso()

    await db.execute({
      sql: `INSERT INTO job_listings
            (id,profile_id,user_id,title,company,location,location_type,
             employment_type,description,excerpt,requirements,
             salary_min,salary_max,salary_currency,slug,image_url,
             expires_at,published,hidden,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      args: [
        id, this.profileId, this.userId,
        input.title, input.company, input.location, input.location_type,
        input.employment_type, input.description,
        input.excerpt ?? null, input.requirements ?? null,
        input.salary_min ?? null, input.salary_max ?? null,
        input.salary_currency ?? 'USD', slug,
        input.image_url ?? null, input.expires_at ?? null,
        input.publish ? 1 : 0, ts, ts,
      ],
    })
    return this.get(id)
  }

  async get(id: string) {
    const { rows: [r] } = await db.execute({ sql: 'SELECT * FROM job_listings WHERE id=?', args: [id] })
    if (!r) throw new Error(`Job not found: ${id}`)
    return r
  }

  async list(opts: { published?: boolean } = {}) {
    await this.init()
    const args: unknown[] = [this.profileId]
    let where = 'WHERE profile_id=? AND hidden=0'
    if (opts.published !== undefined) { where += ' AND published=?'; args.push(opts.published ? 1 : 0) }
    const { rows } = await db.execute({
      sql: `SELECT id,title,company,location_type,employment_type,published,total_applicants
            FROM job_listings ${where} ORDER BY created_at DESC`,
      args,
    })
    return rows
  }

  async applications(jobId: string) {
    const { rows } = await db.execute({
      sql: 'SELECT id,full_name,email,city,country,created_at FROM job_applications WHERE job_id=? ORDER BY created_at DESC',
      args: [jobId],
    })
    return rows
  }

  async publish(id: string)  { await super.publish('job_listings', id); return this.get(id) }
  async archive(id: string)  { await super.archive('job_listings', id) }
  async summary()            { await this.init(); return this.count('job_listings') }
}

export const jobsManager = new JobsManager()
