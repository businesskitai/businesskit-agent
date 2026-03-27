/**
 * NOVA — Chief Marketing Officer
 * "Content without strategy is noise. I make it signal."
 * Orchestrates: BLAKE, PEARL, COPY, HERMES, SCOUT
 * Reads: all analytics, all published content
 * Outputs: content calendar, campaign strategy, growth recommendations
 */

import { BaseAgent, db }  from '../_base.ts'
import { analyticsAgent }          from '../growth/analytics-agent.ts'
import { blogWriter }     from '../creators/blog-writer.ts'

export class CMO extends BaseAgent {
  readonly name  = 'NOVA'
  readonly title = 'Chief Marketing Officer'

  async contentCalendar(weeksAhead = 4) {
    await this.init()
    const { profile, products } = await analyticsAgent.snapshot()

    const topProducts = products.slice(0, 3)
    const weeks: Array<{ week: number; items: CalendarItem[] }> = []

    for (let w = 1; w <= weeksAhead; w++) {
      const items: CalendarItem[] = []

      // Blog: 2 posts per week
      items.push({ day: 'Monday', type: 'blog', agent: 'BLAKE',
        suggestion: w % 2 === 0
          ? `How-to guide related to ${topProducts[0]?.title ?? 'your main product'}`
          : `Opinion/thought leadership in your niche` })
      items.push({ day: 'Thursday', type: 'blog', agent: 'BLAKE',
        suggestion: `Listicle or resource roundup for your audience` })

      // Newsletter: 1 per week
      items.push({ day: 'Wednesday', type: 'newsletter', agent: 'PEARL',
        suggestion: `Weekly digest + feature one product or win` })

      // Social: 3 posts per week via HERMES/n8n
      items.push({ day: 'Tuesday', type: 'social', agent: 'HERMES',
        suggestion: `Repurpose Monday blog post for LinkedIn/X` })
      items.push({ day: 'Friday', type: 'social', agent: 'HERMES',
        suggestion: `Behind-the-scenes or community engagement post` })

      weeks.push({ week: w, items })
    }

    return {
      business:    this.ctx.profile.title,
      weeks_ahead: weeksAhead,
      calendar:    weeks,
      strategy:    this.growthStrategy(profile, products),
    }
  }

  async growthAudit() {
    await this.init()
    const snap   = await analyticsAgent.snapshot()
    const drafts = await blogWriter.list({ published: false })

    const totalTraffic  = snap.profile?.total_clicks ?? 0
    const totalRevenue  = snap.products.reduce((a, p) => a + p.revenue, 0)
    const conversionRate = totalTraffic > 0
      ? ((snap.profile?.total_sales ?? 0) / totalTraffic * 100).toFixed(2) + '%'
      : 'no data'

    return {
      traffic:         totalTraffic,
      revenue:         totalRevenue,
      conversion_rate: conversionRate,
      draft_count:     drafts.length,
      top_referrers:   snap.profile?.top_referrers ?? [],
      gaps:            this.contentGaps(snap),
    }
  }

  private contentGaps(snap: Awaited<ReturnType<typeof analyticsAgent.snapshot>>): string[] {
    const gaps: string[] = []
    const types = new Set(snap.products.map(p => p.type))

    if (!types.has('course'))       gaps.push('No course — add a course to build passive revenue')
    if (!types.has('service'))      gaps.push('No services — add a service offering for quick revenue')
    if (!types.has('sponsorship'))  gaps.push('Sponsorships page missing — monetize your audience directly')
    if ((snap.profile?.total_clicks ?? 0) < 100) gaps.push('Traffic too low — prioritize SEO content (ask SCOUT + BLAKE)')
    if (snap.links.length === 0)    gaps.push('No link-in-bio links — add key links to drive traffic')

    return gaps
  }

  private growthStrategy(
    profile: Awaited<ReturnType<typeof analyticsAgent.snapshot>>['profile'],
    products: Awaited<ReturnType<typeof analyticsAgent.snapshot>>['products']
  ): string[] {
    const recs: string[] = []
    if ((profile?.total_clicks ?? 0) < 500)
      recs.push('Focus: publish 2 SEO-optimized blog posts per week for the next 30 days.')
    if (products.length === 0)
      recs.push('No products live. Launch your first paid product this week — even a $9 download.')
    if (products.length > 0 && (profile?.total_sales ?? 0) === 0)
      recs.push('Products exist but no sales. Review pricing, add social proof, drive traffic via HERMES.')
    return recs
  }
}

interface CalendarItem {
  day: string; type: 'blog' | 'newsletter' | 'social' | 'product'; agent: string; suggestion: string
}

export const cmo = new CMO()
