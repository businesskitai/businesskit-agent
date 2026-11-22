# TECH_STACK.md

## Framework & Runtime

| Library | Version | Notes |
|---|---|---|
| `@builder.io/qwik` | ^1.16.1 | Resumability — zero hydration cost on public pages |
| `@builder.io/qwik-city` | ^1.16.1 | File-system routing, SSR, loaders, actions |
| `vite` | 7.1.4 | **Pinned** — Qwik's vite plugin has compatibility constraints |
| `typescript` | 5.4.5 | **Pinned** — do not upgrade; Qwik optimizer can break on newer TS |
| `wrangler` | ^4.42.2 | CF Worker CLI: dev proxy, deploy, secrets |

**Compatibility flags** (`wrangler.jsonc`):
```json
"compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"]
"compatibility_date": "2025-09-27"
```
- `nodejs_compat` = polyfill only (`process.env`, `Buffer`, `EventEmitter`). **NOT real Node.js** — no `fs`, `net`, `http`.
- `global_fetch_strictly_public` = blocks `fetch()` to private IPs (security).

---

## Cloudflare Services

| Service | Binding | Usage |
|---|---|---|
| Workers | — | Runtime: all HTTP, SSR, API |
| Static Assets | `ASSET` | Serves `./dist` JS/CSS |
| Workers Routes | — | `businesskit.io/*` + `*.businesskit.io/*` → Worker |
| CF API | (API token) | DNS for custom domain verification |
| Analytics Queue | `ANALYTICS_QUEUE` | High-throughput analytics events |

**No other CF services** — D1, Hyperdrive, and KV removed. All data via Turso (HTTP).

---

## Database — Turso Only

| Library | Version | Role |
|---|---|---|
| `@libsql/client` | ^0.15.15 | Central Turso HTTP client (`lib/db.ts`, `lib/provision.ts`) |
| `drizzle-orm` | ^0.37.0 | Query builder + schema types (full Drizzle everywhere) |
| `drizzle-kit` | ^0.30.2 | Migration generation/apply (central DB only) |

| Instance | Owner | Schema | Client |
|---|---|---|---|
| Central Turso | Us | `src/db/schema.ts` + `src/db/central-schema.ts` | `centralDB` module singleton |
| User Turso | Each user (BYODB) | `src/db/user-schema.ts` + `provision.ts` | `userDB` per-request Drizzle |

⚠️ **Turso has no local DB** — dev hits live Central Turso. Mutations affect real data.
⚠️ **Drizzle migrations = central DB only.** UserDB uses `CREATE TABLE IF NOT EXISTS` at runtime.

**Removed (must not re-introduce):**

| Removed | Replaced by |
|---|---|
| `@azure/cosmos` / `@cfworker/cosmos` | UserDB `posts` table |
| `postgres` + `HYPERDRIVE` (CockroachDB) | UserDB `job_listings` / `job_applications` |
| `TIGERDATA` binding (TimescaleDB) | UserDB `forms` / `submissions` |
| Cloudflare D1 + `DB` binding | UserDB `doc_collections` / `doc_articles` |
| `lib/cockroachdb-service.ts` | Eliminated |
| `lib/cosmos-db-service.ts` | Eliminated |
| `lib/d1-docs-service.ts` | Eliminated |

---

## Authentication

| Library | Notes |
|---|---|
| WorkOS AuthKit (manual REST) | No official SDK — hand-rolled in `workos-authkit.ts` using `fetch()` |

**Per-user WorkOS ("Bring Your Own Auth"):**
- Creds stored encrypted in central DB `userauth` table (AES-256-GCM).
- Decrypted by `plugin.ts` → `sharedMap["workos"]`.
- Auth routes read from `sharedMap["workos"]` — **never `event.env.WORKOS_*`**.
- Platform vars (`WORKOS_CLIENT_ID`, `WORKOS_API_KEY`) = platform admin auth only.

---

## Encryption

`crypto.subtle` (Web API) — AES-256-GCM in `lib/vault.ts`. No Node.js crypto.
- `ENCRYPTION_SECRET` set via `wrangler secret put` — never committed.
- Encrypts: `tursoAuthToken` (`userdb` table) + `workosApiKey` (`userauth` table).

---

## Billing

| | Notes |
|---|---|
| Paddle (primary) | Paddle.js loaded via CDN in `root.tsx`. Server API in `lib/paddle.ts`. |
| Stripe (legacy) | `lib/stripe.ts` — exists for migration, not actively used. |

---

## UI

| Library | Version | Notes |
|---|---|---|
| `flowbite-qwik` | ^1.1.2 | Qwik-native UI components |
| `flowbite-qwik-icons` | ^0.1.10 | Flowbite icon set |
| `@qwikest/icons` | ^0.0.13 | Additional icons |
| Tailwind CSS v4 | via `@tailwindcss/postcss` ^4.1.14 | Uses v4 syntax in `tailwind.config.js` |
| `lib/design-system.ts` | — | Custom design tokens (CSS vars) — **always extend here** |

Two styling systems coexist intentionally: Tailwind utilities (Flowbite) + CSS custom properties (custom components).

---

## Rich Text Editor

| Library | Version |
|---|---|
| `@tiptap/core` + `@tiptap/starter-kit` | ^3.10.x |
| `@tiptap/extension-*` | ^3.10.x (color, highlight, image, link, subscript, superscript, task-list, text-align, typography, underline, youtube) |

Used in `TipTapEditor.tsx` for product descriptions, KB articles, community posts.

---

## Dev Tooling

| Tool | Config | Purpose |
|---|---|---|
| ESLint | `eslint.config.js` | Flat config (ESLint 9) + `eslint-plugin-qwik` |
| Prettier | `.prettierignore` | `npm run fmt` |
| `vite-tsconfig-paths` | `vite.config.ts` | `~/` path alias |
| `tsx` | — | Migration scripts via `npm run migrate` |
| `undici` | `*` | Fetch polyfill for Node dev compat |

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite SSR dev server (port 3001) |
| `npm run build` | Production bundle (client + CF Worker) |
| `npm run deploy` | build + wrangler deploy (**owner approval required**) |
| `npm run lint` | ESLint |
| `npm run drizzle:generate` | Generate migration SQL from central DB schema changes |
| `npm run drizzle:migrate` | Apply migrations to Central Turso |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` |
| `wrangler secret put ENCRYPTION_SECRET` | Set encryption key (never commit) |

---

## Version Constraints

- **Node**: `^18.17.0 || ^20.3.0 || >=21.0.0`
- **TypeScript 5.4.5 pinned** — upgrading may break Qwik optimizer
- **Vite 7.1.4 pinned** — Qwik vite plugin compatibility
- **`@cloudflare/workers-types` ^4.20250927.0** — run `npm run cf-typegen` after updating
- **Tailwind CSS v4** — uses `@tailwindcss/postcss`, not v3 plugin
- **Drizzle ORM 0.37.0** — `drizzle-kit` and `drizzle-orm` versions must stay in sync