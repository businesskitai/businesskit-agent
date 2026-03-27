/**
 * ATLAS — Analytics Agent
 * "I see everything. I tell you what it means."
 *
 * Read-only. Never writes. Used by ARIA, REX, NOVA for intelligence.
 */

import { BaseAgent } from '../_base.ts'
import { profileSummary, productSummary, linkSummary, formSummary } from '../../lib/analytics.ts'

export class AnalyticsAgent extends BaseAgent {
  readonly name  = 'ATLAS'
  readonly title = 'Analytics Agent'

  async snapshot() {
    await this.init()
    const [profile, products, links, forms] = await Promise.all([
      profileSummary(this.profileId),
      productSummary(this.profileId),
      linkSummary(this.profileId),
      formSummary(this.profileId),
    ])
    return { profile, products, links, forms }
  }

  async revenueReport() {
    await this.init()
    const products = await productSummary(this.profileId)
    const profile  = await profileSummary(this.profileId)
    return {
      total_revenue:    profile?.total_revenue ?? 0,
      revenue_trend:    profile?.revenue_trend ?? 'no data',
      last_30d_revenue: profile?.revenue_30d.reduce((a, b) => a + b, 0) ?? 0,
      top_products:     products.slice(0, 5),
    }
  }

  async trafficReport() {
    await this.init()
    const profile = await profileSummary(this.profileId)
    const links   = await linkSummary(this.profileId)
    return {
      total_clicks:  profile?.total_clicks ?? 0,
      clicks_30d:    profile?.clicks_30d ?? [],
      top_countries: profile?.top_countries ?? [],
      top_referrers: profile?.top_referrers ?? [],
      top_links:     links,
    }
  }
}

export const analyticsAgent = new AnalyticsAgent()
