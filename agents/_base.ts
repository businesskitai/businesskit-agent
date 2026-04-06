import { db } from '../lib/db.ts'
import { getBrandContext, type BrandContext } from '../lib/profile.ts'
import { ulid, now, iso } from '../lib/id.ts'
import type { Client } from '@libsql/client'

/** Singleton Turso client — agents may import `db` for raw queries */
export { db, ulid, now, iso }

/**
 * BaseAgent — extend this for every agent.
 *
 * Provides:
 *   - this.ctx       → BrandContext (profile, settings, credentials)
 *   - this.profileId → enforced on every write
 *   - this.userId    → from profile
 *   - this.archive() → soft delete (hidden=1) for any table
 *   - this.publish() → flip published=1 for any table
 *   - this.count()   → content inventory for any table
 */
export abstract class BaseAgent {
  protected ctx!: BrandContext
  protected db: Client

  constructor(injectedDB?: Client) {
    this.db = injectedDB ?? db
  }

  /** Call at the start of any agent method that needs the DB */
  protected async init() {
    if (!this.ctx) this.ctx = await getBrandContext(this.db)
  }

  protected get profileId() { return this.ctx.profile.id }
  protected get userId()    { return this.ctx.profile.user_id }

  /** Soft delete — never hard delete */
  protected async archive(table: string, id: string | number) {
    const ts = typeof id === 'number'
      ? `updated_at='${iso()}'`
      : `updated_at=${now()}`
    await this.db.execute({ sql: `UPDATE ${table} SET hidden=1,${ts} WHERE id=?`, args: [id] })
  }

  /** Publish any content row */
  protected async publish(table: string, id: string | number) {
    const ts = typeof id === 'number'
      ? `updated_at='${iso()}'`
      : `updated_at=${now()}`
    await this.db.execute({ sql: `UPDATE ${table} SET published=1,${ts} WHERE id=?`, args: [id] })
  }

  /** Quick inventory: { total, live, drafts } */
  protected async count(table: string) {
    const { rows: [r] } = await this.db.execute({
      sql: `SELECT COUNT(*) total,
            SUM(CASE WHEN published=1 AND hidden=0 THEN 1 ELSE 0 END) live,
            SUM(CASE WHEN published=0 AND hidden=0 THEN 1 ELSE 0 END) drafts
            FROM ${table} WHERE profile_id=?`,
      args: [this.profileId],
    })
    return { total: Number(r?.total ?? 0), live: Number(r?.live ?? 0), drafts: Number(r?.drafts ?? 0) }
  }
}
