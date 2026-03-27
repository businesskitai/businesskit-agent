# BusinessKit Agent

Autonomous business agent team powered by the user's own Turso database.

## Setup

```bash
cp .env.example .env   # add TURSO_URL + TURSO_TOKEN
npm install
npx tsx setup.ts       # verify connection
```

## Run agents

```bash
npx tsx cli.ts ceo
npx tsx cli.ts blog-writer
npx tsx cli.ts analytics
```

## What an agent is

A TypeScript class. It runs a SQL query against Turso. Returns data. That's it.

## Agent roster + files

See `CLAUDE.md` for full schema and `PLAN.md` for complete agent list.

## Skills
Load `.agents/skills/` for full context:
- `schema.md`, `brand.md`, `store.md`, `analytics.md`, `agents.md`

## Key rules

- All writes require `profile_id`
- Never hard delete — set `hidden=1`
- Credentials table is read-only — never log values
