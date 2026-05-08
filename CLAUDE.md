# BusinessKit Agent

Run an entire business from your database. 18 agents — CEO, Sales, Marketing, Social, SEO, Content and more.

Credentials in `.env`: `TURSO_URL` + `TURSO_TOKEN` (BusinessKit → Settings → Credentials)

---

## Start here — every session

1. Read `HEARTBEAT.md` — live business state, one read, no DB calls needed
2. Check `memory.md` — user preferences from past sessions
3. Load skills only when the task needs them (see table below)

---

## What to do when asked

| User says | Agent |
|---|---|
| "brief me" / "what's happening" / "priorities" | **ceo** — load HEARTBEAT.md first |
| "marketing" / "content calendar" / "growth strategy" | **marketing** |
| "revenue" / "pricing" / "business performance" | **business** |
| "operations" / "publish queue" / "task management" | **operations** |
| "leads" / "contacts" / "outreach" / "deals" | **sales** — approval gate on all sends |
| "write a post" / "blog" / "guide" / "listicle" | **content** — load brand-voice.md first |
| "newsletter" / "email subscribers" | **newsletter** — approval before send |
| "copy" / "landing page copy" / "bio" | **copywriting** |
| "post to Twitter/LinkedIn" / "social" | **social** |
| "SEO" / "meta" / "LLM visibility" | **seo** |
| "analytics" / "traffic" / "how many clicks" | **analytics** — read-only |
| "product" / "launch" / "store item" | **store** |
| "course" / "lessons" / "module" | **courses** |
| "job listing" / "hiring" / "applications" | **hiring** |
| "form" / "intake" / "waitlist" | **forms** |
| "docs" / "knowledge base" / "help article" | **docs** |
| "schedule" / "cron" / "queue" | **scheduler** |
| "page" / "design" / "page builder" | **design** |
| "process my notes" / "update KB" | `/ingest` command |
| don't know → check | `skills/ceo/SKILL.md` |

---

## Skills — load on demand only

| Task | Load |
|---|---|
| Writing anything | `context/brand-voice.md` + `skills/brand/SKILL.md` |
| Products / pricing | `skills/store/SKILL.md` |
| Analytics columns | `skills/analytics/SKILL.md` |
| DB table structure | `skills/schema/SKILL.md` |
| Agent routing | `skills/agents/SKILL.md` |

Never load all skills. Never load "just in case."

---

## The one rule

Every DB read and write filters by `profile_id`. No exceptions.
Never hard delete — always `hidden=1`.
Never write to analytics tables.
Never send or publish without user approval.

---

## After every action

```ts
import { logMemory } from './lib/memory.ts'
await logMemory('agent-name', 'what was done', { id, slug })
```

User states a preference → add to `memory.md` → apply immediately.

---

Full schema, agent roster, routing rules: `REFERENCE.md`
