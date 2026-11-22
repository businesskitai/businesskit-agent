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

### Content — unified `content` table

All blog/notes/guides/newsletter/compare/alternative/prompt/skills content lives in the single `content` table, keyed by `cms_id` (one row per section in `cms`, which has a `category_id`). There is no `posts`/`newsletter`/`notes`/... table.

Shared columns: `id, cms_id, category_id, profile_id, user_id, slug, title, content, excerpt, published, hidden, collection_id, seo_title (≤60), seo_description (≤160), seo_keywords, word_count, reading_time_mins, internal_links (int), sources JSON, created_at, updated_at`.

Resolve cms_id for a kind via `getCmsId(profileId, kind)` in `agents/content/content.ts`. The unique index is `(profile_id, category_id, slug)`.

Kind → category_id: blog=cat_35, notes=cat_37, guides=cat_36, newsletter=cat_20, compare=cat_40, alternative=cat_41, prompt=cat_39, skills=cat_38.

Docs are separate (INT AUTOINCREMENT ids): `doc_collections`, `doc_articles`.

### Products

```
type: download|course|meeting|webinar|event|listing|sponsorship|service
price_cents INT | slug UNIQUE | published | hidden=1 to archive
```

### Sales (CRM)

```
-- Contacts (dashboard route: /dashboard/contacts/[id]/)
crm_contacts:   lead_score(0-100), icp_match, outreach_status, agent_status,
                auto_approve, suggested_dm, conversation_thread JSON,
                agent_context JSON, is_duplicate, duplicate_of

-- Pipeline
crm_deals:      stage (new|contacted|proposal|negotiation|won|lost)
                value_cents, probability, expected_close_at, line_items JSON

-- Activity timeline — APPEND-ONLY, never UPDATE
crm_activities: approval_status (pending_approval→approved|auto_sent|rejected)
                direction (outbound|inbound), sender (agent|you|contact)
                type (dm|email|call|meeting|note|task_done|purchase|agent_action)

-- Supporting tables
crm_tasks:      status (open|done), due_at, priority
crm_notes:      pinned, body (rich text) — editable unlike activities
crm_groups:     name, icon — membership via crm_contact_groups junction table
                NEVER use LIKE '%grp_x%' — use lib/groups.ts helpers
crm_templates:  type (dm|email|follow_up|proposal), reply_rate_pct
crm_proposals:  public_slug, status (draft|sent|viewed|signed|paid|expired|declined)
                email_opened_at, email_open_count, email_clicked_at
crm_invoices:   invoice_number, public_slug, line_items JSON, total_cents
                email_opened_at, email_open_count, email_clicked_at
crm_imports:    source (csv|linkedin|twitter|apollo|agent), status
crm_analytics:  DB TRIGGERS manage ALL counters — NEVER write manually
                total_pending_approvals, reply_rate_pct, forecast_*_cents

-- Key rules for sales agent
1. approval_status='pending_approval' on ALL outbound activities — never auto_send
   unless contact.auto_approve=1
2. crm_activities is append-only — insert correcting row, never UPDATE
3. crm_analytics is trigger-managed — never INSERT or UPDATE
4. Groups: use lib/groups.ts not JSON LIKE queries
5. Proposals/invoices: email tracking columns written by email_events triggers
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
cat_31=jobs  cat_32=docs  cat_34=forms  cat_35=blog
```

---

## Agent Roster (18 agents)

### C-Suite

ceo (orchestrator, can_create=1, can_assign=1)
operations (can_assign=1), business

### Marketing

marketing, content, newsletter, copywriting, social, seo

### Operations

store, courses, hiring, forms, docs, scheduler, design

### Business

sales, analytics

**Reporting:** operations/business/marketing → ceo. All others → their group lead.

---

## Phase 2 (in-app CF Worker)

```ts
// Only this changes between local CLI and in-app:
import { createAgentDB } from '~/lib/db.adapter'
const ceo = new CEO(createAgentDB(event))
```
