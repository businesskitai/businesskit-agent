# Domain Mappings

This document maps each business domain to its underlying SQLite tables, views, and triggers across the UserDB. 
**Note:** All schema definitions (tables, views, triggers) are driven by the respective domain files in `src/lib/*.ts`.

## Core Platform (`src/lib/provision.ts`)
**Tables:**
- `profiles`, `users`, `settings`, `credentials`
- `categories`, `collections`, `category_pages`
- `links`, `link_analytics`, `link_analytics_by_category`
- `clicks_analytics`
- `profile_analytics`
- `profile_data`
- `products`, `product_analytics`, `purchases`, `gateways`
- `pages`, `page_analytics`
- `media`, `sliders`, `slider_items`
- `sessions`, `subscribers`

**Triggers:**
- `trg_products_no_delete`
- `trg_purchases_no_delete`
- `trg_subscribers_no_hard_delete`

## Content / CMS (`src/lib/content.ts`)
**Tables:**
- `cms_tables` (unified content like blogs, guides, notes, etc.)
- `cms_analytics`

**Views:**
- `view_cms_published`

**Triggers:**
- `after_cms_insert` / `after_cms_update` / `after_cms_delete`

## CRM & Sales (`src/lib/crm.ts`)
**Tables:**
- `crm_contacts`, `crm_deals`, `crm_activities`, `crm_notes`, `crm_tasks`
- `crm_groups`, `crm_contact_groups`, `crm_templates`
- `crm_proposals`, `crm_invoices`, `crm_imports`, `crm_analytics`

**Views & Triggers:**
- Defined in `crm.ts` (e.g., pipeline progression, activity aggregation)

## Community (`src/lib/community.ts`)
**Tables:**
- `community_profiles`, `community_spaces`
- `community_members`, `community_posts`, `community_comments`
- `community_events`, `community_leaderboard`
- `community_analytics`

**Views & Triggers:**
- Defined in `community-triggers.ts` and `community.ts`

## Forms (`src/lib/forms.ts`)
**Tables:**
- `forms`, `questions`, `submissions`, `form_analytics`

**Triggers:**
- Syncs with `cms_analytics` via `after_form_insert` / `update` / `delete`

## Jobs (`src/lib/jobs.ts`)
**Tables:**
- `job_listings`, `job_applications`

**Triggers:**
- Syncs with `cms_analytics` via `after_job_insert` / `update` / `delete`

## Social Media (`src/lib/social.ts`)
**Tables:**
- `social_accounts`, `social_posts`, `social_queue`, `social_analytics`

## AI Agents (`src/lib/agent.ts`)
**Tables:**
- `agents`, `agent_skills`, `agent_tasks`, `agent_memory`

## Affiliate Program (`src/lib/affiliate.ts`)
**Tables:**
- `user_affiliate_programs`
- `user_affiliate_commissions`
- `user_affiliate_payouts`

## Email Tracking (`src/lib/email-tracking.ts`)
**Tables:**
- `email_tracking_events`, `email_tracking_stats`

## Feedback & Reviews (`src/lib/feedback.ts`, `src/lib/review.ts`)
**Tables:**
- `feedback_boards`, `feedback_posts`, `feedback_votes`
- `reviews`, `review_analytics`

## Google Search Console (`src/lib/gsc.ts`)
**Tables:**
- `gsc_sites`, `gsc_analytics`

## Ads (`src/lib/ads.ts`)
**Tables:**
- `ads_campaigns`, `ads_analytics`
