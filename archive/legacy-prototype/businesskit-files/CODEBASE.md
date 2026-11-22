# CODEBASE.md

> Find the feature area → go to its entry point → follow imports. Never read `database-service.ts` top-to-bottom; search for the function you need.

---

## Route Map

### Public Routes
| Route | Entry Point | Notes |
|---|---|---|
| `/` | `src/routes/index.tsx` | Landing page (42KB) |
| `/[username]` | `src/routes/[username]/index.tsx` | Public profile home — reads userDB via sharedMap |
| `/[username]/[category]` | `src/routes/[username]/[category]/` | Per-category profile page |
| `/[username]/blog` / `docs` / `about` / `jobs` / `all` / `p` / `landing` / `course` / `access` | `src/routes/[username]/*/` | Content sub-pages per user |
| `/community/[slug]` | `src/routes/community/[slug]/` | Public community page |
| `/store` | `src/routes/store/` | Public storefront |
| `/blog` / `/guides` / `/notes` / `/prompt` / `/skills` / `/compare` / `/alternative` | `src/routes/blog/` etc. | ⚠️ Platform content pages — **planned migration to `/dashboard/content`** |
| `/pricing` | `src/routes/pricing/` | Pricing page |
| `/about` / `/docs` / `/customers` / `/sales` / `/demo` | `src/routes/*/` | Marketing + public pages |
| `/llms.txt` / `/llms-full.txt` | `src/routes/llms*/` | LLM-readable site manifest |
| `/privacy` / `/terms` / `/refund-policy` | `src/routes/*/` | Legal pages |

### Dashboard Routes (auth-gated)
| Route | Notes |
|---|---|
| `/dashboard` | Creator dashboard home |
| `/dashboard/profile` | Profile editor — links, page visibility, link modals (63KB) |
| `/dashboard/analytics` | Full analytics dashboard (51KB) |
| `/dashboard/community` | Community management hub |
| `/dashboard/community/[communityId]` | Per-community management |
| `/dashboard/crm` | CRM root → `/dashboard/contacts` |
| `/dashboard/contacts` | Contacts list + search (11KB) |
| `/dashboard/contacts/[id]` | Contact detail view |
| `/dashboard/contacts/analytics` / `deals` / `tasks` / `inbox` | CRM sub-sections |
| `/dashboard/newsletter` | Newsletter + email analytics (19KB) |
| `/dashboard/social` | Social media hub |
| `/dashboard/social/posts` / `queue` / `accounts` / `analytics` / `calendar` / `inbox` | Social sub-sections |
| `/dashboard/agents` | AI agent dashboard (19KB) |
| `/dashboard/agents/[agentType]` | Per-agent-type view |
| `/dashboard/agents/files` / `tasks` | Agent file manager + task queue |
| `/dashboard/live-agent` | Live agent interface (30KB) |
| `/dashboard/chat-agent` | Conversational AI agent (19KB) |
| `/dashboard/affiliate` | Affiliate program hub |
| `/dashboard/affiliate/overview` / `commissions` / `referrers` / `payouts` / `settings` | Affiliate sub-sections |

> **Two affiliate systems — do not confuse them:**
> | System | Route | DB | Tables |
> |---|---|---|---|
> | Platform affiliate (`?ref=` signups) | `plugin.ts` inline + `/routes/affiliate/` | **Central DB** | `affiliate_profiles` (schema.ts) |
> | Creator affiliate program | `/dashboard/affiliate/` | **UserDB** | `user_affiliate_programs`, `user_affiliate_referrers`, `user_affiliate_commissions`, `user_affiliate_payouts` |
> | Payout accounts | `/routes/affiliate/` | **Central DB** | `payout_accounts` (schema.ts) — stored once per promoter, never copied to UserDB |


| `/dashboard/blogs` | Blog post manager (24KB) |
| `/dashboard/guides` | Guides manager — **⚠️ → /dashboard/content/guides** |
| `/dashboard/notes` | Notes manager — **⚠️ → /dashboard/content/notes** |
| `/dashboard/prompt` | Prompt library — **⚠️ → /dashboard/content/prompts** |
| `/dashboard/skills` | Skills manager — **⚠️ → /dashboard/content/skills** |
| `/dashboard/compare` | Compare pages — **⚠️ → /dashboard/content/compare** |
| `/dashboard/alternative` | Alternative pages — **⚠️ → /dashboard/content/alternative** |
| `/dashboard/docs` | Knowledge base manager (20KB) |
| `/dashboard/collections` | Link collections / SEO settings |
| `/dashboard/testimonials` | Testimonials manager |
| `/dashboard/cms` | Custom page editor |
| `/dashboard/forms` | Forms manager |
| `/dashboard/jobs` | Job board manager |
| `/dashboard/c` | Category management sub-routes |
| `/dashboard/settings` | Account settings |
| `/dashboard/settings/connections` | OAuth + external connections |
| `/dashboard/new-profile` | Profile creation wizard |

### API Routes
| Route | Notes |
|---|---|
| `/api/analytics` | POST → ANALYTICS_QUEUE or direct write to userDB |
| `/api/chat-agent` | AI chat stream endpoint |
| `/api/community` | Community actions (join, post, react) |
| `/api/contacts` / `/api/crm` | CRM API |
| `/api/create-checkout` | Paddle checkout session |
| `/api/create-customer-portal` | Paddle customer portal |
| `/api/download` | Purchase-gated file download |
| `/api/subscribe` / `/api/unsubscribe` | Email list management |
| `/api/feed` | Activity feed |
| `/api/social` | Social post publish/schedule |
| `/api/docs` | Knowledge base API |
| `/api/rate-product` | Product rating |
| `/api/track-access` | Access token validation |
| `/api/update-course-progress` | Course progress |
| `/api/ai-summarize` | AI summarization |
| `/api/voice` | Voice/STT |
| `/api/user` | User profile updates |
| `/api/webhooks` | Paddle + external webhooks |

### Auth & Infra
| Route | Notes |
|---|---|
| `/auth` | WorkOS OAuth callback |
| `/login` / `/register` | Auth entry points |
| `/onboarding` | 3-step: Turso → WorkOS → optional keys |
| `/status` | UserDB table checker + provision button |

---

## Pending: Content Section Consolidation

These routes will merge under `/dashboard/content` once backend is built:

| Current | Target |
|---|---|
| `/dashboard/guides` | `/dashboard/content/guides` |
| `/dashboard/notes` | `/dashboard/content/notes` |
| `/dashboard/prompt` | `/dashboard/content/prompts` |
| `/dashboard/skills` | `/dashboard/content/skills` |
| `/dashboard/compare` | `/dashboard/content/compare` |
| `/dashboard/alternative` | `/dashboard/content/alternative` |

Public-facing counterparts (`/guides`, `/notes`, `/prompt`, `/skills`, `/compare`, `/alternative`) are platform content pages that follow the same migration.

---

## Entry Points by Feature

| Feature | Entry Point |
|---|---|
| CF Worker entrypoint | `src/entry.cloudflare-pages.tsx` |
| Global middleware (routing, auth, DB init) | `src/routes/plugin.ts` ⚠️ |
| Public profile (main) | `src/routes/[username]/index.tsx` |
| Public profile page data | `src/routes/[username]/profile-data.ts` (52KB) |
| Public profile renderer | `src/routes/[username]/public-profile-page.tsx` (65KB) |
| All DB queries | `src/lib/database-service.ts` |
| Central DB schema | `src/db/schema.ts` + `src/db/central-schema.ts` |
| User DB schema | `src/db/user-schema.ts` |
| User DB provisioning | `src/lib/provision.ts` |
| Analytics queue consumer | `src/queues/analytics-consumer.ts` |

---

## Library (`src/lib/`)

### Core Infrastructure
| File | Description |
|---|---|
| `database-service.ts` | ⚠️ ALL DB queries via raw libSQL — `DatabaseService.*` static methods. Uses `getDatabaseClient(env)` or `resolveDBEnv(sharedMap,env)` (129KB — search, don't read top-to-bottom) |
| `db.ts` | Central Turso client singleton |
| `central-db.ts` | Drizzle singleton merging `schema.ts` + `central-schema.ts` |
| `user-db.ts` | Per-request user Drizzle factory — `createUserDrizzle(url, token)`. NEVER module-level |
| `user-db-env.ts` | `resolveDBEnv(sharedMap,env)` — wraps `userClient` into a fake env so `DatabaseService.*` methods query userDB transparently. `UserDBEnv` class. |
| `user-db-loader.ts` | `resolveUserDBForDashboard()` — session → profile → decrypt → client |
| `creds-cache.ts` | Worker Memory Map: `slug → decrypted creds`, 5-min TTL, `invalidateCreds(slug)` |
| `vault.ts` | AES-256-GCM encrypt/decrypt (`crypto.subtle` only) |
| `provision.ts` | `CREATE TABLE IF NOT EXISTS` for all UserDB tables at signup. Seeds categories + doc_collections |

### Auth & Billing
| File | Description |
|---|---|
| `workos-authkit.ts` | Manual WorkOS REST client — reads from `sharedMap["workos"]`, not `event.env` |
| `auth-server.ts` | Session cookie validation (per-profile WorkOS config) |
| `workos.ts` / `workos-server.ts` | WorkOS config helpers |
| `paddle.ts` | Paddle API: checkout, webhook, cancel subscription |
| `stripe.ts` | Stripe (secondary/legacy) |
| `plans.ts` | `PRICING_PLANS` array (Pro / Business / Enterprise) |

### Domain Services
| File | Description |
|---|---|
| `community.ts` | Community schema types + core helpers (54KB) |
| `community-service.ts` | Community DB operations — members, posts, events, leaderboard (48KB) |
| `community-triggers.ts` | DB trigger definitions for community analytics (31KB) |
| `community-public-loader.ts` | Public-facing community page loader |
| `crm.ts` | CRM types + core logic — contacts, deals, activities, notes, tasks (43KB) |
| `crm-service.ts` | CRM DB operations (47KB) |
| `email-tracking.ts` | Email tracking schema + event types — opens, clicks, bounces (37KB) |
| `email-tracking-service.ts` | Email tracking DB operations + purchase-level engagement (41KB) |
| `social.ts` | Social features types + logic (50KB) |
| `social-service.ts` | Social DB operations (24KB) |
| `affiliate.ts` | Affiliate program types + commission logic (10KB) |
| `affiliate-service.ts` | Affiliate DB operations — commissions, payouts, referrals (25KB) |
| `agent.ts` | AI agent types + tool definitions (23KB) |
| `agent-service.ts` | AI agent DB operations (24KB) |
| `analytics-service.ts` | Analytics aggregation service (39KB) |
| `content.ts` | Content helpers |
| `content-service.ts` | Content DB operations (22KB) |
| `connections-service.ts` | Connections/follows service |
| `payout-service.ts` | Payout account management |
| `platform-email.ts` | Platform transactional email (SES) — 18KB |
| `product-triggers.ts` | DB triggers for product/purchase analytics |

### UI / Profile
| File | Description |
|---|---|
| `design-system.ts` | ⚠️ All design tokens — colors, typography, spacing, CSS vars, light/dark theme |
| `profile-theme.ts` | Per-profile custom theme (colors, fonts overrides) |
| `seo-utils.ts` | OG tags + meta description builders |
| `metadata.ts` | Page metadata object generator |
| `profile-loader.ts` | Load profile from sharedMap or DB for routeLoaders |
| `cache-headers.ts` | `setPublicCache()` / `setNoCache()` — CF edge caching helpers |

### Analytics
| File | Description |
|---|---|
| `analytics-client.ts` | Browser: `trackLinkClick()`, `trackProfileVisit()` via `sendBeacon` |
| `analytics-batcher.ts` | Client-side event batching |
| `smart-analytics.ts` | Routes events to queue (high traffic) vs direct fetch |

### Utilities
| File | Description |
|---|---|
| `cloudflare-api.ts` | CF REST API — DNS records, custom domain verify |
| `reserved-slugs.ts` | `INFRA_SUBDOMAINS` + `RESERVED_SLUGS` blocklists |
| `collect-emails.ts` | Email subscriber collection helper |
| `sync-product-page-settings.ts` | Sync product visibility → page_settings |
| `store-validation.ts` | Store product validation |
| `tiptap-to-md.ts` | TipTap rich text → Markdown converter |
| `forms.ts` / `forms-service.ts` | Forms schema + DB operations |
| `paddle.ts` / `stripe.ts` | Billing APIs |

### Thin Services (`src/lib/services/`)
| File | Description |
|---|---|
| `analytics-service.ts` | Thin analytics service shim |
| `link-service.ts` | Link CRUD thin wrapper |
| `product-service.ts` | Product CRUD thin wrapper |
| `profile-service.ts` | Profile CRUD thin wrapper |
| `purchase-service.ts` | Purchase thin wrapper |
| `subscription-service.ts` | Subscription thin wrapper |
| `index.ts` | Re-exports |

---

## Components (`src/components/`)

### Top-Level (Shared)
| Component | Description |
|---|---|
| `ThinSidebar.tsx` | Dashboard main sidebar nav (20KB) |
| `ChatWidget.tsx` | AI chat widget with tool calling (83KB — do not casually edit) |
| `TipTapEditor.tsx` | Rich text editor component (20KB) |
| `LinkModal.tsx` | Link-in-bio link create/edit modal (36KB) |
| `ArticleForm.tsx` | Blog/KB article form (32KB) |
| `CoverImageModal.tsx` | Cover image upload/crop modal (20KB) |
| `UserSettings.tsx` | Centralized user settings modal (dual-write central + userDB) |
| `ContactsDetails.tsx` | CRM contact detail view (17KB) |
| `DashboardNavBar.tsx` | Dashboard top nav bar |
| `CategorySidebar.tsx` | Category navigation sidebar (12KB) |
| `PageTypesModal.tsx` | Page visibility type selector modal |
| `SeoSettingsModal.tsx` | SEO settings modal (13KB) |
| `AppsDashboardCard.tsx` | App quick-access card grid (9KB) |
| `ProductTable.tsx` | Product listing table |
| `SEOStructuredData.tsx` | JSON-LD structured data injector |
| `AgentSidebar.tsx` / `AgentTabs.tsx` | Agent dashboard nav |
| `CrmTabs.tsx` / `AffiliateTabs.tsx` / `SocialTabs.tsx` | Section tab navs |
| `LandingNavbar.tsx` / `LandingFooter.tsx` | Marketing page chrome |
| `LocationPicker.tsx` | Google Maps location picker |
| `TimezoneSelect.tsx` | Timezone selector |
| `WorkingHoursPicker.tsx` | Working hours form component |

### CRM (`components/contactsx/`)
| Component | Description |
|---|---|
| `AddContacts.tsx` | Add contact form |
| `AddDeals.tsx` | Add deal form |
| `AddActivities.tsx` | Add activity form |
| `AddNotes.tsx` | Add note form |
| `AddTask.tsx` | Add task form |

### Community (`components/communityx/`)
| Component | Description |
|---|---|
| `CommunityNavbar.tsx` | Community section nav |
| `CommunityTabs.tsx` | Community tabs (Feed/Members/Events/etc.) |
| `CommunityPostLists.tsx` | Post feed list |
| `CreateCommunityPost.tsx` | Post creation form |
| `CommunityMembers.tsx` | Members list + search |
| `CommunityLeaderboards.tsx` | Points/rank leaderboard |
| `CommunityCalendar.tsx` | Events calendar |
| `CommunityAnalytics.tsx` | Community analytics view |
| `CommunityAbout.tsx` | About/info tab |
| `CommunityInfo.tsx` | Community info editor |
| `CommunityCreatePopup.tsx` | Create community popup |
| `AddCommunityEvent.tsx` | Add event form |

---

## Database Tables

### Central DB (`src/db/schema.ts` READ-ONLY + `src/db/central-schema.ts`)
| Table | Purpose |
|---|---|
| `users` | Auth identity — `workosId`, `email` |
| `profiles` | Routing key — `slug`, `userId` FK |
| `userdb` | Per-profile: Turso URL + encrypted token |
| `userauth` | Per-profile: WorkOS clientId + encrypted apiKey + redirectUri |

### User DB (`src/db/user-schema.ts` + `src/lib/provision.ts`)
All provisioned in user's own Turso at onboarding via `provisionUserDatabase()`.

| Table | Purpose |
|---|---|
| `users` / `profiles` | Mirror of central (dual-written on update) |
| `credentials` | SES, OpenAI, Anthropic, Resend, n8n |
| `settings` | Site title, logo, theme JSON |
| `categories` / `collections` | Link categories + per-category SEO |
| `links` / `link_analytics` | Link-in-bio + click analytics |
| `page_settings` | Per-page visibility config (28+ page types) |
| `products` / `product_analytics` | Digital products + sales analytics |
| `profile_analytics` | Profile-level traffic + revenue |
| `purchases` | Purchase records + access tokens + course progress + email engagement |
| `sessions` | Auth session tokens |
| `subscribers` | Email subscribers |
| `gateways` | Payment gateway config (Stripe/Paddle per-profile) |
| `pages` | Custom landing/about pages |
| `posts` | Blog posts |
| `job_listings` / `job_applications` | Job board |
| `forms` / `questions` / `submissions` / `form_analytics` | Forms |
| `doc_collections` / `doc_articles` | Knowledge base |
| `community_*` | Community members, posts, events, reactions, leaderboard |
| `crm_contacts` / `crm_deals` / `crm_activities` / `crm_notes` / `crm_tasks` | CRM |
| `email_tracking_events` / `email_tracking_stats` | Email open/click/bounce tracking |
| `affiliate_commissions` / `payout_accounts` | Affiliate program |

---

## Do Not Touch

| File | Reason |
|---|---|
| `src/qwik-city-plan.ts` | Auto-generated — overwritten every build |
| `worker-configuration.d.ts` | Auto-generated by `wrangler types` |
| `src/db/migrations/` | Never edit existing — use drizzle-kit for new ones |
| `src/db/schema.ts` | Read-only — add to `central-schema.ts` instead |
| `src/routes/plugin.ts` subdomain logic | Any bug breaks ALL profile routing |
| `src/lib/reserved-slugs.ts` | Blocks usernames permanently — add carefully |
| `src/lib/creds-cache.ts` | Wrong TTL/invalidation = stale creds = wrong DB served |
