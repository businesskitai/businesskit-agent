# Schema — Table Reference

## Content tables (all share: id, profile_id, user_id, slug, title, content, excerpt, published, hidden, collection_id, created_at, updated_at)

| Table | Route | Use |
|---|---|---|
| `posts` | /blog | Blog: listicle, how-to, checklist, qa, versus, roundup, news, ultimate-guide |
| `newsletter` | /newsletter | Email newsletter issues |
| `notes` | /notes | Short-form notes |
| `guides` | /guides | Long-form step-by-step guides |
| `compare` | /compare | "X vs Y" programmatic SEO |
| `alternative` | /alternative | "Best alternatives to X" |
| `prompt` | /prompt | Prompt library articles |
| `skills` | /skills | Published skill articles |

posts extras: seo_title (≤60), seo_description (≤160), seo_keywords, content_type, word_count, reading_time_mins, internal_links JSON, sources JSON

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
profile_analytics: total_clicks, analytics_7d/30d/12m/lifetime JSON, revenue_30d/12m/lifetime JSON
product_analytics: total_sales, total_revenue_cents, sales_30d JSON

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
