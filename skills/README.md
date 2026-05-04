# Skills — Load On Demand

Skills live in `.agents/skills/` (universal) and `.claude/skills/` (Claude Code).

**Do NOT load all skills at session start.** Load only what the current task needs.
Each skill costs tokens. Unused skills waste money and bust the prompt cache.

## Load pattern

```
Writing content (blog, newsletter, copy)  → load brand.md
SEO work (audit, meta, LLM visibility)   → load brand.md + schema.md (posts section)
Store/products/pricing                   → load store.md
Reading analytics JSON                   → load analytics.md
Routing to correct agent                 → load agents.md
DB queries / table structure             → load schema.md
```

## Available skills

| File | Load when |
|---|---|
| `brand.md` | Any content writing task |
| `store.md` | Product creation, pricing, commerce |
| `analytics.md` | Reading analytics columns |
| `agents.md` | Routing requests, dependency direction |
| `schema.md` | DB queries, table structure questions |

## Never load

- All skills at once
- A skill "just in case"
- Skills for tasks the user didn't ask for
