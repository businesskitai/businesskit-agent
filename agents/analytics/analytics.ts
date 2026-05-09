/**
 * Analytics Agent — READ-ONLY cross-analytics.
 *
 * Aggregation tree (per businesskit-files/*):
 *
 *   clicks_analytics ──▶ link_analytics ──▶ link_analytics_by_category
 *                    └──────────────────────▶ profile_analytics
 *
 *   purchases ─────────▶ product_analytics ─▶ profile_analytics
 *
 *   form_analytics ─────────────────────────▶ cms_analytics (cat_34)
 *   job_analytics ──────────────────────────▶ cms_analytics (cat_31)
 *   content_analytics ──────────────────────▶ cms_analytics (per category)
 *
 *   profile_analytics = traffic + revenue rollup (1 row per profile)
 *   cms_analytics     = posts/submissions/applications/views rollup per CMS
 *                       category (cat_35 Blog, cat_34 Forms, cat_31 Jobs, etc.)
 *
 * Never writes. Never aggregates. Just reads the already-rolled-up counters
 * maintained by app-side aggregators + the DB triggers in product-triggers.ts
 * and content/forms/jobs trigger sets.
 *
 * This agent exposes ONE cross-business snapshot (crossSnapshot) and a few
 * focused read slices. Callers can ask ATLAS for any of them.
 */

import { BaseAgent, db } from '../_base.ts'

// ── Helpers ─────────────────────────────────────────────────────────────────

const parseArr = (v: unknown): number[] => {
  try { const x = JSON.parse(v as string); return Array.isArray(x) ? x : [] }
  catch { return [] }
}
const parseObj = (v: unknown): Record<string, number> => {
  try { const x = JSON.parse(v as string); return x && typeof x === 'object' ? x : {} }
  catch { return {} }
}
const sum  = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
const top  = (obj: Record<string, number>, n = 5) =>
  Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([key, value]) => ({ key, value }))

function trend(series: number[]): { pct: number | null; direction: 'up' | 'down' | 'flat' | 'new' } {
  if (series.length < 2) return { pct: null, direction: 'new' }
  const half   = Math.floor(series.length / 2)
  const recent = sum(series.slice(half))
  const prior  = sum(series.slice(0, half))
  if (!prior) return { pct: null, direction: recent > 0 ? 'up' : 'flat' }
  const pct = Math.round(((recent - prior) / prior) * 100)
  return { pct, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
}

// CMS category ids used in cms_analytics rollups.
// Subset that covers the main content types; extend as needed.
const CMS_CATS = {
  cat_18: 'Courses',
  cat_19: 'Downloads',
  cat_20: 'Newsletter',
  cat_31: 'Jobs',
  cat_32: 'Docs',
  cat_34: 'Forms',
  cat_35: 'Blog',
  cat_36: 'Guides',
  cat_37: 'Notes',
  cat_45: 'Posts',
  cat_47: 'Pages',
} as const

// ── Types ───────────────────────────────────────────────────────────────────

export interface CrossSnapshot {
  profile: ProfileRollup | null
  cms:     CmsRollup[]
  top_products: Array<{
    id:       string
    title:    string
    type:     string
    sales:    number
    revenue_cents: number
    revenue_30d:   number[]
  }>
  top_links: Array<{
    id:     string
    title:  string
    url:    string
    clicks: number
    clicks_7d: number[]
  }>
  top_categories: Array<{
    category_id:  string
    total_clicks: number
    total_links:  number
    active_links: number
  }>
}

export interface ProfileRollup {
  total_views:     number
  total_clicks:    number
  total_sales:     number
  total_earnings:  number
  total_products:  number
  total_links:     number
  active_links:    number
  revenue_7d:      number[]
  revenue_30d:     number[]
  revenue_12m:     number[]
  revenue_30d_total:  number
  revenue_trend:      ReturnType<typeof trend>
  clicks_7d:       number[]
  clicks_30d:      number[]
  clicks_trend:    ReturnType<typeof trend>
  top_countries:   Array<{ key: string; value: number }>
  top_referrers:   Array<{ key: string; value: number }>
  top_utm_sources: Array<{ key: string; value: number }>
  last_aggregated_at: number
}

export interface CmsRollup {
  category_id:        string
  category_name:      string
  total_posts:        number
  total_published:    number
  total_draft:        number
  total_views:        number
  total_reactions:    number
  total_comments:     number
  total_submissions:  number  // form_analytics bubbles here
  total_applications: number  // job_analytics bubbles here
}

// ── Agent ───────────────────────────────────────────────────────────────────

export class AnalyticsAgent extends BaseAgent {
  readonly name  = 'Analytics'
  readonly title = 'Analytics Agent'

  /** One cross-business snapshot. Pulls from every rollup in parallel. */
  async crossSnapshot(): Promise<CrossSnapshot> {
    await this.init()
    const [profile, cms, topProducts, topLinks, topCategories] = await Promise.all([
      this.profileRollup(),
      this.cmsRollup(),
      this.topProducts(5),
      this.topLinks(10),
      this.topLinkCategories(5),
    ])
    return {
      profile,
      cms,
      top_products:   topProducts,
      top_links:      topLinks,
      top_categories: topCategories,
    }
  }

  /** profile_analytics row — traffic + revenue rollup across all products/links. */
  async profileRollup(): Promise<ProfileRollup | null> {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT total_views, total_clicks, total_sales, total_earnings,
                   total_products, total_links, active_links,
                   revenue_7d, revenue_30d, revenue_12m,
                   analytics_7d, analytics_30d,
                   country_clicks, referrer_clicks, utm_source_clicks,
                   last_aggregated_at
            FROM profile_analytics WHERE profile_id=? LIMIT 1`,
      args: [this.profileId],
    })
    if (!r) return null

    const revenue30d = parseArr(r.revenue_30d)
    const clicks30d  = parseArr(r.analytics_30d)
    return {
      total_views:    Number(r.total_views    ?? 0),
      total_clicks:   Number(r.total_clicks   ?? 0),
      total_sales:    Number(r.total_sales    ?? 0),
      total_earnings: Number(r.total_earnings ?? 0),
      total_products: Number(r.total_products ?? 0),
      total_links:    Number(r.total_links    ?? 0),
      active_links:   Number(r.active_links   ?? 0),
      revenue_7d:     parseArr(r.revenue_7d),
      revenue_30d:    revenue30d,
      revenue_12m:    parseArr(r.revenue_12m),
      revenue_30d_total: sum(revenue30d),
      revenue_trend:  trend(revenue30d),
      clicks_7d:      parseArr(r.analytics_7d),
      clicks_30d:     clicks30d,
      clicks_trend:   trend(clicks30d),
      top_countries:  top(parseObj(r.country_clicks)),
      top_referrers:  top(parseObj(r.referrer_clicks)),
      top_utm_sources: top(parseObj(r.utm_source_clicks)),
      last_aggregated_at: Number(r.last_aggregated_at ?? 0),
    }
  }

  /** cms_analytics rollup per category. forms / jobs / content feed into
   *  total_submissions / total_applications / total_views / total_posts. */
  async cmsRollup(): Promise<CmsRollup[]> {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT c.category_id,
                   a.total_posts, a.total_published, a.total_draft,
                   a.total_views, a.total_reactions, a.total_comments,
                   a.total_submissions, a.total_applications
            FROM cms c
            LEFT JOIN cms_analytics a ON a.cms_id = c.id
            WHERE c.profile_id=?`,
      args: [this.profileId],
    })
    return rows.map(r => ({
      category_id:        r.category_id as string,
      category_name:      (CMS_CATS as Record<string, string>)[r.category_id as string]
                           ?? (r.category_id as string),
      total_posts:        Number(r.total_posts        ?? 0),
      total_published:    Number(r.total_published    ?? 0),
      total_draft:        Number(r.total_draft        ?? 0),
      total_views:        Number(r.total_views        ?? 0),
      total_reactions:    Number(r.total_reactions    ?? 0),
      total_comments:     Number(r.total_comments     ?? 0),
      total_submissions:  Number(r.total_submissions  ?? 0),
      total_applications: Number(r.total_applications ?? 0),
    }))
  }

  /** product_analytics top-N by revenue (trigger-maintained from purchases). */
  async topProducts(limit = 5) {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT pa.product_id, pa.total_sales, pa.total_revenue_cents,
                   pa.revenue_30d, p.title, p.type
            FROM product_analytics pa
            JOIN products p ON p.id = pa.product_id
            WHERE pa.profile_id=? AND p.hidden=0
            ORDER BY pa.total_revenue_cents DESC
            LIMIT ?`,
      args: [this.profileId, limit],
    })
    return rows.map(r => ({
      id:            r.product_id as string,
      title:         r.title as string,
      type:          r.type as string,
      sales:         Number(r.total_sales ?? 0),
      revenue_cents: Number(r.total_revenue_cents ?? 0),
      revenue_30d:   parseArr(r.revenue_30d),
    }))
  }

  /** link_analytics top-N by total_clicks (trigger-maintained from clicks_analytics). */
  async topLinks(limit = 10) {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT la.link_id, la.total_clicks, la.analytics_7d, l.title, l.url
            FROM link_analytics la
            JOIN links l ON l.id = la.link_id
            WHERE la.profile_id=?
            ORDER BY la.total_clicks DESC
            LIMIT ?`,
      args: [this.profileId, limit],
    })
    return rows.map(r => ({
      id:        r.link_id as string,
      title:     r.title as string,
      url:       r.url as string,
      clicks:    Number(r.total_clicks ?? 0),
      clicks_7d: parseArr(r.analytics_7d),
    }))
  }

  /** link_analytics_by_category — where clicks split across categories. */
  async topLinkCategories(limit = 5) {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT category_id, total_clicks, total_links, active_links
            FROM link_analytics_by_category
            WHERE profile_id=?
            ORDER BY total_clicks DESC
            LIMIT ?`,
      args: [this.profileId, limit],
    })
    return rows.map(r => ({
      category_id:  r.category_id as string,
      total_clicks: Number(r.total_clicks ?? 0),
      total_links:  Number(r.total_links  ?? 0),
      active_links: Number(r.active_links ?? 0),
    }))
  }

  // ── Convenience reports (compose over crossSnapshot slices) ──────────────

  async revenueReport() {
    const [p, products] = await Promise.all([this.profileRollup(), this.topProducts(5)])
    return {
      total_revenue_cents:  p?.total_earnings ?? 0,
      revenue_trend:        p?.revenue_trend ?? trend([]),
      revenue_30d_cents:    p?.revenue_30d_total ?? 0,
      revenue_30d_series:   p?.revenue_30d ?? [],
      total_sales:          p?.total_sales ?? 0,
      top_products:         products,
    }
  }

  async trafficReport() {
    const [p, links, cats] = await Promise.all([
      this.profileRollup(),
      this.topLinks(10),
      this.topLinkCategories(5),
    ])
    return {
      total_views:    p?.total_views ?? 0,
      total_clicks:   p?.total_clicks ?? 0,
      clicks_trend:   p?.clicks_trend ?? trend([]),
      clicks_30d:     p?.clicks_30d ?? [],
      top_countries:  p?.top_countries ?? [],
      top_referrers:  p?.top_referrers ?? [],
      top_utms:       p?.top_utm_sources ?? [],
      top_links:      links,
      top_categories: cats,
    }
  }

  async contentReport() {
    const cms = await this.cmsRollup()
    return {
      by_category: cms,
      total_views: cms.reduce((a, c) => a + c.total_views, 0),
      total_submissions:  cms.find(c => c.category_id === 'cat_34')?.total_submissions ?? 0,
      total_applications: cms.find(c => c.category_id === 'cat_31')?.total_applications ?? 0,
      blog_posts:  cms.find(c => c.category_id === 'cat_35')?.total_published ?? 0,
      docs:        cms.find(c => c.category_id === 'cat_32')?.total_published ?? 0,
    }
  }

  // ── Back-compat — CEO / Business / Marketing still call .snapshot() ──────
  // Old shape: { profile, products: [{id,title,type,sales,revenue,rev30d}],
  //              links:    [{id,title,url,clicks,last7d}],
  //              forms:    [{id,title,views,submissions}] }
  // profile.revenue_trend returned a string ('+25%' / 'new' / 'no data').
  async snapshot() {
    await this.init()
    const [profile, products, links, forms] = await Promise.all([
      this.profileRollup(),
      this.topProducts(50),
      this.topLinks(50),
      this.formsSummary(),
    ])
    const legacyTrend =
      !profile?.revenue_trend || profile.revenue_trend.direction === 'new'
        ? 'new'
        : profile.revenue_trend.pct === null
        ? 'no data'
        : `${profile.revenue_trend.pct >= 0 ? '+' : ''}${profile.revenue_trend.pct}%`

    return {
      profile: profile && {
        total_clicks:  profile.total_clicks,
        total_sales:   profile.total_sales,
        total_revenue: profile.total_earnings,
        revenue_30d:   profile.revenue_30d,
        clicks_30d:    profile.clicks_30d,
        revenue_trend: legacyTrend,
        top_countries: profile.top_countries.map(x => [x.key, x.value] as [string, number]),
        top_referrers: profile.top_referrers.map(x => [x.key, x.value] as [string, number]),
      },
      products: products.map(p => ({
        id:      p.id,
        title:   p.title,
        type:    p.type,
        sales:   p.sales,
        revenue: p.revenue_cents,
        rev30d:  p.revenue_30d,
      })),
      links: links.map(l => ({
        id:     l.id,
        title:  l.title,
        url:    l.url,
        clicks: l.clicks,
        last7d: l.clicks_7d,
      })),
      forms,
    }
  }

  /** form_analytics top (for snapshot() compat). */
  private async formsSummary() {
    const { rows } = await db.execute({
      sql: `SELECT f.id, f.title,
                   fa.total_views AS views, fa.submissions
            FROM forms f
            LEFT JOIN form_analytics fa ON fa.form_id = f.id
            WHERE f.profile_id=? AND f.hidden=0
            ORDER BY fa.submissions DESC`,
      args: [this.profileId],
    })
    return rows.map(r => ({
      id:          r.id as string,
      title:       r.title as string,
      views:       Number(r.views       ?? 0),
      submissions: Number(r.submissions ?? 0),
    }))
  }
}

export const analyticsAgent = new AnalyticsAgent()
