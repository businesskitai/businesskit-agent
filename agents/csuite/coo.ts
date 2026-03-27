/**
 * OTTO — Chief Operating Officer
 * "Pipelines don't run themselves. I make sure they do."
 * Manages: publish queue, draft pipeline, scheduling
 * Phase 3: becomes the CF Durable Object that runs everything autonomously
 */

import { BaseAgent, db, now, iso } from '../_base.ts'

interface ScheduledItem {
  table: string; id: string; title: string; scheduled_for: string | number
}

export class COO extends BaseAgent {
  readonly name  = 'OTTO'
  readonly title = 'Chief Operating Officer'

  /** All drafts across every content type */
  async draftPipeline() {
    await this.init()
    const tables = [
      { table: 'posts',        label: 'Blog Posts',  dateCol: 'date' },
      { table: 'products',     label: 'Products',    dateCol: null },
      { table: 'pages',        label: 'Pages',       dateCol: null },
      { table: 'job_listings', label: 'Jobs',        dateCol: null },
      { table: 'forms',        label: 'Forms',       dateCol: null },
    ]

    const results = await Promise.all(tables.map(async ({ table, label, dateCol }) => {
      const { rows } = await db.execute({
        sql: `SELECT id, title, ${dateCol ?? 'created_at'} AS scheduled_for
              FROM ${table} WHERE profile_id=? AND published=0 AND hidden=0
              ORDER BY created_at DESC`,
        args: [this.profileId],
      })
      return { label, table, drafts: rows }
    }))

    return results.filter(r => r.drafts.length > 0)
  }

  /** Content due for publish right now */
  async publishQueue(): Promise<ScheduledItem[]> {
    await this.init()
    const nowUnix = now()
    const nowISO  = iso()
    const queue: ScheduledItem[] = []

    // ISO date tables: posts, job_listings
    for (const table of ['posts', 'job_listings']) {
      const { rows } = await db.execute({
        sql: `SELECT id, title, date AS scheduled_for FROM ${table}
              WHERE profile_id=? AND published=0 AND hidden=0
              AND date IS NOT NULL AND date <= ? ORDER BY date ASC`,
        args: [this.profileId, nowISO],
      })
      rows.forEach(r => queue.push({ table, id: r.id as string, title: r.title as string, scheduled_for: r.scheduled_for as string }))
    }

    // Unix timestamp tables: products
    const { rows: products } = await db.execute({
      sql: `SELECT id, title, published_at AS scheduled_for FROM products
            WHERE profile_id=? AND published=0 AND hidden=0
            AND published_at IS NOT NULL AND published_at <= ? ORDER BY published_at ASC`,
      args: [this.profileId, nowUnix],
    })
    products.forEach(r => queue.push({ table: 'products', id: r.id as string, title: r.title as string, scheduled_for: r.scheduled_for as number }))

    return queue
  }

  /**
   * Run the publish queue — flips published=1 on all due items.
   * Phase 1: call manually. Phase 3: called by CF Durable Object on cron.
   */
  async runPublishQueue(): Promise<ScheduledItem[]> {
    await this.init()
    const { n8n_webhook_url } = this.ctx.credentials
    const queue = await this.publishQueue()
    if (!queue.length) return []

    const isoTables  = new Set(['posts', 'job_listings'])
    const statements = queue.map(item => ({
      sql: `UPDATE ${item.table} SET published=1, updated_at=? WHERE id=?`,
      args: [isoTables.has(item.table) ? iso() : now(), item.id],
    }))
    await db.batch(statements)

    // Notify n8n once with the full batch
    if (n8n_webhook_url) {
      fetch(n8n_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'content_published', business: this.ctx.profile.title, items: queue }),
      }).catch(() => { /* non-blocking */ })
    }

    return queue
  }

  /** Schedule any content for future publish */
  async schedule(table: 'posts' | 'products' | 'job_listings', id: string, at: Date) {
    const isISO  = table !== 'products'
    const dateCol = table === 'products' ? 'published_at' : 'date'
    const val     = isISO ? at.toISOString().slice(0, 19) + 'Z' : Math.floor(at.getTime() / 1000)
    const updCol  = isISO ? `updated_at='${iso()}'` : `updated_at=${now()}`

    await db.execute({
      sql: `UPDATE ${table} SET published=0, ${dateCol}=?, ${updCol} WHERE id=?`,
      args: [val, id],
    })
  }
}

export const coo = new COO()
