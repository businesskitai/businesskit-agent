# Schema — Table Reference

## Content — ONE unified table

All user-facing content (blog, notes, guides, newsletter, compare, alternative, prompt, skills) lives in a single `content` table. The "type" is encoded via `cms_id` → `cms.category_id`:

| Kind | Route | cms.category_id |
|---|---|---|
| blog | /blog | cat_35 |
| notes | /notes | cat_37 |
| guides | /guides | cat_36 |
| newsletter | /n | cat_20 |
| compare | /compare | cat_40 |
| alternative | /alternative | cat_41 |
| prompt | /prompt | cat_39 |
| skills | /skills | cat_38 |

`content` shared cols: id, cms_id, category_id, profile_id, user_id, slug, title, content, excerpt, published, hidden, collection_id, seo_title (≤60), seo_description (≤160), seo_keywords, word_count, reading_time_mins, internal_links (int), sources JSON, created_at, updated_at.

Use `getCmsId(profileId, kind)` from `agents/content/content.ts` to resolve cms_id. Writes are unique per `(profile_id, category_id, slug)`.

## Docs — separate, AUTOINCREMENT ids
`doc_collections` + `doc_articles` — knowledge base. `id INTEGER PRIMARY KEY AUTOINCREMENT`, so omit id on INSERT.

## Products
type: download|course|meeting|webinar|event|listing|sponsorship|service
cols: price_cents, sale_price_cents, slug UNIQUE, published, hidden, lessons JSON, calendar_link, webinar_link, file_url

## CRM (crm.ts)
crm_contacts: status (lead|prospect|customer|churned|archived), lead_score 0-100, icp_match (strong|moderate|weak|unknown), outreach_status, agent_status (pending→researching→enriched→outreach_ready→closed), agent_context JSON, auto_approve INT, suggested_dm, email_draft
crm_activities: type, direction (inbound|outbound), sender (agent|you|contact), body, approval_status (pending_approval|approved|auto_sent|rejected) — APPEND-ONLY, never UPDATE
crm_deals: contact_id, title, value_cents, stage (new|contacted|proposal|negotiation|won|lost), probability 0-100
crm_analytics: DB triggers keep this in sync — never update manually
crm_groups: membership via crm_contact_groups junction — use lib/groups.ts, never LIKE '%grp_x%'

## Social (social.ts)
social_accounts: platform, connection_mode (zernio_byok|zernio_platform|direct|n8n), zernio_account_id
social_posts: content, status, scheduled_for, scheduled_via, zernio_post_id
social_post_platforms: one row per platform per post, platform_post_id indexed
social_inbox: type (dm|comment|review), status (unread|read|replied|archived), crm_contact_id FK

## Memory
memory_log: rolling 20 rows per profile — auto-trimmed
agent_skills: UNIQUE(profile_id,slug) — upsert safe

## Analytics — READ ONLY, never write
Maintained by DB triggers (scalar counters) + app-side lazy aggregation (JSON breakdowns). JSON rebuilt on dashboard page visit with `last_aggregated_at` throttle — agents MUST NOT rebuild. If stale, surface a note to the user.

- profile_analytics: total_clicks, total_views, bot_views, analytics_7d/30d/12m/lifetime JSON, revenue_* JSON
- content_analytics (1/row): bot_views, total_views, total_reactions, total_comments, views_7d/30d/12m/lifetime, *_breakdown JSON
- cms_analytics (1/cms-page): total_posts, total_draft, total_published, total_views, … (maintained by trg_content_insert/update/delete + trg_content_view_insert)
- doc_analytics (1/doc): views, sad/neutral/happy votes, *_breakdown
- product_analytics: total_sales, total_revenue_cents, sales_30d JSON
- crm_analytics (1/profile): scalar counters by 13 triggers; JSON breakdowns aggregated on CRM dashboard visit

## ID and timestamp rules
IDs: ulid() for most | omit id for doc_collections, doc_articles (AUTOINCREMENT)
INT cols: now() = Math.floor(Date.now()/1000)
TEXT cols (posts, jobs, forms, docs): iso() = new Date().toISOString().slice(0,19)+'Z'

## Status enums — source of truth: lib/enums.ts (never literal)

| Column | Values |
|---|---|
| crm_contacts.status | lead, prospect, customer, churned, archived |
| crm_activities.approval_status | pending_approval, approved, rejected, auto_sent |
| crm_deals.stage | new, contacted, proposal, negotiation, won, lost |
| social_posts.status | draft, scheduled, queued, publishing, published, failed, cancelled |
| agent_notes.status | inbox, processing, done, archived |
| agent_tasks.status | pending, active, running, done, paused, failed, cancelled |
| agent_kb.entry_type | entity, concept, source, synthesis, index |
| community_posts.status | published, removed, pending |
| email_tracking_events.type | delivered, opened, clicked, bounced, complained, failed |
| affiliate_commissions.status | pending, approved, paid, void |

## Numeric bounds — use lib/validate.ts helpers
lead_score, probability: 0-100 integer
*_cents: non-negative integer
hot_score: non-negative

## Append-only — never DELETE
crm_activities (DB blocks DELETE), agent_reports, email_events, clicks_analytics
crm_activities UPDATEs are allowed only on: approval_status (pending_approval→approved|rejected|auto_sent) and read_at. Never change body/type/direction — insert a correcting row instead.

## Soft-delete only — never hard DELETE
hidden=1 | archived=1 | status='archived'
