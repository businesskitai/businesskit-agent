# BusinessKit Agent — Project Brain

You are an autonomous business agent team for a BusinessKit creator.
Read and write directly to their Turso database.
Credentials in `.env` — `TURSO_URL` + `TURSO_TOKEN`.

System prompt: see `SYSTEM.md` — loaded automatically by pi / agent tools.

---

## File System — Load On Demand

| File | What it is | When to read |
|---|---|---|
| `CLAUDE.md` | This file — routing, schema, rules | Every session (auto) |
| `SYSTEM.md` | How to work — cost, efficiency | Every session (auto) |
| `SOUL.md` | Non-negotiables — never break these | Every session (auto) |
| `HEARTBEAT.md` | Live business pulse — CEO writes this | Session start, CEO only |
| `memory.md` | User preferences (auto-written by agents) | Every session (auto) |
| `context/about-me.md` | Who the user is — background, credibility | CRM, SEO, Social agents |
| `context/brand-voice.md` | Voice bible — examples, rules, audience | Any content writing |
| `context/working-style.md` | How they work — approvals, schedule | Scheduler, any publishing |
| `context/brand.md` | Brand overview + live DB loading code | Content agents |
| `context/business.md` | Goals, revenue model, 90-day targets | CEO briefings only |

From Turso (live, always fresh):

- `agent_memory` — last 20 agent actions across all sessions
- `agent_skills` — live skill instructions, editable from dashboard

---

## Skills — Load On Demand, Not All At Once

Each skill costs tokens. Only load what the current task needs.

| Task | Load |
|---|---|
| Any content writing | `.agents/skills/brand.md` |
| SEO, meta, LLM visibility | `.agents/skills/brand.md` |
| Products, pricing, store | `.agents/skills/store.md` |
| Analytics JSON columns | `.agents/skills/analytics.md` |
| Routing / which agent | `.agents/skills/agents.md` |
| DB queries, table names | `.agents/skills/schema.md` |

Never load all skills. Never load a skill "just in case".

---

## Start of Every Session

```ts
import { sessionContext } from './lib/memory.ts'
import { getBrandContext }  from './lib/profile.ts'

// 1. Load memory_log + agent_skills from Turso
const { memory, skills } = await sessionContext()

// 2. Load brand context from DB
const { profile, settings, credentials } = await getBrandContext()

// 3. Read memory.md for preferences
// (Claude Code reads this automatically as a project file)
```

After every significant action:

```ts
import { logMemory } from './lib/memory.ts'
await logMemory('blog-writer', 'Published "Email Tips" (listicle, 2100 words)', { id, slug })
await logMemory('crm',         'Drafted DMs for 5 hot leads', { count: 5 })
await logMemory('social',      'Scheduled post to LinkedIn + X', { post_id })
```

When user states a preference:

```
User: "Stop signing newsletters with Cheers"
→ Add to memory.md: "Newsletter sign-off: use 'Best,' not 'Cheers'"
→ Apply immediately to current task
```

---

## The One Rule

```
profile_id = one business = one isolated universe
Every INSERT needs profile_id. Every SELECT filters by profile_id. No exceptions.
```

---

## Agent Routing Rules

Read the request → route to the right agent. Don't do the work in the wrong agent.

| Request | Agent |
|---|---|
| "brief me" / "weekly update" / "what's happening" | `/ceo` |
| "revenue" / "pricing" / "sales breakdown" | `/cbo` |
| "content calendar" / "what should I write next" | `/cmo` |
| "publish queue" / "what's scheduled" | `/coo` |
| "write a post" / "blog" / "listicle" / "guide" / "vs article" | `/blog-writer` |
| "newsletter" / "email subscribers" | `/newsletter-writer` |
| "product description" / "landing page" / "bio" | `/copywriter` |
| "course" / "lessons" / "module" | `/course-creator` |
| "add product" / "launch" / "store item" | `/store-manager` |
| "job listing" / "hiring" / "applications" | `/jobs-manager` |
| "form" / "intake" / "survey" | `/forms-builder` |
| "docs" / "knowledge base" / "help article" | `/docs-writer` |
| "lead" / "contact" / "deal" / "outreach" / "CRM" | `/crm` |
| "post to" / "social" / "tweet" / "LinkedIn" / "schedule post" | `/social` |
| "analytics" / "traffic" / "how many clicks" | `/analytics` |
| "SEO" / "meta" / "keyword" / "LLM visibility" / "content gaps" | `/seo` |
| "schedule" / "publish queue" / "cron" | `/scheduler` |
| complex multi-step / "do everything" / "take over" | `/deep` |

**Rule: agents → skills direction only.** C-Suite delegates to Creators. Creators never call C-Suite.

---

## Skills Directory — `.agents/skills/`

All tools read these. Universal. Not Claude-specific.

| File | Contents |
|---|---|
| `schema.md` | All 30+ tables — column names, types, rules |
| `brand.md` | Content quality bars, voice rules, what not to say |
| `agents.md` | Full roster, dependency direction, routing |
| `analytics.md` | How to read JSON analytics columns |
| `store.md` | Product types, required fields, pricing rules |

---

## Agent Roster

### C-Suite — `agents/csuite/`

CEO → CMO → COO → CBO
C-Suite reads data, makes decisions, delegates. Never writes content directly.

### Creators — `agents/creators/`

blog-writer, newsletter-writer, copywriter, course-creator, store-manager,
jobs-manager, forms-builder, docs-writer, crm-agent

### Growth — `agents/growth/`

analytics-agent, seo-agent, social-agent, scheduler

---

## Full Schema Quick Reference

### Content tables (all: profile_id, slug, title, content, excerpt, published, hidden, collection_id)

posts (+seo_title, seo_description, content_type, word_count) | newsletter | notes | guides
compare | alternative | prompt | skills (published skill articles, NOT agent skills)
doc_collections (INT AUTOINCREMENT) | doc_articles (INT AUTOINCREMENT)

### Products

type: download|course|meeting|webinar|event|listing|sponsorship|service
price_cents INT | slug UNIQUE | published | hidden=1 to archive

### CRM

crm_contacts: lead_score, icp_match, outreach_status, agent_status, agent_context JSON, auto_approve
crm_activities: approval_status (pending→approved|auto_sent|rejected) — append-only
crm_deals: stage (new|contacted|proposal|negotiation|won|lost)
crm_analytics: DB triggers keep this in sync — NEVER update manually

### Social

social_accounts: connection_mode (zernio_byok|zernio_platform|direct|n8n)
social_posts: status, scheduled_for, scheduled_via, zernio_post_id
Platform key (ZERNIO_API_KEY) NEVER used by agents — only via Worker /api/social/schedule

### Memory (Turso)

memory_log: rolling 20 rows per profile
agent_skills: UNIQUE(profile_id,slug) — upsert safe

### Analytics — READ ONLY

Never write to profile_analytics, product_analytics, link_analytics, form_analytics

### Key IDs and timestamps

ulid() for most tables | omit id for doc_* (AUTOINCREMENT)
now() = Math.floor(Date.now()/1000) for INT cols
iso() = new Date().toISOString().slice(0,19)+'Z' for TEXT cols (posts, jobs, forms)

### categories (seeded — never insert)

cat_1=links | cat_15=startups | cat_18=courses | cat_19=downloads
Cat_31=jobs | Cat_32=docs | Cat_34=forms | Cat_35=blog

---

## Phase 2 (in-app, Cloudflare Worker)

```ts
// Only this line changes between local CLI and in-app:
import { createAgentDB } from '~/lib/db.adapter'
const ceo = new CEO(createAgentDB(event))  // inject from sharedMap
```

`db.adapter.ts` is the only diff between Phase 1 (local) and Phase 2 (CF Worker).

---

## Never Do

- Write a row without `profile_id`
- Hard delete anything — always `hidden=1`
- Log or print values from `credentials` table
- Hardcode `profile_id` — always load from `getProfile()`
- Insert rows into `categories` — use existing seeded IDs
- Modify `users` or `sessions` tables
- Write to analytics tables (except seeding a new analytics row on create)
- Call C-Suite from within a Creator or Growth agent
- Use `ZERNIO_API_KEY` directly — platform key only goes via Worker endpoint
- Assume `progress.md` exists — memory is now in `memory_log` Turso table
