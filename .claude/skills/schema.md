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
crm_contacts: lead_score 0-100, icp_match (strong|moderate|weak|unknown), outreach_status, agent_status (pending→researching→enriched→outreach_ready→closed), agent_context JSON, auto_approve INT, suggested_dm, email_draft
crm_activities: type, direction (inbound|outbound), sender (agent|you|contact), body, approval_status (pending|approved|auto_sent|rejected)
crm_deals: contact_id, title, value_cents, stage (new|contacted|proposal|negotiation|won|lost)
crm_analytics: DB triggers keep this in sync — never update manually

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
