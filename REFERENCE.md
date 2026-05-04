# Reference

> Load this when you need schema details, full routing rules, or agent architecture.
> Don't load at session start — load on demand.

---

## Full Agent Routing

| Request | Agent |
|---|---|
| "brief me" / "weekly update" / "what's happening" | CEO |
| "revenue" / "pricing" / "sales breakdown" | CBO |
| "content calendar" / "what should I write next" | CMO |
| "publish queue" / "what's scheduled" | COO |
| "write a post" / "blog" / "listicle" / "guide" / "vs article" | Blog Writer |
| "newsletter" / "email subscribers" | Newsletter Writer |
| "product description" / "landing page" / "bio" | Copywriter |
| "course" / "lessons" / "module" | Course Creator |
| "add product" / "launch" / "store item" | Store Manager |
| "job listing" / "hiring" / "applications" | Jobs Manager |
| "form" / "intake" / "survey" | Forms Builder |
| "docs" / "knowledge base" / "help article" | Docs Writer |
| "lead" / "contact" / "deal" / "outreach" | CRM Agent |
| "post to" / "social" / "tweet" / "LinkedIn" | Social Agent |
| "analytics" / "traffic" / "how many clicks" | Analytics Agent |
| "SEO" / "meta" / "keyword" / "LLM visibility" | SEO Agent |
| "schedule" / "publish queue" / "cron" | Scheduler |

**Direction:** C-Suite delegates to Creators. Creators never call C-Suite.

---

## Schema Quick Reference

### Content tables

All have: `profile_id, slug, title, content, excerpt, published, hidden, collection_id`

| Table | Extra columns |
|---|---|
| `posts` | seo_title, seo_description, content_type, word_count |
| `newsletter` | word_count, sent_count |
| `notes`, `guides` | word_count |
| `compare`, `alternative`, `prompt` | sources |
| `doc_collections` | INT AUTOINCREMENT id |
| `doc_articles` | INT AUTOINCREMENT id, collection_id |

### Products

```
type: download|course|meeting|webinar|event|listing|sponsorship|service
price_cents INT | slug UNIQUE | published | hidden=1 to archive
```

### CRM

```
crm_contacts: lead_score, icp_match, outreach_status, agent_status, auto_approve
crm_activities: approval_status (pending→approved|auto_sent|rejected) — append-only
crm_deals: stage (new|contacted|proposal|negotiation|won|lost)
crm_analytics: DB triggers manage this — NEVER write manually
```

### Social

```
social_accounts: connection_mode (zernio_byok|zernio_platform|direct|n8n)
social_posts: status, scheduled_for, zernio_post_id
Platform key NEVER used by agents — only via /api/social/schedule Worker endpoint
```

### Agent tables

```
agent_memory: rolling 20 rows — logMemory() after every action
agent_notes: inbox|processing|done|archived
agent_kb: slug+summary index, content on demand
agent_reports: append-only, push mid-session so nothing is lost
agent_tasks: pending|active|running|done|paused|failed|cancelled
```

### IDs and timestamps

```
ulid()  — most tables
omit id — doc_* (AUTOINCREMENT)
now()   = Math.floor(Date.now()/1000)  — INT timestamp columns
iso()   = new Date().toISOString().slice(0,19)+'Z'  — TEXT timestamp columns
```

### Seeded categories (never insert new ones)

```
cat_1=links  cat_15=startups  cat_18=courses  cat_19=downloads
Cat_31=jobs  Cat_32=docs  Cat_34=forms  Cat_35=blog
```

---

## Agent Roster

### C-Suite (`agents/csuite/`)

CEO → CMO, COO, CBO (all report to CEO)

### Creators (`agents/creators/`)

blog-writer, newsletter-writer, copywriter, course-creator,
store-manager, jobs-manager, forms-builder, docs-writer, crm-agent

### Growth (`agents/growth/`)

analytics-agent, seo-agent, social-agent, scheduler

---

## Phase 2 (in-app CF Worker)

```ts
// Only this changes between local CLI and in-app:
import { createAgentDB } from '~/lib/db.adapter'
const ceo = new CEO(createAgentDB(event))
```
