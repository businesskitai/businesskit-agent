# DOMAINS.md

Which agent writes to which UserDB tables. App-side schema is provisioned at onboarding; agents only write — never `CREATE TABLE`.

Analytics tables are trigger-maintained (scalar counters) + app-side lazy-aggregated (JSON breakdowns, throttled by `last_aggregated_at`). Agents **read** them, never write.

---

## Content & CMS — `agents/content/content.ts`

**Tables written:** `content` (single unified table), `cms` (auto-seeds missing rows)

**Tables read (triggered, never write):** `content_analytics`, `cms_analytics`

**Triggers fired by our writes:**
- `trg_content_insert` → seeds `content_analytics` + `cms_analytics` row; increments `total_posts`, `total_published` / `total_draft`
- `trg_content_update_published` → flips draft↔published counters
- `trg_content_delete` → **do not fire**; we soft-delete via `hidden=1`
- `trg_content_view_insert` (fires on `content_views` INSERT) → fans out view counts across profile/content/product/job/form/community/page/doc analytics + cms_analytics

**Kind → category_id map:** blog=cat_35, notes=cat_37, guides=cat_36, newsletter=cat_20, compare=cat_40, alternative=cat_41, prompt=cat_39, skills=cat_38

---

## CRM / Sales — `agents/sales/sales.ts`

**Tables written:** `crm_contacts`, `crm_deals`, `crm_activities`, `crm_tasks`, `crm_notes`, `crm_contact_groups` (junction), `crm_templates`, `crm_proposals`, `crm_invoices`

**Tables read only:** `crm_groups` (names + contact_count), `crm_analytics`

**Triggers we rely on (all fire automatically):**
- `trg_after_contact_insert / _converted / _archived / _duplicate_check` — status + duplicate detection
- `trg_after_activity_insert / _pending / _approve / _reject / _inbound_reply` — approval counters, reply rate
- `trg_after_deal_insert / _won / _lost / _forecast` — pipeline totals, weighted forecast

**Append-only rules (BEFORE DELETE):**
- `crm_activities` — DELETE blocked; UPDATE of `approval_status` + `read_at` allowed

**Idempotency:** activities, tasks, notes, proposals, invoices all have unique partial indexes on `idempotency_key`. Sales agent writes keys on every INSERT.

---

## Commerce — `agents/store/store.ts`, `agents/courses/courses.ts`

**Tables written:** `products` (type = download | course | meeting | webinar | event | listing | sponsorship | service), `product_analytics` (seeded on create, then trigger-maintained)

**Tables read only:** `purchases`, `product_analytics`

**Append-only rules:** `trg_products_no_delete`, `trg_purchases_no_delete` — soft delete only.

---

## Docs — `agents/docs/docs.ts`

**Tables written:** `doc_collections` (INT AUTOINCREMENT), `doc_articles` (INT AUTOINCREMENT — omit `id` on INSERT)

**Tables read only:** `doc_analytics`

---

## Jobs — `agents/hiring/hiring.ts`

**Tables written:** `job_listings`, `job_applications`

**Tables read only:** `job_analytics`

---

## Forms — `agents/forms/forms.ts`

**Tables written:** `forms`, `questions`

**Tables read only:** `submissions`, `form_analytics`

---

## Newsletter — `agents/newsletter/newsletter.ts`

**Tables read only:** `subscribers`

**Writes:** content rows with kind=`newsletter` (via content agent), n8n_webhook (send). Never writes to a `newsletter` table — that doesn't exist.

---

## Social — `agents/social/social.ts`

**Tables written:** `social_accounts` (BYOK config), `social_posts`, `social_queue`

**Tables read only:** `social_analytics`, `social_inbox` (inbound replies → reflected into crm_contacts via sales agent)

**Posting modes:** `zernio_byok`, `zernio_platform` (requires session, dashboard-only), `n8n_webhook`.

---

## SEO — `agents/seo/seo.ts`

**Writes:** UPDATEs seo_title, seo_description, seo_keywords, excerpt, slug on `content`. UPDATEs seo_* on `collections`.

**Writes to `profiles.llm_visibility`** for LLM citation tracking.

**Tables read only:** `content`, `cms_analytics`, `profiles`

---

## Pages / Design — `agents/copywriting/copywriting.ts` (+ future design agent)

**Tables written:** `pages`, `products.description` (short copy), `links`

---

## Analytics — `agents/analytics/analytics.ts` — READ ONLY

Every `*_analytics` table, plus raw `content_views`, `link_analytics`. **Never writes.** If `last_aggregated_at` is stale, surface a note; never trigger a rebuild.

- `profile_analytics` — clicks, revenue_30d, top_countries, top_referrers
- `content_analytics`, `cms_analytics`
- `product_analytics`
- `link_analytics`, `link_analytics_by_category`, `clicks_analytics`
- `crm_analytics`, `form_analytics`, `job_analytics`, `community_analytics`, `page_analytics`, `doc_analytics`, `social_analytics`

---

## Agent infra — all agents (via BaseAgent)

Shared with the dashboard. Agents write; dashboard reads + edits.

| Table | Agent action |
|---|---|
| `agent_memory` | `BaseAgent.logMemory()` — rolling 20 rows per agent, AUTOINCREMENT id, idempotency_key |
| `agent_reports` | `BaseAgent.pushReport()` — append-only, idempotency_key indexed |
| `agent_tasks` | `BaseAgent.createAgentTask()` + `updateTaskStatus()` + `listAgentTasks()` — kanban surface |
| `agent_notes` | `/ingest` command + user-written inbox (`status='inbox'`) |
| `agent_kb` | `/ingest` writes wiki pages; `/kb` reads |
| `agent_skills` | Dashboard-editable skill rules; agents read `is_active=1` rows |
| `agent_audit` | `BaseAgent.auditStmt()` — append-only (BEFORE UPDATE + DELETE triggers), written inside every `insert/update/archive` txn |
| `agent_files` | User-uploaded files assigned to agents; agents read |
| `agent_conversations` | Future — schema only |

---

## Operations — `agents/operations/operations.ts`

UPDATEs `published=1` on `content`, `products`, `job_listings`. Reads drafts across all of them. Notifies n8n on publish.

---

## What agents NEVER touch

- **Central DB** (ours) — never. Users never see it.
- **`_schema_migrations`** — read only, via `BaseAgent.hasMigration()`
- **`*_analytics` JSON breakdowns** — read only; don't rebuild
- **`credentials` values** — read for config only, never echo/log
- **`trg_*_no_delete`-protected tables** via hard DELETE — use soft delete
