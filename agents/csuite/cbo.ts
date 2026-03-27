/**
 * REX — Chief Business Officer
 * "Revenue is the scoreboard. I read it better than anyone."
 * Reads: product_analytics, purchases, profile_analytics
 * Outputs: revenue strategy, pricing recommendations, upsell opportunities
 */

import { BaseAgent, db }          from '../_base.ts'
import { analyticsAgent }                  from '../growth/analytics-agent.ts'
import { storeManager }           from '../creators/store-manager.ts'

export class CBO extends BaseAgent {
  readonly name  = 'REX'
  readonly title = 'Chief Business Officer'

  async revenueReport() {
    await this.init()
    const { products, profile } = await analyticsAgent.snapshot()

    const totalRevenue   = products.reduce((a, p) => a + p.revenue, 0)
    const totalSales     = products.reduce((a, p) => a + p.sales, 0)
    const topProduct     = products[0] ?? null
    const avgOrderValue  = totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0

    // Product type breakdown
    const byType = products.reduce<Record<string, { revenue: number; sales: number }>>((acc, p) => {
      if (!acc[p.type]) acc[p.type] = { revenue: 0, sales: 0 }
      acc[p.type].revenue += p.revenue
      acc[p.type].sales   += p.sales
      return acc
    }, {})

    // Recent purchases for velocity signal
    const { rows: recentPurchases } = await db.execute({
      sql: `SELECT product_id, amount_cents, currency, created_at
            FROM purchases WHERE profile_id=? AND payment_status='completed'
            ORDER BY created_at DESC LIMIT 20`,
      args: [this.profileId],
    })

    return {
      total_revenue_cents:  totalRevenue,
      total_sales:          totalSales,
      avg_order_value_cents: avgOrderValue,
      revenue_trend:        profile?.revenue_trend ?? 'no data',
      top_product:          topProduct,
      by_type:              byType,
      recent_purchases:     recentPurchases,
      strategy:             this.buildStrategy({ totalRevenue, totalSales, products, byType }),
    }
  }

  async pricingAudit() {
    await this.init()
    const products = await storeManager.list({ published: true })
    return products.map(p => ({
      id:          p.id,
      title:       p.title,
      type:        p.type,
      price_cents: p.price_cents,
      price_usd:   `$${((p.price_cents as number) / 100).toFixed(2)}`,
    }))
  }

  async conversionAnalysis() {
    await this.init()
    // Compare link_analytics clicks vs purchases per product
    const { rows } = await db.execute({
      sql: `SELECT p.id, p.title, p.type,
            pa.total_sales, pa.total_revenue_cents,
            pa.sales_30d
            FROM products p
            LEFT JOIN product_analytics pa ON pa.product_id = p.id
            WHERE p.profile_id=? AND p.published=1 AND p.hidden=0
            ORDER BY pa.total_revenue_cents DESC NULLS LAST`,
      args: [this.profileId],
    })
    return rows
  }

  private buildStrategy(ctx: {
    totalRevenue: number
    totalSales: number
    products: Array<{ type: string; revenue: number; title: string }>
    byType: Record<string, { revenue: number; sales: number }>
  }): string[] {
    const recs: string[] = []
    const { totalRevenue, totalSales, products, byType } = ctx

    if (totalRevenue === 0)
      recs.push('No revenue yet. Launch your first paid product — start with a service or 1:1 meeting for fastest validation.')

    if (!byType.course && totalRevenue > 0)
      recs.push('Add a course. Courses generate passive revenue without ongoing time cost.')

    if (!byType.sponsorship)
      recs.push('Open a sponsorship slot. If you have traffic, it monetizes immediately.')

    if (products[0] && products[0].revenue > 0)
      recs.push(`Upsell opportunity: bundle "${products[0].title}" with a service or course for a premium tier.`)

    if (totalSales > 10 && !byType.subscription)
      recs.push('You have traction. Add a subscription product to convert one-time buyers into recurring revenue.')

    return recs
  }
}

export const cbo = new CBO()
