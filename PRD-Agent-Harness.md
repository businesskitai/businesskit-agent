# BusinessKit Agent — PRD: Agent Harness & Domain Workflows

> Inspired by ep6-agent-harness from theaiautomators/claude-code-agentic-rag-series.
> Adapted for BusinessKit: profile-isolated, Turso-powered, Cloudflare Workers compatible.

---

## The Core Insight

> "The model is commoditized. Structured enforcement of process is where value lives."

A domain harness **guarantees** every step completes and validates before advancing.
The LLM executes within each phase but **cannot skip, reorder, or bypass phases**.

For BusinessKit this means:

- A blog post always gets SEO-checked before publishing
- A product always gets copy-reviewed before going live
- A newsletter always confirms subscriber count before sending
- A job listing always gets a description quality check before posting

---

## Two Layers

### Layer 1 — Deep Mode (LLM controls flow)

User activates Deep Mode → CEO/CMO/COO agents plan via todo list, execute multi-step tasks, delegate to sub-agents, ask user for clarification mid-task. The LLM decides the order.

### Layer 2 — Domain Harness (system controls flow)

A backend state machine drives deterministic phase transitions with validation gates.
LLM executes within each phase. The **system** advances phases — not the LLM.

---

## Part 1: Deep Mode

### Feature 1.1: Deep Mode Activation

Per-session flag. When active:

- Agents gain planning tools (todo list)
- Session workspace becomes available (`progress.md` + per-run files)
- CEO can delegate to sub-agents (Blog Writer, Store Manager, etc.)
- Agents can pause and ask the user for clarification

When OFF: current behavior unchanged. No overhead.

### Feature 1.2: Planning (Todos)

CEO/CMO/COO write a structured todo list at the start of complex tasks.
Updated in real-time as steps complete. User sees plan progressing.

**Pattern:**

```
1. [CEO] Read analytics snapshot via Analytics Agent
2. [CEO] Identify top 3 priorities from briefing
3. [CMO] Generate 4-week content calendar
4. [Blog Writer] Draft post #1 from calendar
5. [SEO Agent] Audit post #1
6. [COO] Schedule post #1 for Monday 9am
7. [Social Agent] Queue social distribution
```

### Feature 1.3: Session Workspace (`progress.md`)

Per-session file that agents write to after significant actions.
Next session reads it first — solving the "start from zero every time" problem.

```markdown
## 2026-03-22 — CEO Session
- Revenue: $4,200 last 30d (+18% trend)
- Published: "How to Build a Newsletter" (blake, post_id: 01JXXX)
- Scheduled: "Course Launch" for 2026-03-25 (product_id: 01JYYY)
- SEO issues found: 3 posts missing excerpts → SCOUT to fix next session
- Priority next: launch webinar product, PEARL newsletter on Thursday
```

Stored locally as `progress.md` in the repo root.
**Not in Turso** — this is agent working memory, not business data.

### Feature 1.4: Sub-Agent Delegation

CEO can delegate to any other agent with isolated context:

- Clean context per sub-agent (no full history passed)
- Shared `progress.md` workspace
- Results returned as tool result to CEO
- Failure isolated — parent continues

```
CEO delegates to Blog Writer:
  task("Write a blog post about email marketing tips", {
    brand_context: profile.bio,
    existing_posts: last 3 titles for tone matching
  })
→ Blog Writer drafts, saves to progress.md
→ Result returned to CEO
```

### Feature 1.5: Ask User (Mid-Task Clarification)

Agent pauses and asks a specific question before continuing.
Used when: ambiguous brief, missing required field, approval needed before publishing.

---

## Part 2: Domain Harness Engine

### Phase Types

| Type | Description | Used for |
|---|---|---|
| `programmatic` | Pure TS, no LLM. Data fetching, validation. | Load analytics, check word count |
| `llm_single` | Single LLM call, structured JSON output | Brand voice check, SEO scoring |
| `llm_agent` | Multi-round agent loop with tools | Write full blog post, generate course outline |
| `llm_batch` | Parallel sub-agents per item | Audit multiple products, check multiple links |
| `llm_human_input` | Pause for user clarification | Confirm publish, approve price |

### Harness State Machine

```
PENDING → RUNNING (phase 1)
  → phase complete + validation pass → RUNNING (phase 2)
  → phase complete + validation pass → RUNNING (phase 3)
  → ...
  → all phases complete → COMPLETED
  → any validation fail → FAILED (with reason)
  → user paused → PAUSED → resume → RUNNING
```

The system drives phase transitions. LLM cannot jump ahead.

### Workspace-Based Context Passing

Phases read from and write to named workspace files — not inline dumps:

```
phase 1 writes: analytics-snapshot.md
phase 2 reads:  analytics-snapshot.md → writes: content-priorities.md
phase 3 reads:  content-priorities.md → writes: blog-draft.md
phase 4 reads:  blog-draft.md         → writes: seo-report.md
phase 5 reads:  blog-draft.md + seo-report.md → publishes post
```

---

## Part 3: BusinessKit Domain Harnesses

### Harness 1: Publish Blog Post

**Trigger:** `/blog-writer publish` or "publish my draft post"

**Phases:**

| # | Name | Type | Reads | Writes | Validation |
|---|---|---|---|---|---|
| 1 | Load Draft | `programmatic` | posts table (published=0) | `draft.md` | Must have title + content |
| 2 | Brand Check | `llm_single` | `draft.md` + profile.bio | `brand-check.md` | Score ≥ 7/10 or flag for review |
| 3 | SEO Check | `llm_single` | `draft.md` | `seo-report.md` | Title ≤60 chars, excerpt exists |
| 4 | Auto-Fix SEO | `llm_agent` | `draft.md` + `seo-report.md` | `draft-v2.md` | Runs only if SEO issues found |
| 5 | Confirm | `llm_human_input` | `draft-v2.md` + `seo-report.md` | `publish-intent.md` | User confirms or requests changes |
| 6 | Publish | `programmatic` | `publish-intent.md` | posts table (published=1) | Row updated successfully |
| 7 | Social Queue | `llm_agent` | `draft-v2.md` + profile.social_links | n8n / direct API | Social Agent fires for each platform |

**Guarantee:** No post goes live without brand check + SEO check + user confirm.

---

### Harness 2: Launch Product to Store

**Trigger:** `/store-manager launch` or "launch my product"

**Phases:**

| # | Name | Type | Reads | Writes | Validation |
|---|---|---|---|---|---|
| 1 | Load Draft | `programmatic` | products table (published=0) | `product.md` | title, price_cents, type required |
| 2 | Copy Review | `llm_single` | `product.md` + profile.bio | `copy-report.md` | description ≥150 words, excerpt ≤160 chars |
| 3 | Improve Copy | `llm_agent` | `product.md` + `copy-report.md` | `product-v2.md` | Only if copy issues found |
| 4 | Price Check | `llm_single` | `product-v2.md` + product_analytics | `pricing-report.md` | Flags if price = $0 or unusually high |
| 5 | Confirm | `llm_human_input` | `product-v2.md` + `pricing-report.md` | `launch-intent.md` | User confirms price + description |
| 6 | Launch | `programmatic` | `launch-intent.md` | products table (published=1) | Row + analytics seed updated |
| 7 | Announce | `llm_agent` | `product-v2.md` | Social Agent | Posts launch announcement |

---

### Harness 3: Send Newsletter

**Trigger:** `/newsletter-writer send` or "send this week's newsletter"

**Phases:**

| # | Name | Type | Reads | Writes | Validation |
|---|---|---|---|---|---|
| 1 | Audience Check | `programmatic` | subscribers table | `audience.md` | Must have ≥1 subscriber |
| 2 | Draft Review | `llm_single` | user input + profile.bio | `newsletter-draft.md` | Subject ≤60 chars, body ≥200 words |
| 3 | Personalization | `llm_agent` | `newsletter-draft.md` + `audience.md` | `newsletter-final.md` | Add first-name token, preview text |
| 4 | Confirm Send | `llm_human_input` | `newsletter-final.md` + `audience.md` | `send-intent.md` | Show: subject, subscriber count, confirm |
| 5 | Send | `programmatic` | `send-intent.md` + credentials (SES/Resend) | delivery report | API call succeeds |

---

### Harness 4: Weekly CEO Briefing (Autonomous)

**Trigger:** Cron (`0 8 * * 1`) via Scheduler, or `/ceo brief`

**Phases:**

| # | Name | Type | Reads | Writes |
|---|---|---|---|---|
| 1 | Analytics Pull | `programmatic` | All analytics tables | `analytics.md` |
| 2 | Content Inventory | `programmatic` | posts, products, jobs, forms tables | `inventory.md` |
| 3 | Revenue Analysis | `llm_single` | `analytics.md` | `revenue-report.md` |
| 4 | Priority Setting | `llm_single` | `analytics.md` + `inventory.md` + `revenue-report.md` | `priorities.md` |
| 5 | Briefing Write | `llm_agent` | all above | `briefing.md` |
| 6 | Deliver | `programmatic` | `briefing.md` + credentials.n8n_webhook_url | n8n → email/Slack |
| 7 | Update Progress | `programmatic` | `briefing.md` | `progress.md` |

**Phase 3 runs autonomously with no user present (Phase 3: CF Workflows)**

---

### Harness 5: Post Job Listing

**Trigger:** `/jobs-manager post`

| # | Name | Type | Validates |
|---|---|---|---|
| 1 | Load Draft | `programmatic` | title, company, description required |
| 2 | Description Check | `llm_single` | ≥200 words, requirements section present |
| 3 | Improve Description | `llm_agent` | Only if quality score <7 |
| 4 | Confirm | `llm_human_input` | Show preview, user approves |
| 5 | Publish | `programmatic` | published=1 in job_listings |

---

## Part 4: Session Memory (`progress.md`)

Persistent working memory across sessions. Not business data — agent scratch pad.

### Format

```markdown
# BusinessKit Agent Progress

## Last updated: {ISO timestamp}
## Business: {profile.title}

## Recent actions
- {timestamp}: Published "{title}" (blog post, id: {id})
- {timestamp}: Launched "{title}" (product, $XX, id: {id})
- {timestamp}: Sent newsletter "{subject}" to {N} subscribers

## Open items
- 3 posts missing SEO excerpts → run /seo to fix
- Course "Advanced Email Marketing" has 0 sales → price review needed
- Job listing "Senior Designer" expires {date}

## Last briefing summary (CEO)
- Revenue last 30d: $X (+Y% trend)
- Top product: "{title}" — $Z revenue
- Traffic: N clicks, top country: US

## Scheduled content
- {title} → publishes {date} (post)
- {title} → publishes {date} (product)
```

### Rules

- Agents append to it — never overwrite the full file
- CEO reads it at the start of every briefing
- Stored in repo root as `progress.md`
- Added to `.gitignore` (personal working memory, not for GitHub)
- Re-created fresh if deleted

---

## Part 5: Implementation Roadmap

### Phase 1 (Now — this repo)

- [x] 16 agents with direct Turso access
- [x] `cli.ts` universal entry point
- [x] `progress.md` pattern documented in CLAUDE.md
- [ ] Deep Mode slash command (`/deep`) in `.claude/commands/`
- [ ] `progress.md` write helper in `lib/`

### Phase 2 (In-app, Qwik + CF Worker)

- [ ] Harness engine as a Qwik `routeAction$`
- [ ] Phase state machine in `src/lib/harness/`
- [ ] Real-time phase progress via CF Queue or SSE
- [ ] Plan Panel in dashboard UI (shows harness phases)

### Phase 3 (Autonomous, CF Workflows + Durable Objects)

- [ ] Weekly CEO briefing harness on cron
- [ ] Scheduler as Durable Object
- [ ] Harness run state stored in Turso (not DO RAM)

---

## Design Rules

- **Harness controls phases, LLM executes within them** — never reverse
- **Workspace files for context passing** — no inline dumps between phases
- **Validation before advancing** — no phase skipping on failure, surface the error
- **progress.md for cross-session memory** — not Turso, not disk cache, just a file
- **profile_id on every DB write** — same rule as all agents
- **No hard deletes** — harness sets hidden=1 on cleanup, never DELETE
- **Idempotent phases** — safe to re-run a phase if interrupted
- **User confirm before any irreversible action** — publish, send, post to social
