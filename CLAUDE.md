# BusinessKit Agent

Run an entire business from your database. 17 agents — CEO, CRM, Social, SEO, Blog Writer and more.

Credentials in `.env`: `TURSO_URL` + `TURSO_TOKEN` (BusinessKit → Settings → Credentials)

---

## Start here — every session

1. Read `HEARTBEAT.md` — live business state, one read, no DB calls needed
2. Check `memory.md` — user preferences from past sessions
3. Load skills only when the task needs them (see table below)

---

## What to do when asked

| User says | Run |
|---|---|
| "brief me" / "what's happening" | CEO agent — revenue pulse, approvals, priorities |
| "write a post" / "blog" / "guide" | Blog Writer — load brand-voice.md first |
| "newsletter" / "email my subscribers" | Newsletter Writer |
| "post to Twitter/LinkedIn/Instagram" | Social Agent |
| "leads" / "contacts" / "outreach" | CRM Agent |
| "SEO" / "meta" / "LLM visibility" | SEO Agent |
| "analytics" / "revenue" / "traffic" | Analytics Agent |
| "add a product" / "launch" / "store" | Store Manager |
| "process my notes" / "update KB" | run `/ingest` |
| don't know → check | `.agents/skills/agents.md` |

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
