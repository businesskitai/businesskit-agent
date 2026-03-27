# Schema Reference

Full schema in CLAUDE.md. This file is the quick lookup for agent authors.

## Tables by Agent

| Agent | Reads | Writes |
|---|---|---|
| BLAKE | `posts` | `posts` |
| SAGE | `products` (type=course) | `products` |
| LEO | `products` (all types) | `products`, `product_analytics` (seed) |
| PEARL | `subscribers` | n8n webhook |
| COPY | `pages`, `products` | `pages`, `products`, `profiles` |
| JOB | `job_listings`, `job_applications` | `job_listings` |
| FELIX | `forms`, `questions`, `submissions` | `forms`, `questions`, `form_analytics` (seed) |
| DOC | `doc_collections`, `doc_articles` | `doc_collections`, `doc_articles` |
| ATLAS | all `*_analytics` tables | nothing |
| SCOUT | `posts`, `products`, `doc_articles`, `collections` | `collections` |
| HERMES | `profiles` | n8n webhook |
| OTTO | `posts`, `products`, `job_listings`, `pages` | published flag only |
| ARIA | all (via agents) | nothing directly |

## Timestamp Cheat Sheet

```ts
import { now, iso } from '../lib/id.ts'

// INTEGER columns (most tables)
created_at: now(),  updated_at: now()

// TEXT columns (posts, job_listings, forms, submissions, doc_*)
created_at: iso(),  updated_at: iso()
```

## Analytics JSON Shapes

```ts
analytics_7d:       number[]               // 7 daily counts, index 0 = oldest
analytics_lifetime: { "YYYY-MM": number }  // monthly totals
revenue_lifetime:   { "YYYY-MM": number }  // monthly revenue in cents
country_clicks:     { "US": 120, "IN": 80 }
```

## product.lessons JSON Shape

```ts
type Lesson = {
  id: string           // ulid
  title: string
  content?: string     // HTML or markdown
  video_url?: string
  duration_minutes?: number
  position: number     // 0-indexed
  free_preview?: boolean
}
// Stored as JSON.stringify(Lesson[]) in products.lessons
```
