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

  /** All drafts across every content type. Content lives in the unified
   *  `content` table — we split it by cms.slug for the pipeline view. */
  async draftPipeline() {
    await this.init()

    const { rows: contentRows } = await db.execute({
      sql: `SELECT c.id, c.title, c.date AS scheduled_for, cms.slug AS kind
            FROM content c
            JOIN cms ON cms.id = c.cms_id
            WHERE c.profile_id=? AND c.published=0 AND c.hidden=0
            ORDER BY c.updated_at DESC`,
      args: [this.profileId],
    })

    const byKind: Record<string, { label: string; table: string; drafts: any[] }> = {}
    for (const r of contentRows) {
      const kind = String(r.kind ?? 'content')
      const entry = byKind[kind] ??= { label: titleCase(kind), table: kind, drafts: [] }
      entry.drafts.push({ id: r.id, title: r.title, scheduled_for: r.scheduled_for })
    }

    const others = await Promise.all(
      [
        { table: 'products',     label: 'Products',    dateCol: 'created_at' },
        { table: 'pages',        label: 'Pages',       dateCol: 'created_at' },
        { table: 'job_listings', label: 'Jobs',        dateCol: 'created_at' },
        { table: 'forms',        label: 'Forms',       dateCol: 'created_at' },
      ].map(async ({ table, label, dateCol }) => {
        const { rows } = await db.execute({
          sql: `SELECT id, title, ${dateCol} AS scheduled_for
                FROM ${table} WHERE profile_id=? AND published=0 AND hidden=0
                ORDER BY created_at DESC`,
          args: [this.profileId],
        })
        return { label, table, drafts: rows }
      }),
    )

    return [...Object.values(byKind), ...others].filter(r => r.drafts.length > 0)
  }

  /** Content due for publish right now */
  async publishQueue(): Promise<ScheduledItem[]> {
    await this.init()
    const nowUnix = now()
    const nowISO  = iso()
    const queue: ScheduledItem[] = []

    // content table: `date` is ISO TEXT
    const { rows: contentDue } = await db.execute({
      sql: `SELECT id, title, date AS scheduled_for
            FROM content
            WHERE profile_id=? AND published=0 AND hidden=0
              AND date IS NOT NULL AND date <= ?
            ORDER BY date ASC`,
      args: [this.profileId, nowISO],
    })
    contentDue.forEach(r => queue.push({
      table: 'content', id: r.id as string,
      title: r.title as string, scheduled_for: r.scheduled_for as string,
    }))

    // job_listings: ISO `date`
    const { rows: jobs } = await db.execute({
      sql: `SELECT id, title, date AS scheduled_for FROM job_listings
            WHERE profile_id=? AND published=0 AND hidden=0
              AND date IS NOT NULL AND date <= ? ORDER BY date ASC`,
      args: [this.profileId, nowISO],
    })
    jobs.forEach(r => queue.push({
      table: 'job_listings', id: r.id as string,
      title: r.title as string, scheduled_for: r.scheduled_for as string,
    }))

    // products: unix `published_at`
    const { rows: products } = await db.execute({
      sql: `SELECT id, title, published_at AS scheduled_for FROM products
            WHERE profile_id=? AND published=0 AND hidden=0
              AND published_at IS NOT NULL AND published_at <= ?
            ORDER BY published_at ASC`,
      args: [this.profileId, nowUnix],
    })
    products.forEach(r => queue.push({
      table: 'products', id: r.id as string,
      title: r.title as string, scheduled_for: r.scheduled_for as number,
    }))

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

    const isoTables = new Set(['content', 'job_listings'])
    const statements = queue.map(item => ({
      sql: `UPDATE ${item.table} SET published=1, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [isoTables.has(item.table) ? iso() : now(), item.id, this.profileId],
    }))
    await db.batch(statements)

    if (n8n_webhook_url) {
      fetch(n8n_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'content_published', business: this.ctx.profile.title, items: queue }),
      }).catch(() => { /* non-blocking */ })
    }

    return queue
  }

  /** Schedule any content for future publish. */
  async schedule(table: 'content' | 'products' | 'job_listings', id: string, at: Date) {
    await this.init()
    const isISO   = table !== 'products'
    const dateCol = table === 'products' ? 'published_at' : 'date'
    const val     = isISO ? at.toISOString().slice(0, 19) + 'Z' : Math.floor(at.getTime() / 1000)
    const updCol  = isISO ? `updated_at='${iso()}'` : `updated_at=${now()}`

    await db.write({
      sql: `UPDATE ${table} SET published=0, ${dateCol}=?, ${updCol}
            WHERE id=? AND profile_id=?`,
      args: [val, id, this.profileId],
    })
  }
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const coo = new COO()
