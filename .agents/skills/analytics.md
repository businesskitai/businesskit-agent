# /analytics-agent — Analytics Snapshot - Reading Analytics

All analytics columns are JSON stored as TEXT. Always parse before use.

## Column Shapes

```ts
// Time-series arrays (index 0 = oldest)
analytics_7d:  number[]   // 7 daily values
analytics_30d: number[]   // 30 daily values
analytics_12m: number[]   // 12 monthly values

// Lifetime map (key = 'YYYY-MM')
analytics_lifetime: { [month: string]: number }
revenue_lifetime:   { [month: string]: number }  // in cents

// Breakdown maps (key = country/browser/etc, value = count)
country_clicks:  { [country: string]: number }
referrer_clicks: { [referrer: string]: number }
device_clicks:   { [device: string]: number }
```

## Common Patterns

```ts
import { profileSummary } from '../../lib/analytics.ts'
const snap = await profileSummary(profileId)

// Total revenue in dollars
const totalUSD = (snap.total_revenue / 100).toFixed(2)

// Revenue trend: compare last 15 days vs prior 15 days
const rev30d   = snap.revenue_30d
const recent   = rev30d.slice(15).reduce((a, b) => a + b, 0)
const prior    = rev30d.slice(0, 15).reduce((a, b) => a + b, 0)
const trend    = prior > 0 ? `${Math.round((recent - prior) / prior * 100)}%` : 'new'

// Top country
const topCountry = snap.top_countries[0]?.[0] ?? 'Unknown'

// Monthly revenue for a chart
const months = Object.entries(snap.revenue_lifetime)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([month, cents]) => ({ month, revenue: cents / 100 }))
```

## ATLAS is the canonical reader

Use `atlas.snapshot()`, `atlas.revenueReport()`, `atlas.trafficReport()` instead of raw queries.
Only query analytics tables directly if you need something ATLAS doesn't expose.

## Never write to analytics tables

Analytics tables are written by the BusinessKit platform (CF queue consumer).
Agents are read-only consumers of analytics data.
