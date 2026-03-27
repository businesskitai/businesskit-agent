# BusinessKit Agent

Autonomous business agent team. SQL queries against the user's Turso DB.

## Setup

Copy `.env.example` → `.env` with TURSO_URL + TURSO_TOKEN, then `npm install`.

## How agents work

Each agent is a TypeScript class that runs SQL against the user's Turso DB and returns structured data. No LLM calls inside agents — you are the LLM.

## Run an agent

```bash
npx tsx cli.ts ceo              # CEO weekly briefing
npx tsx cli.ts blog-writer      # list blog posts
npx tsx cli.ts store-manager    # list products
npx tsx cli.ts scheduler hourly # run publish queue
```

## Agent roster

- **CEO** `agents/csuite/ceo.ts` — weekly briefing, orchestration
- **CMO** `agents/csuite/cmo.ts` — content calendar, growth strategy
- **COO** `agents/csuite/coo.ts` — publish queue, scheduling
- **CBO** `agents/csuite/cbo.ts` — revenue, pricing
- **Blog Writer** `agents/creators/blog-writer.ts` — posts table
- **Newsletter Writer** `agents/creators/newsletter-writer.ts` — subscribers + email
- **Copywriter** `agents/creators/copywriter.ts` — pages, descriptions
- **Course Creator** `agents/creators/course-creator.ts` — products type=course
- **Store Manager** `agents/creators/store-manager.ts` — all product types
- **Jobs Manager** `agents/creators/jobs-manager.ts` — job_listings
- **Forms Builder** `agents/creators/forms-builder.ts` — forms + questions
- **Docs Writer** `agents/creators/docs-writer.ts` — doc_collections + doc_articles
- **Analytics Agent** `agents/growth/analytics-agent.ts` — read-only analytics
- **SEO Agent** `agents/growth/seo-agent.ts` — slugs, meta, collections
- **Social Agent** `agents/growth/social-agent.ts` — direct posting via credentials table
- **Scheduler** `agents/growth/scheduler.ts` — publish queue cron

## Skills

Universal skills live in `.agents/skills/` — loaded by all tools (Gemini CLI, Codex, Antigravity, Claude Code).

See:
- `.agents/skills/schema.md` — full table reference
- `.agents/skills/brand.md` — voice, tone, quality bars
- `.agents/skills/store.md` — product types + commerce rules
- `.agents/skills/analytics.md` — reading JSON analytics columns
- `.agents/skills/agents.md` — agent roster + dependency direction

Claude-specific overrides go here in `.claude/skills/` if needed.

## Key rule

Every write scopes to `profile_id`. Never write without it. Never hard delete — use `hidden=1`.

## Full schema

See `CLAUDE.md` for complete table definitions.
