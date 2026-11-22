# CONTEXT.md

## Qwik Patterns

| Pattern | Notes |
|---|---|
| `routeLoader$` | Server-only, runs before render. Returns JSON-serializable data. Re-runs on nav. Access via `useXxxLoader()` in component. |
| `routeAction$` | Handles form POST server-side. Returns `{ success, error, data }`. Triggered via `<Form action={action}>` or `action.submit()`. Qwik auto-revalidates loaders after success. |
| `component$` | Lazy-loaded Qwik component. Never a plain function component. Don't destructure props inline in signature — use `const { foo } = props` inside body. |
| `useSignal<T>` | Reactive primitive (like Vue `ref`). |
| `useStore<T>` | Reactive object (like Vue `reactive`). |
| `$()` | Marks function as lazy/serializable. Cannot close over non-serializable values. |
| `useVisibleTask$` | Browser-only side effects, runs after hydration. |
| `useTask$` | Isomorphic reactive effects. |
| `useStyles$` | `import styles from './file.css?inline'` → `useStyles$(styles)`. Without `?inline` it breaks. |

**Gotchas:**
- `routeLoader$` accesses `sharedMap` via `event.sharedMap` inside the callback — not directly.
- `layout.tsx` explicitly lists reserved route prefixes; new protected routes must be added to `reservedSegments`.
- WorkOS creds come from `sharedMap["workos"]` — **never** `event.env.WORKOS_*`.

---

## Dual-Turso Model

```
sharedMap["profile"]          → { id, slug, email }               (set by plugin.ts — subdomain only)
sharedMap["workos"]           → { clientId, apiKey, redirectUri }  ← decrypted per-user WorkOS creds
sharedMap["userDB"]           → drizzle(their Turso)               ← per-request Drizzle client
sharedMap["userClient"]       → raw libSQL Client                  ← for legacy/raw query paths
sharedMap["hasUserDB"]        → boolean — true when userDB is resolved
sharedMap["userDBProfileId"]  → profileId string (dashboard path only)
sharedMap["userDBSlug"]       → slug string (dashboard path only)
sharedMap["turso"]            → central libSQL client singleton
sharedMap["isSubdomainRequest"]      → true on *.businesskit.io requests
sharedMap["isCustomDomainRequest"]   → true on custom domain requests
sharedMap["customDomainProfile"]     → full profile row
sharedMap["customDomainProfileId"]   → profile.id string
sharedMap["customDomainSlug"]        → profile.slug string
sharedMap["customDomainHost"]        → actual hostname
```

**Worker Map Cache** (`lib/creds-cache.ts`):
- Module-level `Map<string, CachedCreds>`. Key: `profiles.slug`. TTL: 5 min.
- Cold path (miss): Central DB JOIN → decrypt → `setCachedCreds(slug, ...)` → inject sharedMap.
- Hot path (99% of requests): Map HIT → inject sharedMap immediately.
- **`invalidateCreds(slug)` must be called after every `userdb` or `userauth` update.**

**`resolveDBEnv(sharedMap, env)`** (`lib/user-db-env.ts`) — wraps `sharedMap["userClient"]` into a fake env so `DatabaseService` static methods transparently query userDB. Use this when calling `DatabaseService.*` in a loader. Use `sharedMap.get("userDB")` (Drizzle) for direct Drizzle queries.

---

## Cloudflare Bindings

| Binding | Type | Purpose |
|---|---|---|
| `ANALYTICS_QUEUE` | Queue | Analytics event processing ← verify in `wrangler.jsonc` before deploy |
| `ASSET` | Static Assets | Serves built JS/CSS from `./dist` |

All other CF service bindings removed (D1, Hyperdrive/CockroachDB, TIGERDATA/TimescaleDB, Cosmos).
External data connections: **Central Turso** (HTTP) + **User Turso** (HTTP) only.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `TURSO_DATABASE_URL` | Central Turso endpoint |
| `TURSO_AUTH_TOKEN` | Central Turso JWT |
| `ENCRYPTION_SECRET` | AES-256-GCM key — `wrangler secret put`, never in wrangler.jsonc |
| `WORKOS_CLIENT_ID` / `WORKOS_API_KEY` / `WORKOS_REDIRECT_URI` | Platform-level WorkOS (admin auth only) |
| `VITE_WORKOS_CLIENT_ID` / `VITE_WORKOS_REDIRECT_URI` | Client-exposed WorkOS (browser) |
| `VITE_PADDLE_CLIENT_TOKEN` / `PADDLE_ENVIRONMENT` | Paddle billing |
| `CF_ZONE_ID` / `CF_API_TOKEN` / `CF_WORKER_HOST` | Custom domain DNS |
| `GOOGLE_MAPS_API_KEY` | Location picker |
| `DEV_USER_TURSO_URL` | Local dev only — user Turso URL (skips decryption when `ENCRYPTION_SECRET` not set) |
| `DEV_USER_TURSO_TOKEN` | Local dev only — user Turso token (plain-text fallback) |

**`VITE_` prefix required** for any var accessed in browser-side code.

---

## Key Gotchas

- **Central Turso client is module-singleton cached** (`db.ts`) — same instance across requests in same isolate. Fine for Workers.
- **User Drizzle is per-request** — NEVER cache at module level. Always via `createUserDrizzle(url, token)`.
- **`sharedMap` is the cross-middleware state bus** — if you need data from `plugin.ts` in a loader, it must be in `sharedMap`. Don't re-fetch.
- **User DB provisioning is idempotent** — `provisionUserDatabase()` uses `CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`. Safe to run multiple times.
- **Dev queries hit live production data** — Turso has no local SQLite fallback.
- **Two DB access patterns coexist** — `DatabaseService.*` static methods use raw libSQL (`getDatabaseClient(env)` / `resolveDBEnv(sharedMap, env)`). Drizzle (`sharedMap.get("userDB")`) is used in newer route loaders and domain services. Both are valid — don't mix them within the same function.
- **`resolveDBEnv(sharedMap, env)`** — use when calling `DatabaseService.*` in a loader; it wraps `userClient` into a fake env.
- **`sharedMap["hasUserDB"]`** — check before using `sharedMap["userDB"]` or `resolveDBEnv()`; it may be null if credentials aren't provisioned yet.
- **`plugin.ts` cold path** uses raw `libSQL client.execute()` for the central DB JOIN — intentional, not a bug.

---

## Commands

```bash
npm run dev                 # Vite SSR dev server → http://127.0.0.1:3001
npm run build               # Production bundle (client + CF Worker)
npm run deploy              # build + wrangler deploy  ← owner approval required
npm run lint                # ESLint
npm run drizzle:generate    # Generate migration SQL from central schema changes
npm run drizzle:migrate     # Apply migrations to Central Turso
npm run cf-typegen          # Regenerate worker-configuration.d.ts
npm run preview             # build + wrangler dev (local preview)
```

**UserDB**: No migration files — provisioned at runtime via `provisionUserDatabase()` in `lib/provision.ts`.