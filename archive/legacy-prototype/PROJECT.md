# BusinessKit Agent — Project Reference

## What this is

The agent runtime for [BusinessKit](https://businesskit.io). Users clone this repo (or install the Claude Code plugin), point it at their own Turso UserDB via `TURSO_URL` + `TURSO_TOKEN`, and get 17 domain agents (CEO, sales, content, seo, social, analytics, …) that read and write directly to their database.

Same TypeScript runs in Claude Code, Claude Cowork, Gemini CLI, Codex, or bare `npx tsx cli.ts <agent>`. This repo does not run a server and does not talk to the BusinessKit app — the UserDB schema is the entire API.

## Stack

- **TypeScript (strict, ESM)** — no build step, `tsx` runs `.ts` files directly
- **@libsql/client** — only runtime dep; Turso HTTP client
- **Raw SQL** — no ORM, no Drizzle in this repo (schema lives app-side)
- **Cloudflare Workers compatible** — Phase 2 injects the same client via `lib/db.adapter.ts`, one-line swap

## Architecture

```
User → /ceo (or /crm, /blog-writer, …)
  ↓  .claude/commands/<cmd>.md tells Claude what to do
  ↓  agents/<folder>/<folder>.ts methods (extend BaseAgent)
  ↓  lib/db.ts Turso client (withRetry, reader/writer split)
  ↓  UserDB — triggers maintain analytics scalars; JSON aggregated app-side
```

## The deal

> Bring your own credentials, use our platform.

UserDB is the contract. Every table, every trigger. Agents never touch our central DB. Analytics are trigger-maintained + lazy-aggregated on dashboard page visits — the agents read, never rebuild.

## Key rules (full list in `CONVENTIONS.md`)

- Every read and write filters by `profile_id`. Enforced in `BaseAgent`.
- Never hard DELETE. Use `hidden=1`, `archived=1`, or `status='archived'`.
- Never write to `*_analytics` tables.
- Status strings come from `lib/enums.ts` — never literal (typos silently no-op triggers).
- Approval gate on every outbound send (DM, email, proposal) unless `contact.auto_approve=1`.
- Phase 1 (local `.env`) → Phase 2 (sharedMap in Qwik) swap is one line in `lib/db.adapter.ts`.

## Deeper context

| File | What's in it |
|---|---|
| `ARCHITECTURE.md` | Request flow, BaseAgent contract, 10 invariants |
| `CODEBASE.md` | Per-file inventory of agents/, lib/, skills/ |
| `DOMAINS.md` | Which agent writes to which UserDB tables |
| `CONVENTIONS.md` | Code-pattern cheat sheet |
| `CLAUDE.md` | What Claude reads at session start |
| `PLAN.md` | Roadmap, folder map, Phase 1/2/3 |
