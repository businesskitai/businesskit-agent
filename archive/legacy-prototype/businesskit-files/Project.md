# BusinessKit — Project Reference

## Stack

- **Qwik + QwikCity** — full-stack framework, SSR for public profiles, CSR for dashboard
- **Cloudflare Workers** — edge runtime (NOT Pages, NOT Node.js)
- **Turso** (libSQL) — **two instances**: Central DB (routing/auth) + User DB (their content)
- **WorkOS** — auth, per-user (user brings their own WorkOS credentials)
- **Paddle** — primary billing | Stripe — legacy/secondary
- **Tailwind CSS v4 + Flowbite Qwik** — UI components
- **Drizzle** — schema + query builder (used for ALL queries now, not schema-only)
- TypeScript strict, ESM only

## Database Architecture — "Bring Your Own DB"

> **Vision**: "Bring your own credentials, use our platform."

### Philosophy: Agent-First Data Ownership

BusinessKit empowers the modern AI era by treating your database as the ultimate source of truth, decoupled from traditional monolithic app constraints. By provisioning a hyper-isolated, user-owned Turso Database (UserDB) layered with intelligent SQL triggers, autonomous agents (like Claude Code or Antigravity) can safely query, enrich, and operate your entire business directly. This architecture drastically reduces cloud compute costs, eliminates platform lock-in, and enables limitless "Bring Your Own Agent" productivity at scale.

### Central DB (Our Turso)

Answers only one question: *"Given slug `alice`, what Turso URL/token and WorkOS creds do I use?"*

| Table | Role |
|---|---|
| `users` | Auth identity — `workosId`, `email` |
| `profiles` | Subdomain routing — `slug` = Worker Map key, `userId` → FK to `users` |
| `userdb` | Per-profile Turso URL + encrypted auth token |
| `userauth` | Per-profile WorkOS Client ID + encrypted API key + redirect URI |

### User DB (Their Turso)

Everything else — credentials, content, data — lives **in the user's own Turso instance**.

| Table | What's stored |
|---|---|
| `users` | **Exact mirror of central `users`** — their own auth users database |
| `profiles` | **Exact mirror of central `profiles`** — dual-written from central on every profile update |
| `credentials` | SES keys, OpenAI, Anthropic, Resend, n8n webhook URL |
| `settings` | Site title, logo URL, theme JSON |
| `categories` | Link categories (seeded from central — stable IDs match central FK values) |
| `links` | Link-in-bio links |
| `link_analytics` | Per-link click analytics |
| `page_settings` | Page visibility config (28+ page types) |
| `collections` | Per-category SEO settings |
| `products` | Digital products |
| `product_analytics` / `profile_analytics` | Sales + revenue + traffic analytics |
| `purchases` | Purchase records with access tokens + course progress |
| `sessions` | Auth session tokens |
| `subscribers` | Email subscribers |
| `gateways` | Payment gateway config (Stripe/Paddle per-profile) |
| `pages` | Custom landing / about pages |
| `posts` | Blog posts (previously Cosmos DB) |
| `job_listings` / `job_applications` | Job board (previously CockroachDB) |
| `forms` / `questions` / `submissions` / `form_analytics` | Forms (previously TimescaleDB) |
| `doc_collections` / `doc_articles` | Knowledge base docs (previously D1) |

### Worker Map Cache (slug → decrypted creds, 5-min TTL)

Cached after first cold-path lookup. `invalidateCreds(slug)` called on every credential update.

## DB Isolation Rule

**Only Turso.** All other databases (Cosmos DB, CockroachDB, TimescaleDB, D1) have been removed.
No cross-domain joins. Central DB only for routing/auth lookup. User DB for all content.

## Cloudflare Workers Compatibility

- ❌ No Node.js built-ins: `fs`, `path`, `net`, `http`, `child_process`
- ✅ Use Web APIs: `fetch`, `Request`, `Response`, `URL`, `crypto.subtle`
- ❌ No `require()` — ESM imports only
- ❌ No native binaries: `sharp`, `bcrypt`, etc.
- `nodejs_compat` flag = polyfill only (`process.env`, `Buffer`) — NOT real Node.js
- Rule: package uses `fetch` internally → works. Uses TCP/file I/O → breaks.

## Key Rules

- **Profile routing**: subdomain-based (`username.businesskit.io`), not path-based
- **Design**: always use `design-system.ts` for light/dark theme tokens
- **Layout**: Div + Gap + Padding (avoid Margin)
- **Mobile-first**, fully responsive
- **Cost**: optimize to minimize Worker requests (CF Edge cache + Worker Map)
- **Do not deploy or commit without permission**
- ⚠️ Turso has no local DB — dev queries hit live production data
- **Full Drizzle query builder everywhere** — no raw SQL
- **`invalidateCreds(slug)`** on every `userdb` or `userauth` update

## Documentation Files

| File | Contents |
|---|---|
| `AGENTS.md` | AI agent contract — runtime constraints, DB rules, Qwik patterns, forbidden actions, do-not-touch list |
| `CLAUDE.md` | Engineering notes — core mental model, common gotchas with code examples, route quick-reference, common bugs |
| `ARCHITECTURE.md` | Request flow, DB architecture, full folder + route tree, data flows, key invariants, decisions |
| `CONTEXT.md` | Qwik patterns cheatsheet, dual-Turso model, CF bindings, env vars, gotchas, commands |
| `CODEBASE.md` | Full route map, every lib/component file with description, DB table list, do-not-touch list |
| `DESIGN_PRINCIPLES.md` | Naming conventions, state management, error patterns, CSS conventions, anti-patterns, domain service map |
| `TECH_STACK.md` | Every library with version + rationale, CF services, version constraints, removed packages |
| `ENTERPRISE_PRICING_GUIDELINE.md` | Enterprise plan tiers, pricing structure, contract terms |

## Card Data Not Showing — 5-Point Checklist

1. `mapLinkRow()` in `database-service.ts` ~line 870 — check `JSON.parse()` and `sanitizeOptionalText()`
2. `profile-data.ts` — 4 `mergedLinks` mappings (~681, ~816, ~929, ~1042) must include field
3. `public-profile-page.tsx` ~line 1019 — `normalizedLinks` must include field
4. Add `console.log('field:', (link as any).field)` in card component to verify
5. Hard refresh: `Cmd+Shift+R` — most common culprits: #2 and #3

Note: Full Drizzle ORM, Write Production Ready Code + Minimal code approach + highly scalable code to tackle smoothly millions of traffic per day

Why NOT raw @libsql/client for everything
DrizzleRaw @libsql/clientType safety✅ full TypeScript types❌ noneAutocomplete✅❌SQL injection risk✅ parameterized automatically⚠️ manual discipline requiredMigration tracking✅ versioned files❌ manualRefactoring✅ schema change = type error caught❌ silent runtime failuresConsistency✅ one pattern everywhere❌ two patterns to maintain

npm run lint
npm run build
after every task done

hey last note - we've lots of apps i want each must be isolated - so built in a way cost very low on claudeflare workers like i don't want server call .ts which not need stay in use reduce compute cost, if something wrong tell me
