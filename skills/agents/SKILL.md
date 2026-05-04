# Agent Roster

Every agent has a name, title, and clear domain. C-Suite orchestrates. Creators write. Growth distributes.

## C-Suite — Strategy & Intelligence

| Name | Title | Call when... |
|---|---|---|
| **ARIA** | CEO | Weekly briefing, cross-agent priorities, `aria.weeklyBriefing()` |
| **NOVA** | CMO | Content calendar, growth gaps, `nova.contentCalendar()` |
| **OTTO** | COO | Publish queue, draft pipeline, scheduling, `otto.draftPipeline()` |
| **REX** | CBO | Revenue report, pricing audit, upsell strategy, `rex.revenueReport()` |

## Creators — Content Production

| Name | Title | Table | Key method |
|---|---|---|---|
| **BLAKE** | Blog Writer | `posts` | `blake.create({ title, content })` |
| **PEARL** | Newsletter Writer | `subscribers` | `pearl.send({ subject, body_html })` |
| **COPY** | Copywriter | `pages`, `products.description` | `copy.createPage()`, `copy.updateProductCopy()` |
| **SAGE** | Course Creator | `products` (type=course) | `sage.create()`, `sage.addLesson()` |
| **LEO** | Store Manager | `products` (all other types) | `leo.create({ type, ... })` |
| **JOB** | Jobs Manager | `job_listings` | `job.create()` |
| **FELIX** | Forms Builder | `forms`, `questions` | `felix.create({ title, questions })` |
| **DOC** | Docs Writer | `doc_collections`, `doc_articles` | `doc.createArticle()` |

## Growth — Distribution & Intelligence

| Name | Title | Role |
|---|---|---|
| **SCOUT** | SEO Agent | Audits slugs/meta, sets collection SEO |
| **ATLAS** | Analytics Agent | Read-only analytics across all tables |
| **HERMES** | Social Agent | Posts to n8n → social platforms |
| **CRON** | Scheduler | Runs hourly/daily/weekly jobs (Phase 3: CF Workflows) |

## Store — Product Types via LEO

LEO handles all digital commerce. Pass `type` to select:

| Type | What it is |
|---|---|
| `download` | Digital file (PDF, ZIP, video) |
| `course` | Multi-lesson course — use SAGE instead for lesson management |
| `meeting` | 1:1 call (calendar_link required) |
| `webinar` | Live or recorded webinar |
| `event` | Ticketed event |
| `listing` | Platform listing (newsletter, community, etc.) |
| `sponsorship` | Sponsor slot with billing_interval |
| `service` | Custom or on-demand service |

## Composition Pattern

Agents call each other. Example: `/ceo` calls `analyticsAgent.snapshot()` + `blogWriter.summary()` + `storeManager.storeOverview()`.
NOVA calls BLAKE to draft posts. OTTO calls HERMES after publishing.

Never call C-Suite methods inside Creator agents. Dependency direction: C-Suite → Growth → Creators.
