# ARCHITECTURE.md

## Identity

- **Product**: BusinessKit — multi-tenant SaaS: link-in-bio, creator profiles, digital products, community, CRM, email analytics, affiliate.
- **Domain**: `businesskit.io` (main), `*.businesskit.io` (user subdomains), custom domains.
- **Runtime**: Qwik + QwikCity as a **Cloudflare Worker** (via `wrangler deploy` — NOT Cloudflare Pages; the adapter folder name is misleading).

---

## Request Flow

```
Browser Request
  ↓
CF Edge Cache HIT → return cached HTML (Worker never runs)
  ↓ MISS
CF Worker  [entry.cloudflare-pages.tsx]
  ├─ Infra subdomain? (n8n.businesskit.io, etc.) → 421 immediately
  ↓
plugin.ts  [runs on every request]
  ├─ Extract slug from hostname
  ├─ Worker Map HIT (99%) → inject cached creds → sharedMap → done
  └─ MISS (cold path):
       centralDB JOIN (profiles + users + userdb + userauth) WHERE slug = ?
       → vault.ts decrypt tursoAuthToken + workosApiKey
       → setCachedCreds(slug, ...) — Worker Map warmed (5-min TTL)
  ↓
sharedMap injected:
  sharedMap["profile"]    = { id, slug, email }
  sharedMap["workos"]     = { clientId, apiKey, redirectUri }
  sharedMap["userDB"]     = drizzle(their Turso)  ← per-request
  sharedMap["userClient"] = raw libSQL client
  ↓
layout.tsx → route handlers (src/routes/**/index.tsx)
  ├─ routeLoader$  → reads sharedMap["userDB"] for content queries
  ├─ routeAction$  → form/mutation handling, writes to userDB
  └─ component$    → UI
```

---

## Database Architecture

```
Central DB (OUR Turso)                    User DB (THEIR Turso — provisioned at onboarding)
├── users          (auth identity)        ├── users / profiles       (dual-written mirror)
├── profiles       (routing slug)         ├── credentials            (SES, OpenAI, Anthropic, Resend)
├── userdb         (their Turso URL +     ├── settings / categories / collections
│                   encrypted token)      ├── links / link_analytics
└── userauth       (their WorkOS creds    ├── page_settings          (28+ page type visibility)
                    + encrypted apiKey)   ├── products / product_analytics / profile_analytics
                                         ├── purchases              (+ email_opened_at, email_open_count)
                                         ├── sessions / subscribers / gateways / pages
                                         ├── posts / job_listings / job_applications
                                         ├── forms / questions / submissions / form_analytics
                                         ├── doc_collections / doc_articles
                                         ├── community_* tables     (members, posts, events, leaderboard)
                                         ├── crm_contacts / crm_deals / crm_activities / crm_notes / crm_tasks
                                         ├── email_tracking_events / email_tracking_stats
                                         └── affiliate_commissions / payout_accounts
```

**Central DB only answers**: *"Given slug `alice`, what Turso URL/token and WorkOS creds do I use?"*

---

## Worker Map Cache

```
slug → { tursoUrl, tursoToken (decrypted), workosClientId, workosApiKey (decrypted), redirectUri }
TTL: 5 minutes
Invalidation: invalidateCreds(slug) — called after every userdb / userauth update
```

---

## Folder Structure

```
src/
├── entry.cloudflare-pages.tsx  CF Worker entrypoint + ANALYTICS_QUEUE export
├── entry.ssr.tsx               SSR render function
├── root.tsx                    HTML shell: QwikCityProvider, RouterHead, RouterOutlet, Paddle init
├── global.css                  Base styles
├── qwik-city-plan.ts           Auto-generated route manifest (do not touch)
│
├── routes/
│   ├── plugin.ts               ⚠️ Global middleware (Worker Map → cold JOIN → sharedMap)
│   ├── layout.tsx              Root layout (header/footer logic, design-system vars)
│   ├── index.tsx               Landing page (42KB)
│   │
│   ├── [username]/             Public profile pages
│   │   ├── [category]/         Per-category page
│   │   ├── blog/ docs/ about/ jobs/ course/ access/ all/ p/ landing/
│   │   ├── profile-data.ts     Profile data aggregation (52KB)
│   │   └── public-profile-page.tsx  Profile renderer (65KB)
│   │
│   ├── dashboard/              Auth-gated creator dashboard
│   │   ├── profile/            Profile editor (63KB)
│   │   ├── analytics/          Analytics (51KB)
│   │   ├── community/          Community hub + [communityId]/
│   │   ├── contacts/           CRM contacts + [id]/ analytics/ deals/ tasks/ inbox/
│   │   ├── crm/                CRM root (redirects to contacts)
│   │   ├── newsletter/         Newsletter + email analytics
│   │   ├── social/             Social hub + posts/ queue/ accounts/ analytics/ calendar/ inbox/
│   │   ├── agents/             AI agents + [agentType]/ files/ tasks/
│   │   ├── live-agent/         Live agent interface
│   │   ├── chat-agent/         Conversational AI agent
│   │   ├── affiliate/          Affiliate + overview/ commissions/ referrers/ payouts/ settings/
│   │   ├── content/            Unified CMS (blogs, guides, notes, prompts, etc.)
│   │   ├── docs/               Knowledge base manager (separate tables)
│   │   ├── store/              Store manager (downloads, courses, webinars, meeting, booking, listing, sponserships, events etc.)
│   │   ├── collections/        Link collections / SEO
│   │   ├── testimonials/       Testimonials
│   │   ├── cms/                Custom page editor
│   │   ├── forms/              Forms manager
│   │   ├── jobs/               Job board
│   │   ├── c/                  Category sub-routes
│   │   ├── settings/           Account settings + connections/
│   │   └── new-profile/        Profile creation wizard
│   │
│   ├── community/[slug]/       Public community page
│   ├── api/                    22 API endpoints (analytics, webhooks, checkout, social, crm, voice…)
│   ├── auth/                   WorkOS OAuth callback
│   ├── onboarding/             3-step: Turso → WorkOS → optional keys
│   ├── pricing/                Pricing page
│   ├── blog/ guides/ notes/ prompt/ skills/ compare/ alternative/  Platform content (⚠️ migrating)
│   ├── llms.txt/ llms-full.txt LLM-readable manifests
│   ├── about/ docs/ customers/ sales/ demo/  Marketing pages
│   ├── privacy/ terms/ refund-policy/  Legal
│   ├── login/ register/        Auth entry
│   └── status/                 UserDB health checker
│
├── components/
│   ├── ChatWidget.tsx          AI chat (83KB — treat carefully)
│   ├── TipTapEditor.tsx        Rich text editor
│   ├── ThinSidebar.tsx         Dashboard sidebar nav
│   ├── LinkModal.tsx           Link create/edit modal
│   ├── UserSettings.tsx        Settings modal (dual-write)
│   ├── communityx/             Community components (12 files)
│   ├── contactsx/              CRM add-form components (5 files)
│   ├── agentsx/                Agent components
│   ├── public/                 Public profile components
│   ├── forms/                  Form builder components
│   └── ...
│
├── lib/                        Server-side logic and services (62 files)
│   ├── database-service.ts     ⚠️ All DB queries (resolveDBEnv)
│   ├── community.ts / community-service.ts / community-triggers.ts
│   ├── crm.ts / crm-service.ts
│   ├── email-tracking.ts / email-tracking-service.ts
│   ├── social.ts / social-service.ts
│   ├── affiliate.ts / affiliate-service.ts
│   ├── agent.ts / agent-service.ts
│   ├── analytics-service.ts / smart-analytics.ts / analytics-client.ts / analytics-batcher.ts
│   ├── platform-email.ts       Transactional email (SES)
│   ├── design-system.ts        ⚠️ All design tokens
│   ├── provision.ts            UserDB table provisioning
│   ├── creds-cache.ts          Worker Map cache
│   ├── vault.ts                AES-256-GCM encryption
│   └── ...
│
├── db/
│   ├── schema.ts               Central schema READ-ONLY
│   ├── central-schema.ts       userdb + userauth tables
│   ├── user-schema.ts          All UserDB Drizzle types
│   └── migrations/             Central DB only
│
└── queues/
    └── analytics-consumer.ts   CF Queue consumer → writes to userDB analytics tables
```

---

## Data Flows

### Public Profile Request

```
1. CF Edge Cache HIT → return HTML (Worker skipped)
2. MISS → plugin.ts:
   Worker Map HIT → inject sharedMap → route
   MISS → centralDB JOIN → decrypt → cache → inject sharedMap
3. [username]/index.tsx routeLoader$ → queries userDB (links, page_settings, products)
4. component$ renders → setPublicCache() → CF caches response
5. Analytics: sendBeacon → /api/analytics/track → ANALYTICS_QUEUE → analytics-consumer.ts → userDB
```

### Dashboard Mutation

```
1. routeAction$ handles POST:
   - sharedMap.get("userDB") → Drizzle client for user's Turso
   - writes to user's Turso (primary)
   - dual-writes profile updates to central Turso (for routing consistency)
2. Qwik City auto-revalidates routeLoader$ → UI updates reactively
```

### Auth Flow

```
plugin.ts → sharedMap["workos"] = { clientId, apiKey, redirectUri }  (decrypted)
auth/login → workos-authkit.ts reads sharedMap["workos"]  (NOT event.env.WORKOS_*)
auth/callback → validates code → sets session cookie
auth-server.ts → validates session using per-profile WorkOS config
```

### Onboarding (new user)

```
Step 1: Connect Turso → Step 2: Connect WorkOS → Step 3: Optional (SES, AI keys)
completeOnboarding action:
  1. vault.ts encrypt tokens
  2. Upsert userdb + userauth in Central DB
  3. provision.ts — CREATE TABLE IF NOT EXISTS on THEIR Turso
  4. Insert credentials in THEIR Turso (SES/LLM if provided)
  5. setCachedCreds(slug) — prime Worker Map
  6. Redirect to /dashboard
```

---

## Key Invariants (Never Break)

```
1.  centralDB     = module singleton (lib/central-db.ts)
2.  userDB        = per-request from sharedMap — NEVER module-level
3.  Worker Map    = slug → creds, 5-min TTL
4.  invalidateCreds(slug) after EVERY userdb or userauth update
5.  WorkOS creds  = sharedMap["workos"] — never event.env.WORKOS_* in routes
6.  SES/LLM keys  = credentials table in THEIR Turso — never central DB
7.  Drizzle everywhere — no raw SQL
8.  setPublicCache() on all public routeLoader$
9.  setNoCache() on all dashboard/auth/api routeLoader$
10. schema.ts     = read-only — add new tables to central-schema.ts
11. No cross-DB joins. Central = routing only. UserDB = all content.
```

---

## Key Decisions

| Decision | Rationale |
|---|---|
| Dual-Turso | Central for routing/auth only; user owns their data |
| Worker Map cache | Eliminates cold DB lookup for 99% of requests |
| Per-user WorkOS | "Bring your own auth" — users own their auth config |
| Full Drizzle | Type safety, autocomplete, no SQL injection risk, one pattern |
| CF Edge caching | Target 90%+ cache hit on public profiles |
| Subdomain-per-user routing | `username.businesskit.io` via plugin.ts + CF Routes wildcard |
| No React/Next.js | Qwik resumability — zero hydration cost on public pages |
| Paddle primary billing | Stripe exists legacy only |
| WebCrypto only | `crypto.subtle` works on CF Workers; Node.js crypto does not |

## Domain Mappings

For a detailed mapping of business domains to their underlying UserDB tables, views, and triggers, see [DOMAINS.md](./DOMAINS.md).
