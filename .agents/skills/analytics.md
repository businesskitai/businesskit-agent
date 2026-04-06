# Analytics Skill — Reading the Data

## How analytics columns work

All analytics are stored as JSON in TEXT columns. Parse with JSON.parse().

### Time series arrays
```
analytics_7d  = [n, n, n, n, n, n, n]     → last 7 days, oldest first
analytics_30d = [n, n, ..., n]              → last 30 days
analytics_12m = [n, n, ..., n]              → last 12 months
analytics_24h = [n, n, ..., n]              → last 24 hours (hourly)
```

### Lifetime object
```
analytics_lifetime = { "2026-03": 142, "2026-04": 89, ... }
revenue_lifetime   = { "2026-03": 42000, "2026-04": 15000, ... }
// values are counts (clicks) or cents (revenue)
```

### Breakdown objects (country, device, referrer)
```
country_clicks  = { "US": 420, "GB": 88, "IN": 45, ... }
device_clicks   = { "mobile": 312, "desktop": 201 }
referrer_clicks = { "twitter.com": 88, "direct": 204, ... }
```

## Key metrics to surface in briefings

**Traffic**: total_clicks, top country, top referrer, 30d trend (compare last 30d vs prior 30d)
**Revenue**: total_earnings (cents → divide by 100), total_sales count, top product by revenue
**Content**: posts published this month, drafts waiting, newsletter subscribers
**Social**: posts published, scheduled, accounts connected

## Revenue trend calculation
```ts
const months = Object.entries(revenue_lifetime).sort()
const last   = months.slice(-1)[0]?.[1] ?? 0
const prior  = months.slice(-2,-1)[0]?.[1] ?? 0
const trend  = prior > 0 ? ((last - prior) / prior * 100).toFixed(1) + '%' : 'N/A'
```

## Never write to analytics tables
Analytics are updated by the app on user actions (clicks, purchases).
Agents read analytics. The app writes analytics. Never reverse this.
Exception: seed a product_analytics or link_analytics row when creating a new product/link.