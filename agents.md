# Agent Roster + Routing Rules

## When to use an agent vs a skill
- **Use an agent** when the task requires synthesizing multiple data sources, making decisions, or coordinating across tables
- **Use a skill directly** when the task is purely executional and straightforward

## Agent routing

| User says... | Route to |
|---|---|
| "brief me" / "what's happening" / "weekly update" | CEO |
| "revenue" / "how are sales" / "pricing" | CBO |
| "content calendar" / "what should I write" / "growth" | CMO |
| "publish queue" / "what's scheduled" / "pipeline" | COO |
| "write a post" / "blog" / "article" / "guide" | Blog Writer |
| "newsletter" / "email my subscribers" | Newsletter Writer |
| "product description" / "landing page" / "copy" | Copywriter |
| "course" / "lessons" | Course Creator |
| "add product" / "store" / "launch" | Store Manager |
| "job listing" / "hiring" | Jobs Manager |
| "build a form" / "intake form" | Forms Builder |
| "docs" / "knowledge base" / "article" | Docs Writer |
| "lead" / "contact" / "deal" / "outreach" / "pipeline" / "CRM" | CRM Agent |
| "post to" / "social" / "schedule" / "LinkedIn" / "Twitter" / "Instagram" | Social Agent |
| "analytics" / "traffic" / "clicks" / "revenue breakdown" | Analytics Agent |
| "SEO" / "meta" / "keyword" / "LLM visibility" / "content gaps" | SEO Agent |
| "schedule" / "publish queue" / "cron" | Scheduler |
| "do everything" / "take over" / "weekly work" | Deep Mode (CEO orchestrates) |

## Agent dependency direction
```
C-Suite (CEO, CMO, COO, CBO)
    ↓ delegates to
Growth (Analytics, SEO, Social, Scheduler)
    ↓ and
Creators (Blog, Newsletter, Copywriter, Course, Store, Jobs, Forms, Docs, CRM)
    ↓ uses
lib/ (db, memory, profile, id, slug)
```
**Never reverse.** Creators never call C-Suite. Growth never calls C-Suite.

## C-Suite agents
- **CEO** — reads analytics + memory → writes priorities → delegates. Never writes content directly.
- **CMO** — content strategy, calendar, gap analysis. Delegates writing to creators.
- **COO** — publish queue, scheduling. Moves things from draft → scheduled → published.
- **CBO** — revenue analysis, pricing recommendations. Read-only analytics.

## Creator agents
- **Blog Writer** — writes to posts, compare, alternative, prompt, notes, guides, newsletter tables
- **Newsletter Writer** — writes newsletter content + sends via SES/Resend
- **Copywriter** — writes pages, product descriptions, profile bio/tagline
- **Course Creator** — products (type=course) + lessons JSON
- **Store Manager** — all other product types
- **Jobs Manager** — job_listings + job_applications
- **Forms Builder** — forms + questions + seeds form_analytics
- **Docs Writer** — doc_collections + doc_articles (AUTOINCREMENT ids)
- **CRM Agent** — full pipeline: add → enrich → score → draft → approve → send → follow-up

## Growth agents
- **Analytics Agent** — read-only. Never writes to analytics tables.
- **SEO Agent** — audits content, fixes seo_title/seo_description, tracks LLM visibility
- **Social Agent** — posts via Zernio (BYOK) or n8n. Writes social_posts + social_post_platforms.
- **Scheduler** — runs publish queue, manages scheduled_for dates