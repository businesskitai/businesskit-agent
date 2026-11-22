# Agent Repo — Build Spec for All Commands & Skills

**Audience**: Claude Sonnet, building out `.claude/commands/` and `.claude/skills/` in the agent repo.
**Template source**: `/Users/2.o/qwik-claw/crm.md` — this is the canonical shape for every command file. Every other command should match its structure: architecture diagram, tables used, "session start" queries, then action-by-action SQL patterns with agent rules at the end.
**Pair with**: `agent-repo-task.md` (safety fixes — idempotency, transactions, audit, enums).

Two rules before you start:

1. **Follow `crm.md`'s shape exactly.** Same headers, same order. Users run multiple agents and command UX needs to feel identical across domains. Don't invent new section names.
2. **Every SQL example must honor the P0 rules in `agent-repo-task.md`** — transactions via `client.batch(..., 'write')`, idempotency keys on INSERT, enums from `lib/enums.ts`, numeric bounds validated before write, retry on SQLITE_BUSY, one `agent_audit` row per mutation. If an example in this doc shows a bare `INSERT` or `UPDATE`, translate it to the safe pattern before shipping.

---

## File layout

```
.claude/
├── skills/                     ← auto-loaded every conversation
│   ├── SYSTEM.md               ← master rules (NEW — supersedes parts of CLAUDE.md)
│   ├── schema.md               ← canonical table list + column pointers
│   ├── enums.md                ← allowed status/type values (mirrors lib/enums.ts)
│   ├── brand.md                ← points to context/brand-voice.md + about-me.md
│   ├── store.md                ← products table: the 7 product types + their fields
│   ├── analytics.md            ← which tables are singleton, which are raw-event, which is view
│   ├── agents.md               ← how BaseAgent works, audit, idempotency, transactions
│   └── on-demand/              ← loaded only when matching command runs
│       ├── crm-deep.md
│       ├── social-deep.md
│       ├── community-deep.md
│       ├── ads-deep.md
│       ├── feedback-deep.md
│       └── gsc-deep.md
│
└── commands/
    ├── ceo.md             ├── blog-writer.md       ├── analytics.md
    ├── cmo.md             ├── newsletter-writer.md ├── seo.md
    ├── coo.md             ├── copywriter.md        ├── social.md
    ├── cbo.md             ├── course-creator.md    ├── scheduler.md
    ├── crm.md             ├── store-manager.md     ├── ingest.md
    │                      ├── jobs-manager.md      ├── kb.md
    │                      ├── forms-builder.md     ├── compress.md
    │                      └── docs-writer.md       └── resume.md
```

---

## The template every command file must follow

```markdown
# /{command-name} — {short description}

{one-sentence purpose.}
Reads/writes directly to Turso UserDB. DB triggers keep analytics accurate automatically.

---

## Architecture

```
You/Agent writes → Turso DB → Triggers fire → {domain}_analytics always accurate
                                            → No app server needed
```

**{N} DB triggers** handle scalar analytics in real-time:
- {trigger 1 — what it does}
- {trigger 2}
- ...

**JSON breakdowns** aggregate on analytics page visit (lazy, no cron).

---

## Tables

| Table | Purpose |
|---|---|
| ... |

---

## Session start

```
/{command}
```

Always run this first (these 3–5 queries set context for every downstream action):

```ts
// 1. Domain summary (always from the singleton analytics table)
SELECT * FROM {domain}_analytics LIMIT 1

// 2. Pending approvals (agent is waiting on user)
// 3. Due today / due now
// 4. Hot-priority items for agent to act on
```

---

## {Domain sections, e.g. Contacts, Outreach, Deals, Tasks, Proposals, Invoices, Groups, Analytics}

Each section shows:
- Action verb (add, update, move, approve, reject, pause, archive)
- Context load query first (read before write — see crm.md L97–128)
- Then the write, always wrapped as `await client.batch([...], 'write')` via BaseAgent.txn()
- Comment stating what trigger fires as a result

---

## Context API (Sondex-equivalent)

Before every agent action: one query that loads all context in parallel.

---

## Agent Rules

1. Always check `{domain}_paused` before acting
2. Always check `{domain}_instructions` for per-entity overrides
3. Always read context before writing
4. Always set required trigger fields (status, direction, sender, type)
5. Use `pending_approval` unless `auto_approve = 1`
6. {append-only rules — never UPDATE append-only tables}
7. {enum rules — only values from lib/enums.ts}
8. {transaction rules — multi-statement writes must be batch}
9. {idempotency rules — retry with same key}
10. {audit rules — always write agent_audit row}

---

## Connecting {domain} to other tables

Cross-joins via email / user_id / profile_id.
```

Now the per-command specs.

---

## 1. `/ceo` — C-Suite weekly briefing

**File**: `.claude/commands/ceo.md`

**Purpose**: 60-second weekly read. Revenue pulse, pipeline, pending approvals across all agents, priorities for the week.

**Tables read** (no writes except `agent_reports` + `agent_audit`):
- `profile_analytics` — revenue, traffic, top products
- `product_analytics` — top-selling products last 7d
- `crm_analytics` — pipeline + pending approvals
- `social_analytics` — follower growth, best-performing post
- `community_analytics` — member growth, active %
- `feedback_boards` / `feedback_posts` — top voted last 7d
- `agent_reports` — what each agent did last week
- `agent_tasks` — status='pending' across agents
- `subscribers` — net new subscribers

**Session start**:

```ts
// Single batch of reads, in parallel via Promise.all
const [analytics, crm, products, pipeline, social, community, agentWork, pending]
  = await Promise.all([...]);
```

**Output shape** (always the same, for consistency):

1. **Revenue this week** — total_earnings delta vs last week
2. **Top 3 wins** — biggest deals won, top products, best social post
3. **Pipeline** — open deals × forecast
4. **Pending approvals across agents** (with direct `/crm approve`, `/social approve` links)
5. **Top 3 priorities for next 7 days** — based on agent_tasks + high-score leads + scheduled content
6. **What each agent did last week** — from agent_reports
7. **Stale / at-risk** — leads gone cold, deals past expected_close, unpublished drafts

**Writes**:
- One `agent_reports` row (status='completed', content=briefing as JSON, agent_type='ceo')
- One `agent_audit` row
- Optional: `agent_notes` rows of type='briefing' for anything worth saving to KB

**Rules to document in the .md**:
- Read-only on business data. CEO never writes to CRM/social/etc. Tells user what to do.
- Always reference exact numbers with comparisons ("$4,200 this week, +18% vs last")
- Never invent metrics — if data is missing, say so

---

## 2. `/cmo` — Marketing strategy + content calendar

**File**: `.claude/commands/cmo.md`

**Purpose**: content strategy, calendar review, campaign planning, growth analysis.

**Tables**:
- `content` (or current 10 tables — after unification) — what's drafted vs published
- `social_posts` + `social_queue` — scheduled + gaps
- `newsletter_stats` + `subscribers` — list growth, open rates
- `gsc_queries` / `ga4_snapshots` — traffic sources, top content
- `profile_analytics.referrer_clicks` — acquisition channels
- `feedback_posts` — what users want (source of content ideas)

**Session start**:

```ts
// 1. Content calendar for next 30 days
SELECT id, type, title, slug, published, created_at, updated_at
FROM content
WHERE profile_id = ? AND published = 0
ORDER BY updated_at DESC LIMIT 20

// 2. Queue gaps (next 14 days with no scheduled posts)
// 3. Top-performing content last 30d (GSC + internal analytics)
// 4. Feedback posts trending (potential content topics)
// 5. Newsletter: last send, open rate, subscriber delta
```

**Actions**:
- Plan content (insert draft `content` rows of appropriate type — uses Blog/Newsletter/etc. writers under the hood)
- Queue social posts for upcoming launches
- Review campaign performance (read-only)
- Create `agent_tasks` with scheduled_at for calendar entries

**Writes**:
- `content` rows (status='draft', published=0)
- `social_queue` slots
- `agent_tasks`, `agent_notes` (type='strategy')

**Cross-agent orchestration**: CMO delegates writing to `/blog-writer`, posting to `/social`, newsletter to `/newsletter-writer`. CMO never writes the content itself — it plans.

---

## 3. `/coo` — Operations, publish queue, scheduling

**File**: `.claude/commands/coo.md`

**Purpose**: verify publish queue is healthy, tasks moving, nothing stuck.

**Tables**:
- `agent_tasks` (all statuses)
- `social_queue`
- `content` where published=0 AND scheduled_at IS NOT NULL
- `community_events` upcoming
- `crm_tasks` due today/overdue

**Session start**:

```ts
// 1. Anything stuck (status='in_progress' and older than 1 hour, or 'failed')
// 2. Tasks due today
// 3. Publish queue next 7 days (content + social + newsletter + events)
// 4. Overdue items
```

**Actions**:
- Retry failed tasks (INSERT new agent_task with parent reference, mark old as retried)
- Reschedule if conflicts detected (two things at same hour)
- Complete tasks

**Writes**:
- `agent_tasks` status updates
- `agent_audit` per mutation

---

## 4. `/cbo` — Revenue, pricing, product strategy

**File**: `.claude/commands/cbo.md`

**Purpose**: revenue analysis, pricing recommendations, product mix health.

**Tables**:
- `product_analytics` — conversion rate per product
- `profile_analytics.sales_*` — revenue breakdowns
- `purchases` — cohort retention, refund rate
- `products` — pricing, sale_price_cents vs price_cents
- `subscribers` — LTV proxy

**Session start**:

```ts
// 1. Top 5 products by revenue last 30d
// 2. Worst-performing products (high CTA clicks, low conversions)
// 3. Pricing anomalies (sale_price > price, currency mismatches)
// 4. Refund spike detection
// 5. Subscription churn (payment_status='failed' count delta)
```

**Actions**: read-only recommendations; never directly changes prices. Writes proposals to `agent_notes` (type='recommendation') for user approval.

---

## 5. `/crm` — Already built

Treat `/Users/2.o/qwik-claw/crm.md` as the reference. Copy it into `.claude/commands/crm.md` with these changes:
- Every multi-statement flow (approve DM, reply logged, create proposal, send proposal) → convert to `client.batch([...], 'write')`.
- Every INSERT → add `idempotency_key` column.
- Replace `WHERE groups LIKE '%grp_005%'` with junction-table query (`P0-4` in `agent-repo-task.md`).
- Add "write one agent_audit row per mutation" as rule #11.
- Point to `.claude/skills/on-demand/crm-deep.md` for trigger details (keep main file lean).

---

## 6. `/blog-writer` — Posts, listicles, how-tos, comparisons

**File**: `.claude/commands/blog-writer.md`

**Purpose**: draft and publish blog posts / guides / notes / prompts / skills / comparisons / alternatives. After content-table unification, one agent handles all seven types via `type` enum.

**Tables**:
- `content` (post-unification) with `type IN ('blog','note','guide','prompt','skill','compare','alternative','newsletter','doc')`
- `doc_collections` — if writing docs
- `categories` — pick category_id from seed

**Session start**:

```ts
// 1. Drafts in progress (last 10)
SELECT id, type, title, updated_at FROM content
WHERE profile_id = ? AND published = 0
ORDER BY updated_at DESC LIMIT 10

// 2. Recently published (for "what have I written lately" context)
// 3. Brand foundation (read from context/brand-voice.md + about-me.md) — done at startup
// 4. Related KB entries (if topic provided)
SELECT slug, summary FROM agent_kb WHERE profile_id = ? AND content LIKE ? LIMIT 5
```

**Actions**:
- Draft a post: INSERT with `published = 0`
- Update a draft: UPDATE WHERE `published = 0` (safe; UPDATE on published=1 requires explicit /republish command)
- Publish: UPDATE SET published=1, published_at=strftime('%s','now'), ai_summary=?
- Archive: UPDATE SET hidden=1
- Cross-link (on publish): scan `agent_kb` and `content` for related entries, update `additional_details` JSON

**Type-specific fields** (stored in `type_metadata` JSON after unification):
- blog / guide / note: `word_count`, `reading_time_mins`, `internal_links`, `external_links`, `sources`
- prompt / skill: `sources`
- compare / alternative: `competitors` JSON array
- doc: `collection_id`, `votes_json`
- newsletter: `scheduled_send_at`, `list_filter`

**Rules**:
1. Before drafting, always read brand-voice.md (skill).
2. Always include `ai_summary` (200 chars max) for KB indexing.
3. SEO fields are mandatory on publish: `seo_title` (≤60 chars), `seo_description` (≤160 chars).
4. Cross-link at least 2 internal URLs on publish (agent computes from `content` table).
5. Append entry to `agent_kb` on publish (slug, 1-sentence summary, type='content').

---

## 7. `/newsletter-writer` — Drafts, send, analytics

**File**: `.claude/commands/newsletter-writer.md`

**Purpose**: draft newsletters, send via SES/Resend (via `credentials` table keys), track.

**Tables**:
- `content` type='newsletter' for drafts
- `subscribers` — audience
- `newsletter_stats` — per-send performance
- `email_events` — open/click events (append-only)
- `email_tracking_stats` — singleton rollup
- `credentials` — SES or Resend keys (read-only)

**Session start**:

```ts
// 1. Active subscriber count (not blocked, not unsubscribed)
SELECT COUNT(*) FROM subscribers WHERE is_blocked = 0 AND is_unsubscribed = 0

// 2. Last 5 sends: open rate, click rate
SELECT * FROM newsletter_stats ORDER BY sent_at DESC LIMIT 5

// 3. Drafts in progress
SELECT * FROM content WHERE type='newsletter' AND published=0

// 4. Current credential provider (SES or Resend?)
SELECT ses_access_key IS NOT NULL AS has_ses, resend_api_key IS NOT NULL AS has_resend FROM credentials LIMIT 1
```

**Actions**:
- Draft: INSERT content (type='newsletter', published=0)
- Preview recipients (read-only)
- Send: one transaction that:
  1. UPDATE content SET published=1, published_at=now
  2. INSERT newsletter_stats row (INSERT OR IGNORE on content_id)
  3. Loop over subscribers → batch send via Resend/SES → INSERT email_events per recipient
  4. INSERT agent_audit

**Rules**:
1. Never send without an explicit user approval step. Always pause after draft.
2. Respect `is_blocked` and `is_unsubscribed` — never email them.
3. Never hardcode keys; always read from `credentials` at send time.
4. Cap batch size at 100; if list >100, chunk.
5. Include unsubscribe link pointing to `{profile_url}/unsubscribe?e={email_hash}`.

---

## 8. `/copywriter` — Landing pages, product copy, profile bio

**File**: `.claude/commands/copywriter.md`

**Purpose**: write and refine landing page content, product descriptions, link descriptions, profile bio.

**Tables**:
- `pages` — custom landing pages
- `cms` / `cms_tables` — CMS content
- `products.description`, `products.excerpt` — product copy
- `links.description`, `links.title` — link copy
- `profiles.bio`, `profiles.about` — profile-level copy
- `settings.tagline`, `settings.site_description` — site-level

**Session start**: pull current copy for whatever entity user names. No default briefing.

**Actions**:
- Rewrite a landing page: UPDATE `pages` row, respect versioning if present
- Refresh product copy: UPDATE `products.description`
- Rewrite bio: UPDATE `profiles.bio`

**Rules**:
1. Always read current copy before writing new — never overwrite blindly.
2. Preserve embedded shortcodes, variables, Liquid/Handlebars-like syntax.
3. Keep A/B test markers if found (look for `{{ab:xxx}}` patterns).
4. Brand voice from skill — load before every write.

---

## 9. `/course-creator` — Course structure, lessons, access

**File**: `.claude/commands/course-creator.md`

**Purpose**: design course outlines, insert lessons, set access config.

**Tables**:
- `products` where `type='course'` — course shell
- `products.lessons` — JSON array of lesson objects
- `products.course_access_type` / `course_access_config`
- `purchases.course_progress` — read-only here, shows who's progressing

**Session start**:

```ts
// 1. All courses (product type='course')
SELECT id, title, total_lessons, published_at FROM products WHERE type='course'

// 2. Completion rates per course
SELECT product_id, COUNT(*) as learners,
       SUM(course_completed) as completed
FROM purchases WHERE product_id IN (...) GROUP BY product_id
```

**Actions**:
- Create course: INSERT product (type='course', price_cents, lessons='[]')
- Add lesson: UPDATE products SET lessons = json_insert(lessons, '$[#]', ?)
- Reorder lessons: UPDATE products SET lessons = ? (full replace with reordered JSON)
- Publish: UPDATE products SET is_active=1, visibility='published', published_at=now

**Rules**:
1. Lessons JSON shape: `[{id, title, content_url, duration_mins, order}]`. Validate shape before UPDATE.
2. Cap `lessons` JSON at 128KB (~500 lessons).
3. `total_lessons` must equal `json_array_length(lessons)` — update both in same transaction.
4. Never delete a lesson if any purchase has `course_progress` referencing it; soft-delete by marking `hidden: true` inside the lesson object.

---

## 10. `/store-manager` — Downloads, services, webinars, events, listings, sponsorships, meetings

**File**: `.claude/commands/store-manager.md`

**Purpose**: manage all non-course `products` — downloads, services, webinars, events, listings, sponsorships, meetings.

**Tables**:
- `products` where `type != 'course'`
- `product_analytics` — per-product sales
- `purchases` — individual sales
- `gateways` — payment provider config per profile

**Session start**:

```ts
// 1. Top products by revenue last 30d (join products + product_analytics)
// 2. Products with zero sales but >100 CTA clicks (pricing / copy issues?)
// 3. Out-of-stock / capacity-limited: units IS NOT NULL AND total_sales >= units
// 4. Scheduled events/webinars in next 14 days
```

**Actions per product type**:
- **download**: INSERT products (type='download', file_url, price_cents)
- **service**: type='service', `duration_minutes`, `calendar_link`, `scheduling_provider`
- **webinar**: type='webinar', `webinar_link`, `webinar_platform`, `webinar_schedule` JSON
- **event**: type='event', `event_settings` JSON (venue, date range, capacity)
- **listing**: type='listing' (real estate / items)
- **sponsorship**: type='sponsorship'
- **meeting** / **1:1 call**: type='meeting', `meeting_settings` JSON (duration, calendar_link)

**Rules**:
1. `price_cents` ≥ 0 (validated via `lib/validate.ts`). `sale_price_cents` if set must be < price_cents.
2. Every product on create MUST have: title, slug, type, price_cents, currency, category_id.
3. `slug` is UNIQUE — if collision, append `-2`, `-3`, etc.
4. Publishing requires: `is_active=1, visibility='published', published=1` — all three, plus `published_at`.
5. Soft-delete only: `UPDATE products SET visibility='archived', archived_at=now`. Never DELETE.

---

## 11. `/jobs-manager` — Job listings, applications

**File**: `.claude/commands/jobs-manager.md`

**Purpose**: manage `job_listings` and triage `job_applications`.

**Tables**:
- `job_listings`
- `job_applications`
- `job_analytics` — singleton per job

**Session start**:

```ts
// 1. Open jobs with new applications
SELECT jl.id, jl.title, jl.total_applicants,
       (SELECT COUNT(*) FROM job_applications WHERE job_id = jl.id AND created_at > strftime('%s','now','-7 days')) as new_this_week
FROM job_listings jl WHERE jl.published = 1 AND (jl.expires_at IS NULL OR jl.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now'))

// 2. Unreviewed applications
// 3. Expiring listings next 7 days
```

**Actions**:
- Create listing: INSERT job_listings
- Publish: UPDATE published=1
- Expire: UPDATE expires_at
- Applications are always inbound; agent reads + tags them but never INSERTs applications (user-facing form does)

---

## 12. `/forms-builder` — Intake forms, waitlists, surveys

**File**: `.claude/commands/forms-builder.md`

**Tables**: `forms`, `questions`, `submissions`, `form_analytics`.

**Actions**:
- Create form: INSERT forms row
- Add questions: INSERT questions (order_index = max+1)
- Reorder: UPDATE questions SET order_index
- Publish: UPDATE forms SET is_active=1
- Read submissions: SELECT * FROM submissions WHERE form_id=? (read-only — never UPDATE submissions)

**Rules**:
1. `questions.type` must come from `lib/enums.ts` FORM_QUESTION_TYPE.
2. `questions.options` is required for type in (`select`, `radio`, `multiselect`).
3. `submissions.answers` is a write-once JSON map — never UPDATE.
4. On form delete, soft-delete: `UPDATE forms SET is_active=0`. Keep submissions forever.

---

## 13. `/docs-writer` — Knowledge base articles

**File**: `.claude/commands/docs-writer.md`

**Tables**: `doc_collections`, `doc_articles` (post-unification: `content` with type='doc').

**Session start**:

```ts
// 1. All collections
SELECT slug, title, description, sort_order FROM doc_collections ORDER BY sort_order

// 2. Article count per collection
SELECT collection_id, COUNT(*) as n FROM doc_articles GROUP BY collection_id

// 3. Articles with low helpfulness (votes_json sad > happy)
```

**Actions**:
- New collection: INSERT doc_collections
- New article: INSERT doc_articles (collection_id, title, slug, content)
- Publish: UPDATE published=1
- Revise: UPDATE content (allowed — docs are living). On publish, also increment `version` if column exists.

**Rules**:
1. Slug unique per collection: `UNIQUE(collection_id, slug)`.
2. Vote counters maintained by triggers (happy/sad/neutral) — never UPDATE `votes_json` directly.
3. Default collections pre-seeded by app (`provision.ts`) — don't re-create.

---

## 14. `/analytics` — Revenue, traffic, product, email stats

**File**: `.claude/commands/analytics.md`

**Purpose**: read-only briefings. Never writes to analytics tables (all writes happen via app's lazy rebuild).

**Tables** (read-only):
- `profile_analytics` (singleton)
- `product_analytics` (one per product)
- `link_analytics` (one per link)
- `crm_analytics` (singleton)
- `social_analytics` (singleton)
- `community_analytics` (singleton)
- `form_analytics` (one per form)
- `job_analytics` (one per job)
- `email_tracking_stats` (singleton)
- `gsc_ga4_sync` (singleton)
- Raw: `clicks_analytics`, `email_events` — only if drill-down needed

**Session start**: revenue, traffic, conversion, funnel at a glance. Always from singleton rows.

**Rules**:
1. **Never trigger a rebuild from agent side.** Read what's stored.
2. If `last_aggregated_at` is stale (> 1 hour), tell the user: "Data from {N} hours ago. Visit /dashboard/analytics to refresh."
3. For time-series, read from `analytics_7d` / `analytics_30d` / `analytics_12m` JSON arrays on the singleton row — don't GROUP BY on `clicks_analytics` directly.
4. For "why is revenue down" drill-downs, compute deltas client-side from the JSON.
5. Writes only to `agent_reports` (the briefing) + `agent_audit`.

---

## 15. `/seo` — Audit, fix meta, track LLM visibility

**File**: `.claude/commands/seo.md`

**Tables**:
- `gsc_snapshots`, `gsc_queries`, `gsc_pages`, `gsc_countries` — Search Console data
- `ga4_snapshots`, `ga4_pages`, `ga4_sources` — Google Analytics data
- `content` / existing content tables — where to write SEO fields
- `products.seo_*`, `category_pages.seo_*`, `collections.seo_*`, `cms.*`

**Session start**:

```ts
// 1. Pages with impressions but no clicks last 28 days (missed opportunities)
SELECT page, impressions, clicks FROM gsc_pages
WHERE impressions > 100 AND clicks < 5 ORDER BY impressions DESC LIMIT 20

// 2. Top queries where you rank 5–15 (push to top-3)
SELECT query, position, clicks FROM gsc_queries WHERE position BETWEEN 5 AND 15 ORDER BY impressions DESC LIMIT 20

// 3. Content missing seo_title or seo_description
// 4. Pages with broken canonicals (self-canonical mismatch)
```

**Actions**:
- UPDATE content SET seo_title=?, seo_description=?, seo_og_image=? WHERE id=?
- UPDATE products SET seo_* WHERE id=?
- Never change `slug` on published content (breaks links).

**Rules**:
1. `seo_title` ≤ 60 chars, `seo_description` ≤ 160 chars (validate in `lib/validate.ts`).
2. Never set `seo_block_indexing=1` without asking user first.
3. On GSC data reads, check `gsc_ga4_sync.last_sync_at` — if stale > 24h, recommend sync refresh.

---

## 16. `/social` — 13 platforms, schedule, inbox

**File**: `.claude/commands/social.md`

**Tables**: `social_accounts`, `social_posts`, `social_post_platforms`, `social_queue`, `social_analytics`, `social_inbox`, `social_labels`, `social_automations`, `social_sequences`, `social_broadcasts`.

**Session start**:

```ts
// 1. Connected accounts
SELECT id, platform, handle, is_active FROM social_accounts WHERE is_active=1

// 2. Posts scheduled next 7 days
// 3. Inbox: unread DMs/comments (status='unread')
// 4. Queue gaps (slots with no content)
// 5. Best-performing post last 30d
```

**Actions**:
- Draft post: INSERT social_posts (status='draft')
- Schedule: UPDATE status='scheduled', scheduled_for=?
- Publish now: UPDATE status='publishing' → n8n webhook fires → on success app updates to 'published'
- Reply to inbox item: INSERT outbound activity + UPDATE inbox status='replied'
- Label: INSERT social_post_labels junction row

**Rules**:
1. Posting uses `credentials.n8n_webhook_url` — never direct platform APIs.
2. Status transitions only per `SOCIAL_POST_STATUS` enum. Invalid transitions raise.
3. Every `social_posts` INSERT includes `idempotency_key`.
4. Inbox replies must record both the outbound action and the linked inbox row in one transaction.
5. Never UPDATE `platform_specific_data` — that's the platform's response. Append-only.

---

## 17. `/scheduler` — Cron tasks, publish queue, pattern detection

**File**: `.claude/commands/scheduler.md`

**Purpose**: the "hourly runner". In Phase 1, run manually (`/scheduler hourly`). In Phase 3, CF Durable Object.

**Tables**: `agent_tasks`, `social_queue`, `content`, `crm_tasks`, `community_events`, `agents.pending_skill_suggestion`.

**Actions**:

1. **Flip scheduled → ready**:
   ```ts
   UPDATE content SET published=1, published_at=now
   WHERE published=0 AND scheduled_at <= now()
   ```
2. **Trigger social posts**:
   ```ts
   UPDATE social_posts SET status='publishing'
   WHERE status='scheduled' AND scheduled_for <= now()
   ```
3. **Mark overdue crm_tasks** as past_due (add status='past_due' where status='open' AND due_at < now).
4. **Hermes pattern**: scan `agent_reports` last 7 days, if same action appears ≥3 times, INSERT agent_tasks (status='detected') suggesting to automate.
5. **Sequence progression**: advance `social_sequence_enrollments` whose next step is due.

**Rules**:
1. Scheduler is the only agent allowed to flip `published` from 0 to 1 without the explicit "publish" action from another agent. Enforce via naming convention.
2. Runs within one transaction batch per table (all content flips = one batch, all social flips = one batch).
3. Writes one summary `agent_reports` row per run: {flipped_n, errors_n, skipped_n}.

---

## 18. `/ingest` — Process `agent_notes` inbox into structured KB

**File**: `.claude/commands/ingest.md`

**Purpose**: Karpathy wiki pattern. User drops links/ideas/tweets into `agent_notes`; `/ingest` processes them into `agent_kb`.

**Flow**:

```ts
// 1. Read unprocessed notes
SELECT * FROM agent_notes WHERE profile_id = ? AND ingested_at IS NULL ORDER BY created_at ASC

// For each note:
//   a. Fetch URL content if it's a link (respect robots.txt, cache)
//   b. Extract key facts (agent reasoning)
//   c. Check for existing related agent_kb entries (LIKE match on summary)
//   d. If extending: UPDATE existing kb entry, append source_note_ids
//      If new: INSERT agent_kb (slug, summary, content, related_ids, source_note_ids)
//   e. Mark note processed: UPDATE agent_notes SET ingested_at=now, kb_id=?
//   f. Write one agent_audit row
```

**Rules**:
1. Transaction boundary = one note per transaction. Don't batch-fail-all on one bad note.
2. `agent_kb.slug` is stable identifier; never change after first write.
3. Every kb entry includes `stale=0` initially. Set `stale=1` if ingest finds a contradiction.
4. Cap `content` at 64KB; if longer, split into multiple linked entries.
5. Skip notes whose URLs return 404 or paywall — mark with `ingest_error` column.

---

## 19. `/kb` — Query knowledge base

**File**: `.claude/commands/kb.md`

**Purpose**: search `agent_kb`, answer questions, file Q&A back as new kb entries.

**Flow**:

```ts
// 1. Query parse: user types "what do I know about email deliverability?"
// 2. FTS5 search (if available) OR LIKE fallback:
SELECT slug, summary FROM agent_kb_fts WHERE agent_kb_fts MATCH ? LIMIT 20

// 3. Load full content for top 3 matches
SELECT content FROM agent_kb WHERE slug IN (?, ?, ?)

// 4. Synthesize answer
// 5. INSERT new agent_kb entry (slug='qa-{timestamp}', summary=question, content=answer, type='qa')
//    — so every query compounds the KB
```

**Rules**:
1. Always FTS5 path if `hasMigration('agent_kb_fts_v1')`. Never default to full-table LIKE if index is available.
2. Every `/kb` query produces one new entry — cheap knowledge compounding.
3. If no matches found (≤1 weak match), say "I don't have entries on this" and offer to `/ingest` new sources.

---

## 20. `/compress` — Save session before context runs out

**File**: `.claude/commands/compress.md`

**Purpose**: Write current session summary to `agent_memory` before Claude's context limit.

**Flow**:

```ts
INSERT INTO agent_memory (
  id, profile_id, agent_type, session_summary, actions_taken, created_at
) VALUES (?, ?, ?, ?, ?, ?)

// Then clean up old memory beyond rolling 20:
DELETE FROM agent_memory WHERE id NOT IN (
  SELECT id FROM agent_memory WHERE agent_type=? ORDER BY created_at DESC LIMIT 20
)
```

**Rules**:
1. Rolling-20 policy enforced here (see `agent-repo-task.md` P1-2).
2. Session summary ≤ 4KB — if longer, agent must summarize further before writing.
3. Include: what was done, what's pending, user's key instructions from this session.

---

## 21. `/resume` — Reload context next session

**File**: `.claude/commands/resume.md`

**Flow**:

```ts
// 1. Last 5 memory entries for this agent
SELECT * FROM agent_memory WHERE agent_type=? ORDER BY created_at DESC LIMIT 5

// 2. Pending agent_tasks
// 3. Recent agent_notes not yet ingested
// 4. Brand foundation (context/*.md files — always)
```

Output: "Here's where we left off" briefing. Read-only.

---

## Skills — auto-loaded context

### `.claude/skills/SYSTEM.md` (NEW — master file)

**Content**:

```markdown
# System Rules — BusinessKit Agent

These rules apply to EVERY agent. Violations cause data corruption.

## Safety
1. Every mutation uses an idempotency_key (see lib/id.ts).
2. Every multi-statement flow uses client.batch([...], 'write') via BaseAgent.txn().
3. Every mutation writes one agent_audit row in the same transaction.
4. Wrap all DB ops in withRetry() to handle SQLITE_BUSY.
5. profile_id is set by BaseAgent only — never by callers.

## Status strings
6. Only values from lib/enums.ts (see enums.md skill).
7. Never invent a new status/type/stage string — the DB trigger will silently no-op.

## Append-only
8. Do not UPDATE crm_activities content fields, agent_reports, email_events, clicks_analytics.
9. To "fix" a past action: insert a correcting new one. Document in the new row's metadata.

## Numeric bounds
10. Use lib/validate.ts helpers (leadScore, probability, cents, etc.) before any numeric write.

## Reads
11. Always load context before acting. Read > Decide > Write.
12. Never SELECT * on large tables. Always project the columns you need.
13. For analytics: read singleton tables, never GROUP BY on raw event tables from agent.

## Cost
14. Skills on demand. Load only `.claude/skills/*.md` (top-level). Load on-demand skills only inside the matching command.
15. KB index first (slug + summary). Load full content only for top matches.

## Scope
16. Each agent writes only to its own domain tables. CEO/CMO/COO/CBO write to agent_* tables only — they delegate to domain agents for domain writes.
```

### `.claude/skills/schema.md`

One line per table. Purpose + "read via which query". Max 2KB. Point to app-repo source files for column-level detail.

### `.claude/skills/enums.md`

Mirrors `lib/enums.ts`. Every enum column + allowed values. Claude reads this before writing any status/type field. Max 4KB.

### `.claude/skills/brand.md`

```markdown
# Brand Foundation

Before producing anything, read these files:
- context/about-me.md — who the user is
- context/brand-voice.md — voice bible + examples
- context/business.md — goals, revenue model, 90-day targets
- context/working-style.md — approval preferences, schedule

If any of these are empty, STOP and tell the user: "I need your Brand Foundation filled in before I write. See README step 'Fill in your context'."
```

### `.claude/skills/store.md`

The seven product types + their required fields. Lean — ~2KB.

### `.claude/skills/analytics.md`

Which tables are singleton vs raw-event vs view. Rules: never trigger rebuild from agent, always read singleton, respect `last_aggregated_at`.

### `.claude/skills/agents.md`

How BaseAgent works: profile isolation, idempotency, transactions, audit, retry. How Phase 1 → Phase 2 swap works. Max 3KB.

### `.claude/skills/on-demand/*.md`

One per domain (crm-deep, social-deep, community-deep, ads-deep, feedback-deep, gsc-deep). Contains trigger-level detail, performance gotchas, full column list. Loaded only when the matching command runs. Each up to 8KB.

---

## Size budget

Per `agent-repo-task.md` P1-6:
- Total auto-loaded `.claude/skills/*.md` (top-level) ≤ 20KB combined.
- Each on-demand skill ≤ 8KB.
- Each command file ≤ 12KB (crm.md is the long end; most will be 5–8KB).

Enforce with a CI check:

```bash
# In package.json scripts
"check:size": "find .claude/skills -maxdepth 1 -name '*.md' -exec wc -c {} + | tail -1 | awk '{if ($1>20480) exit 1}'"
```

---

## Build order

1. **`skills/SYSTEM.md` + `skills/enums.md` + `lib/enums.ts`** — nothing works without this.
2. **`skills/schema.md` + `skills/agents.md`** — everything reads these.
3. **`skills/brand.md` + `skills/store.md` + `skills/analytics.md`** — round out auto-loaded set.
4. **`commands/crm.md`** — copy + harden from `/Users/2.o/qwik-claw/crm.md`.
5. **`commands/ceo.md`** — aggregates everything; tests that cross-domain reads work.
6. **`commands/scheduler.md`** — the runner; tests transactions.
7. **`commands/blog-writer.md`, `newsletter-writer.md`, `social.md`** — content pipeline.
8. **`commands/store-manager.md`, `course-creator.md`, `forms-builder.md`, `jobs-manager.md`, `docs-writer.md`** — domain commands.
9. **`commands/analytics.md`, `seo.md`, `cmo.md`, `coo.md`, `cbo.md`** — read-first agents.
10. **`commands/ingest.md`, `kb.md`, `compress.md`, `resume.md`** — knowledge layer utilities.
11. **`skills/on-demand/*.md`** — polish last; fill in as commands need deeper reference.

---

## Test matrix per command

For every command file, before marking done:

1. Run the command against a fresh seeded UserDB.
2. Check: does it read context before acting? (No blind INSERTs.)
3. Check: are all mutations in transactions? (grep for standalone `client.execute` in write flows.)
4. Check: does each mutation produce an `agent_audit` row?
5. Check: does every INSERT include an `idempotency_key`?
6. Check: are all status strings from enums?
7. Run the same command twice with the same inputs — second run should no-op (idempotency proof).
8. Kill the process mid-batch — verify no partial state.

---

## What not to build in this pass

- MCP server (Phase 2).
- Durable Objects scheduler (Phase 3).
- Spectrum channel adapters.
- Agent web UI.
- New agents beyond the 17 in the roster.

Focus: ship the 17 commands + 8 skills, safely, once.
