# BusinessKit Agent — Project Memory

You are an autonomous business agent team for a BusinessKit user.
Every user owns their Turso database. You read/write directly via `TURSO_URL` + `TURSO_TOKEN` in `.env`.

---

## Start of Every Session

1. Read `progress.md` for cross-session memory:

```ts
import { readProgress } from './lib/progress.ts'
const memory = readProgress()
```

2. Load brand context:

```ts
import { getBrandContext } from './lib/profile.ts'
const { profile, settings, credentials } = await getBrandContext()
```

---

## The One Rule

```
profile_id = one business = one isolated universe
Every write needs profile_id. Every query filters by profile_id. No exceptions.
```

---

## Agent Roster

### C-Suite — `agents/csuite/`

| File | Title | Primary method |
|---|---|---|
| `ceo.ts` | CEO | `weeklyBriefing()` |
| `cmo.ts` | CMO | `contentCalendar()` |
| `coo.ts` | COO | `draftPipeline()`, `runPublishQueue()` |
| `cbo.ts` | CBO | `revenueReport()` |

### Creators — `agents/creators/`

| File | Title | Writes to |
|---|---|---|
| `blog-writer.ts` | Blog Writer | `posts` |
| `newsletter-writer.ts` | Newsletter Writer | `subscribers` + email |
| `copywriter.ts` | Copywriter | `pages`, `products.description` |
| `course-creator.ts` | Course Creator | `products` (type=course) |
| `store-manager.ts` | Store Manager | `products` (all other types) |
| `jobs-manager.ts` | Jobs Manager | `job_listings` |
| `forms-builder.ts` | Forms Builder | `forms`, `questions` |
| `docs-writer.ts` | Docs Writer | `doc_collections`, `doc_articles` |

### Growth — `agents/growth/`

| File | Title | Role |
|---|---|---|
| `analytics-agent.ts` | Analytics Agent | Read-only, all analytics tables |
| `seo-agent.ts` | SEO Agent | `collections`, slugs, meta |
| `social-agent.ts` | Social Agent | Direct post to X, LinkedIn, Facebook, Instagram |
| `scheduler.ts` | Scheduler | Publish queue, cron jobs |

### Dependency direction

```
C-Suite → calls → Growth → calls → Creators → calls → lib/
Never reverse. Creators never call C-Suite.
```

---

## Slash Commands — `.claude/commands/`

| Command | Agent | Does |
|---|---|---|
| `/ceo` | CEO | Weekly briefing |
| `/cmo` | CMO | Content calendar |
| `/coo` | COO | Publish queue + pipeline |
| `/cbo` | CBO | Revenue report |
| `/blog-writer` | Blog Writer | Create/list posts |
| `/newsletter-writer` | Newsletter Writer | Write/send newsletter |
| `/copywriter` | Copywriter | Pages + product copy |
| `/course-creator` | Course Creator | Build courses |
| `/store-manager` | Store Manager | Add products to store |
| `/jobs-manager` | Jobs Manager | Post job listings |
| `/forms-builder` | Forms Builder | Build forms |
| `/docs-writer` | Docs Writer | Write docs articles |
| `/analytics` | Analytics Agent | Full snapshot |
| `/seo` | SEO Agent | Audit + fix |
| `/social` | Social Agent | Post to platforms |
| `/scheduler` | Scheduler | Run publish queue |
| `/deep` | CEO (orchestrator) | Deep Mode: plan + delegate to full team |

---

## Skills — `.claude/skills/` (auto-loaded)

| File | Contents |
|---|---|
| `schema.md` | Table quick-ref, which agent writes where |
| `brand.md` | Voice, tone, content quality bars |
| `store.md` | All product types, required fields, pricing |
| `analytics.md` | How to read JSON analytics columns |
| `agents.md` | Agent roster, dependency direction |

---

## Deep Mode + Harness

### Deep Mode (`/deep`)

CEO activates multi-step planning. Writes todo list. Delegates to team. Logs to `progress.md`.

### Domain Harnesses

Structured phase workflows where the **system** controls step order. LLM cannot skip phases.

| Harness | Trigger | Phases |
|---|---|---|
| Publish Blog Post | `/blog-writer publish` | 7 phases: load → brand → SEO → fix → confirm → publish → social |
| Launch Product | `/store-manager launch` | 7 phases: load → copy → improve → price → confirm → launch → announce |
| Send Newsletter | `/newsletter-writer send` | 5 phases: audience → draft → personalize → confirm → send |
| CEO Briefing | `/ceo` or cron | 7 phases: analytics → inventory → revenue → priorities → write → deliver → progress |
| Post Job | `/jobs-manager post` | 5 phases: load → check → improve → confirm → publish |

Full harness spec: see `PRD-Agent-Harness.md`

---

## Session Memory (`progress.md`)

Local file. Persists across sessions. Gitignored.

```ts
import { logAction, setBriefingSummary, setOpenItems, readProgress } from './lib/progress.ts'

// Read at session start
const memory = readProgress()

// Log after every significant action
await logAction('Published "Email Tips" (post id: 01JXX)')
await logAction('Launched "Email Course" at $49 (id: 01JYY)')
await logAction('Sent newsletter "March Edition" to 284 subscribers')

// Update after CEO briefing
await setBriefingSummary({ revenue_30d: '$4,200', revenue_trend: '+18%', top_product: 'Email Course', total_clicks: 1240 })

// Record open items for next session
await setOpenItems([
  '3 posts missing SEO excerpts → run /seo',
  'Course has 0 sales → price review needed',
])
```

---

## ID Rules

| Table | ID type | How |
|---|---|---|
| Most tables | TEXT (ULID) | `import { ulid } from './lib/id.ts'` |
| `doc_collections` | INTEGER AUTOINCREMENT | omit id on insert |
| `doc_articles` | INTEGER AUTOINCREMENT | omit id on insert |
| `*_analytics` rows | TEXT = parent id | same value as product/link/form/profile id |

---

## Timestamp Rules

```ts
import { now, iso } from './lib/id.ts'

// INTEGER columns (most tables)
created_at: now()   // Math.floor(Date.now() / 1000)

// TEXT columns (posts, job_listings, forms, submissions, doc_*)
created_at: iso()   // '2026-03-22T09:00:00Z'
```

---

## published / hidden Pattern

```
Draft:    published=0, hidden=0  ← default on create
Live:     published=1, hidden=0
Archived: hidden=1               ← NEVER hard delete
```

---

## Full Schema

### profiles

```
id, user_id, slug, title, bio, tagline, avatar_url,
navigation_menu JSON, enabled_categories JSON,
social_links JSON, collect_emails JSON,
logo_url, site_title, timezone, working_hours JSON, location JSON
```

### credentials (read-only — never log values)

```
-- Email
resend_api_key, ses_access_key, ses_secret_key, ses_region, ses_from_email
-- LLMs
anthropic_api_key, openai_api_key, gemini_api_key
-- X / Twitter
twitter_api_key, twitter_api_secret, twitter_access_token, twitter_access_secret
-- LinkedIn
linkedin_access_token, linkedin_person_urn
-- Facebook
facebook_page_id, facebook_page_token
-- Instagram
instagram_account_id, instagram_access_token
-- Automation
n8n_webhook_url
```

### posts

```
id TEXT, profile_id, user_id, slug, title, content, excerpt,
hero_image_url, cta_button_url, cta_button_text,
additional_details JSON, published INT, hidden INT,
date TEXT, created_at TEXT, updated_at TEXT
```

### products (all store items)

```
id TEXT, profile_id, user_id,
type: 'download'|'course'|'meeting'|'webinar'|'event'|'listing'|'sponsorship'|'service',
title, excerpt, description, price_cents INT, sale_price_cents INT, currency,
slug UNIQUE, thumbnail_url, file_url,
lessons JSON, total_lessons INT, duration_minutes,
calendar_link, scheduling_provider, webinar_link, webinar_platform,
webinar_schedule JSON, webinar_settings JSON, event_settings JSON,
meeting_settings JSON, billing_interval, features JSON, tags JSON,
button_text, platform_name, platform_url, post_frequency, cta_button JSON,
is_active INT, published INT, hidden INT,
created_at INT, updated_at INT, published_at INT, archived_at INT
```

### job_listings

```
id TEXT, profile_id, user_id, title, company, location,
location_type: 'remote'|'onsite'|'hybrid',
employment_type: 'full-time'|'part-time'|'contract'|'freelance',
salary_min INT, salary_max INT, salary_currency,
excerpt, description, requirements, slug, image_url,
total_applicants INT, expires_at TEXT,
published INT, hidden INT, created_at TEXT, updated_at TEXT
```

### forms + questions + submissions

```
forms: id, profile_id, title, slug, published, hidden, thank_you_settings JSON, created_at TEXT
questions: id, form_id, type, title, description, position INT, options JSON,
  embed_url, required INT, settings JSON
  types: text|email|select|multiselect|rating|date|file|url|embed
submissions: id, form_id, answers JSON, status, device, country, created_at TEXT
form_analytics: form_id PK, views, starts, submissions, trends_7d JSON, lifetime JSON
```

### doc_collections + doc_articles (AUTOINCREMENT — omit id on insert)

```
doc_collections: id INT AUTO, slug, title, description, icon, sort_order, is_default, created_at TEXT
doc_articles: id INT AUTO, collection_id, profile_id, user_id, slug, title,
  excerpt, body, published INT, views INT, votes_json JSON, created_at TEXT, updated_at TEXT
```

### analytics tables (read via analytics-agent — never write directly)

```
profile_analytics: profile_id UNIQUE, total_clicks, total_sales, total_earnings,
  analytics_7d JSON, analytics_30d JSON, analytics_12m JSON,
  analytics_lifetime JSON { "YYYY-MM": count },
  revenue_30d JSON, revenue_12m JSON, revenue_lifetime JSON { "YYYY-MM": cents },
  country_clicks JSON, referrer_clicks JSON

product_analytics: product_id UNIQUE, profile_id,
  total_sales, total_revenue_cents,
  sales_30d JSON, revenue_30d JSON, revenue_lifetime JSON

link_analytics: link_id UNIQUE, profile_id,
  total_clicks, analytics_7d JSON, analytics_lifetime JSON
```

### subscribers

```
id, profile_id, email, name, referrer_domain, timezone,
browser_name, os_name, device_type, ip_address, country, city,
signup_timestamp INT
```

### pages

```
id, profile_id, user_id, title, slug, excerpt, text_field,
hero_section JSON, cta_section JSON, testimonials JSON, faq JSON, pricing JSON,
intro_section JSON, about_section JSON, people_section JSON, curriculum JSON,
published INT, hidden INT, is_active INT, order_index INT,
created_at INT, updated_at INT
```

### links

```
id, profile_id, category_id, title, url, description, image_url,
order_index INT, is_active INT, keywords, hidden_from_profile INT,
sale_price, price, button_text, location, date, video_url,
logo_url, post_url, platform_name, created_at INT, updated_at INT
```

### purchases

```
id, profile_id, user_id, product_id, email, customer_name,
amount_cents, platform_fee_cents, currency, payment_processor,
payment_status, status, access_token UNIQUE,
course_progress JSON, course_completed INT,
rating_star INT, rating_review TEXT, approval_status,
device, os, browser, country, city,
created_at INT, updated_at INT
```

### gateways

```
id, profile_id, provider, is_active INT, is_test_mode INT,
credentials JSON, created_at INT
UNIQUE on (profile_id, provider)
```

### settings

```
id, site_title, logo_url, theme JSON, created_at INT, updated_at INT
```

### categories (seeded — never insert new rows)

```
id TEXT, name, slug UNIQUE, description, order_index INT
Key IDs: cat_1=links, cat_15=startups, cat_18=courses, cat_19=downloads,
cat_23=featured, cat_24=webinar, cat_25=services,
Cat_31=jobs, Cat_32=docs, Cat_34=forms, Cat_35=blog
```

---

## Phase 2 — Same Code in Qwik App

```ts
// Instead of process.env, inject from sharedMap:
import { createAgentDB } from '~/lib/db.adapter'
const ceo = new CEO(createAgentDB(event))
return ceo.weeklyBriefing()
```

`db.adapter.ts` is the only diff between local and CF Worker usage.

---

## Never Do

- Write a row without `profile_id`
- Hard delete — always `hidden=1`
- Log values from `credentials` table
- Hardcode `profile_id` — always load from `getProfile()`
- Insert new `categories` rows — use existing seeded IDs
- Modify `users` or `sessions` tables
- Write to analytics tables (except seed rows on create)
- Call C-Suite from within a Creator agent
