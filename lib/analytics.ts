import { db } from './db.ts'

const parseArr = (v: unknown): number[] => { try { return JSON.parse(v as string) } catch { return [] } }
const parseObj = (v: unknown): Record<string, number> => { try { return JSON.parse(v as string) } catch { return {} } }
const top = (obj: Record<string, number>, n = 5) =>
  Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)

export async function profileSummary(profileId: string) {
  const { rows: [r] } = await db.execute({
    sql: 'SELECT * FROM profile_analytics WHERE profile_id=? LIMIT 1',
    args: [profileId],
  })
  if (!r) return null

  const rev30d   = parseArr(r.revenue_30d)
  const revLife  = parseObj(r.revenue_lifetime)
  const clicks30d = parseArr(r.analytics_30d)

  const half = Math.floor(rev30d.length / 2)
  const recent = rev30d.slice(half).reduce((a, b) => a + b, 0)
  const prior  = rev30d.slice(0, half).reduce((a, b) => a + b, 0)
  const revTrend = prior
    ? `${recent >= prior ? '+' : ''}${Math.round(((recent - prior) / prior) * 100)}%`
    : 'new'

  return {
    total_clicks:   (r.total_clicks as number) ?? 0,
    total_sales:    (r.total_sales as number) ?? 0,
    total_revenue:  Object.values(revLife).reduce((a, b) => a + b, 0),
    revenue_30d:    rev30d,
    clicks_30d:     clicks30d,
    revenue_trend:  revTrend,
    top_countries:  top(parseObj(r.country_clicks)),
    top_referrers:  top(parseObj(r.referrer_clicks)),
  }
}

export async function productSummary(profileId: string) {
  const { rows } = await db.execute({
    sql: `SELECT pa.*, p.title, p.type
          FROM product_analytics pa
          JOIN products p ON p.id = pa.product_id
          WHERE pa.profile_id=?
          ORDER BY pa.total_revenue_cents DESC`,
    args: [profileId],
  })
  return rows.map(r => ({
    id:      r.product_id as string,
    title:   r.title as string,
    type:    r.type as string,
    sales:   (r.total_sales as number) ?? 0,
    revenue: (r.total_revenue_cents as number) ?? 0,
    rev30d:  parseArr(r.revenue_30d),
  }))
}

export async function linkSummary(profileId: string, limit = 10) {
  const { rows } = await db.execute({
    sql: `SELECT la.link_id, la.total_clicks, la.analytics_7d, l.title, l.url
          FROM link_analytics la JOIN links l ON l.id = la.link_id
          WHERE la.profile_id=? ORDER BY la.total_clicks DESC LIMIT ?`,
    args: [profileId, limit],
  })
  return rows.map(r => ({
    id:      r.link_id as string,
    title:   r.title as string,
    url:     r.url as string,
    clicks:  (r.total_clicks as number) ?? 0,
    last7d:  parseArr(r.analytics_7d),
  }))
}

export async function formSummary(profileId: string) {
  const { rows } = await db.execute({
    sql: `SELECT f.id, f.title, fa.views, fa.submissions
          FROM forms f LEFT JOIN form_analytics fa ON fa.form_id = f.id
          WHERE f.profile_id=? AND f.hidden=0 ORDER BY fa.submissions DESC`,
    args: [profileId],
  })
  return rows
}
