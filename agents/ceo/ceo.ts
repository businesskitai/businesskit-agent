/**
 * ARIA — Chief Executive Officer
 * "I see the whole board. I set the priorities. I brief the team."
 *
 * Orchestrates all other agents. Generates weekly briefing.
 * In Phase 3: runs on CF Workflows cron → n8n → email/Slack.
 */

import { BaseAgent, db } from '../_base.ts'
import { analyticsAgent }         from '../analytics/analytics.ts'

export class CEO extends BaseAgent {
  readonly name  = 'ARIA'
  readonly title = 'Chief Executive Officer'

  async weeklyBriefing() {
    await this.init()
    const [snap, inventory] = await Promise.all([
      analyticsAgent.snapshot(),
      this.fullInventory(),
    ])

    const recs = this.recommendations(snap, inventory)

    return {
      business:    this.ctx.profile.title,
      generated:   new Date().toISOString(),
      revenue:     this.formatRevenue(snap.profile),
      traffic:     this.formatTraffic(snap.profile),
      top_products: snap.products.slice(0, 5),
      inventory,
      recommendations: recs,
    }
  }

  async fullInventory() {
    await this.init()

    // Content lives in unified `content` table — read trigger-maintained
    // cms_analytics counts (free; no per-row COUNT). Everything else uses
    // the live tables directly.
    const [contentRows, products, jobs, forms, pages] = await Promise.all([
      db.execute({
        sql: `SELECT cms.slug AS kind, a.total_posts, a.total_published, a.total_draft
              FROM cms
              LEFT JOIN cms_analytics a ON a.cms_id = cms.id
              WHERE cms.profile_id=?`,
        args: [this.profileId],
      }).then(r => r.rows),
      this.count('products'),
      this.count('job_listings'),
      this.count('forms'),
      this.count('pages'),
    ])

    const inv: Record<string, { total: number; live: number; drafts: number }> = {
      products: products, job_listings: jobs, forms: forms, pages: pages,
    }
    for (const r of contentRows) {
      const total = Number(r.total_posts ?? 0)
      const live  = Number(r.total_published ?? 0)
      const draft = Number(r.total_draft ?? 0)
      if (total > 0) inv[String(r.kind)] = { total, live, drafts: draft }
    }
    return inv
  }

  toMarkdown(briefing: Awaited<ReturnType<CEO['weeklyBriefing']>>): string {
    const { business, generated, revenue, traffic, top_products, inventory, recommendations } = briefing
    return `# Weekly Briefing — ${business}
_${new Date(generated).toDateString()}_

## Revenue
- Total: ${revenue.total} | Last 30d: ${revenue.last30d} | Trend: ${revenue.trend}

## Traffic
- Clicks: ${traffic.total.toLocaleString()} | Top: ${traffic.top_countries.map(([c]) => c).join(', ')}

## Content Inventory
${Object.entries(inventory).map(([t, v]) => `- **${t}**: ${v.live} live, ${v.drafts} drafts`).join('\n')}

## Top Products
${top_products.slice(0, 5).map(p => `- ${p.title}: $${(p.revenue / 100).toFixed(2)} (${p.sales} sales)`).join('\n') || '- none yet'}

## Recommendations
${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}
`
  }

  /** Send briefing to n8n webhook (Phase 1: manual trigger, Phase 3: cron) */
  async sendBriefing() {
    await this.init()
    const { n8n_webhook_url } = this.ctx.credentials
    if (!n8n_webhook_url) return { ok: false, reason: 'No n8n webhook URL in credentials' }

    const briefing = await this.weeklyBriefing()
    const body = { event: 'weekly_briefing', ...briefing, markdown: this.toMarkdown(briefing) }

    try {
      const res = await fetch(n8n_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return { ok: res.ok, status: res.status }
    } catch (e) {
      return { ok: false, reason: String(e) }
    }
  }

  private formatRevenue(p: Awaited<ReturnType<typeof analyticsAgent.snapshot>>['profile']) {
    const total  = `$${((p?.total_revenue ?? 0) / 100).toFixed(2)}`
    const last30d = `$${((p?.revenue_30d.reduce((a, b) => a + b, 0) ?? 0) / 100).toFixed(2)}`
    return { total, last30d, trend: p?.revenue_trend ?? 'no data' }
  }

  private formatTraffic(p: Awaited<ReturnType<typeof analyticsAgent.snapshot>>['profile']) {
    return { total: p?.total_clicks ?? 0, top_countries: p?.top_countries ?? [] }
  }

  private recommendations(
    snap: Awaited<ReturnType<typeof analyticsAgent.snapshot>>,
    inventory: Record<string, { live: number; drafts: number }>
  ): string[] {
    const recs: string[] = []

    if (!snap.profile) recs.push('Connect ATLAS — no analytics data yet.')
    if ((inventory.blog?.live ?? 0) < 3)
      recs.push('Publish at least 3 blog posts. Consistency drives organic traffic.')
    if ((inventory.blog?.drafts ?? 0) > 0)
      recs.push(`${inventory.blog.drafts} draft post(s) ready. Ask BLAKE to review and publish.`)

    const hasNoProduct = !snap.products.some(p => p.type === 'course')
    if (hasNoProduct) recs.push('No courses yet. Ask SAGE to create one — courses drive 3–10x revenue per customer.')

    const noService = !snap.products.some(p => ['service', 'meeting'].includes(p.type))
    if (noService) recs.push('No services or 1:1 meetings. Ask LEO to add one — low effort, immediate revenue.')

    if (snap.products[0]?.revenue > 0)
      recs.push(`"${snap.products[0].title}" is top earner. Ask REX for an upsell strategy.`)

    return recs.length ? recs : ['All systems operational. Stay consistent.']
  }
}

export const ceo = new CEO()
