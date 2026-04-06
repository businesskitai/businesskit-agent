# BusinessKit Agent

Your autonomous business team — CEO, CMO, COO, CBO, Blog Writer, Course Creator, Store Manager, Newsletter Writer, CRM Agent, Social Agent, SEO Agent, Analytics Agent, and more.

Reads and writes directly to your Turso database. Works with Claude Code, Claude Cowork, Gemini CLI, Codex, and any terminal.

---

## Setup

**Step 1 — Clone and install**
```bash
git clone https://github.com/businesskit-io/businesskit-agent
cd businesskit-agent
npm install
```

**Step 2 — Add credentials**
```bash
cp .env.example .env
```

Open `.env`. Paste your Turso credentials from **BusinessKit → Settings → Credentials**:
```
TURSO_URL=libsql://your-db.turso.io
TURSO_TOKEN=your-auth-token
```

**Step 3 — Verify**
```bash
npm run setup
```

You'll see your business name confirmed. If not, check your `.env`.

---

## How to use

### Claude Code
Open this folder. Type any slash command:

```
/ceo        /cmo        /coo        /cbo
/blog-writer  /newsletter-writer  /copywriter
/course-creator  /store-manager  /jobs-manager
/forms-builder   /docs-writer
/crm        /social     /analytics  /seo
/scheduler  /deep
```

### Claude Cowork
Install the BusinessKit plugin. Same commands, runs in your browser.

### Terminal
```bash
npx tsx cli.ts ceo
npx tsx cli.ts blog-writer
npx tsx cli.ts crm
npx tsx cli.ts social
```

---

## Agents

### C-Suite
| Command | Does |
|---|---|
| `/ceo` | Weekly briefing — revenue, traffic, priorities, cross-agent orchestration |
| `/cmo` | 4-week content calendar, content gap analysis, growth recommendations |
| `/coo` | Publish queue, draft pipeline, scheduling oversight |
| `/cbo` | Revenue report, pricing audit, upsell strategy |

### Content
| Command | Does | Writes to |
|---|---|---|
| `/blog-writer` | 8 content formats: listicle, how-to, checklist, QA, versus, roundup, news, ultimate guide | `posts`, `compare`, `alternative`, `prompt`, `notes`, `guides` |
| `/newsletter-writer` | Write and send newsletters | `newsletter` + SES/Resend |
| `/copywriter` | Landing pages, product descriptions, profile bio | `pages`, `products` |
| `/course-creator` | Courses with lessons | `products` (type=course) |
| `/store-manager` | Downloads, meetings, webinars, events, listings, sponsorships, services | `products` |
| `/jobs-manager` | Job listings and applications | `job_listings` |
| `/forms-builder` | Forms with questions and analytics | `forms`, `questions` |
| `/docs-writer` | Knowledge base articles | `doc_collections`, `doc_articles` |

### CRM (agent-first)
```
/crm
```
> "Add a lead: Sarah Chen, LinkedIn @sarahchen, founder at TechCo"
> "Show my top 10 leads by score"
> "Draft a DM for my hottest lead"
> "Show who replied to my outreach"
> "Create a $5,000 deal for John"
> "What tasks are due today?"
> "Show pending approvals"

Agent drives the full pipeline: research → enrich → score → draft DM → approve → send → follow-up.
Every DM/email draft waits for your approval before sending (unless you set `auto_approve=1`).

### Social (agent-first, powered by Zernio)
```
/social
```
> "Post my latest blog post to LinkedIn and X"
> "Announce my new course on all platforms"
> "Schedule a post for Monday 9am"
> "Show my unread DMs and comments"
> "How are my accounts performing?"

Posts to 13 platforms via [Zernio API](https://zernio.com). Reads your connected accounts from Turso. Writes `social_posts` + `social_post_platforms` on every action.

**Requires:** Zernio API key saved in BusinessKit → Settings → Credentials (BYOK).
Free-tier users: use the dashboard → posting is capped at 20/month via the platform key.

### Growth
| Command | Does |
|---|---|
| `/analytics` | Full snapshot: revenue, traffic, top products, link clicks |
| `/seo` | Audit all content for SEO issues, fix titles/descriptions, content gap analysis, LLM visibility tracking |
| `/scheduler` | Run publish queue, manage scheduled content |

### Deep Mode
```
/deep
```
CEO reads memory, checks analytics, writes a plan, delegates to the full team. Hand off your weekly business work entirely.

---

## Memory — synced across machines

Agent memory is stored in your Turso database (`memory_log` table, max 20 rows). Not a local file — synced everywhere.

```ts
import { sessionContext } from './lib/memory.ts'
const { memory, skills } = await sessionContext()
// memory: last 20 agent actions
// skills: your brand voice, SEO rules, store guidelines
```

---

## Skills — live in Turso, editable from dashboard

Agent skills (brand voice, SEO rules, store pricing) live in `agent_skills` table. Edit them in **BusinessKit → Dashboard → Agent Skills** and agents pick them up immediately — no file changes needed.

Default skills seeded on first run:
- `brand-voice` — your tone, style, what to avoid
- `seo` — target keywords, internal linking rules
- `store` — pricing guidelines, product naming
- `analytics` — how to interpret your data

---

## Content formats (Blog Writer)

Inspired by SEObot's approach — each format has a specific structure and word count target:

| Format | Min words | Best for |
|---|---|---|
| `listicle` | 2000 | "Top 10 X" — high traffic |
| `how-to` | 2000 | "How to X" — high search intent |
| `ultimate-guide` | 3000 | Definitive resource — best for LLM citations |
| `checklist` | 1200 | Practical checklists |
| `qa` | 1500 | FAQ articles — long-tail keywords |
| `versus` | 2000 | "X vs Y" — high buying intent → `compare` table |
| `roundup` | 2000 | "Best X" — affiliate/referral traffic |
| `news` | 800 | Timely coverage with cited sources |
| `programmatic` | 1000 | Template-based SEO at scale |

---

## LLM Visibility (SEO Agent)

The SEO agent tracks whether ChatGPT, Claude, Gemini, and Perplexity mention your brand. Strategy: publish comprehensive, well-cited content that LLMs reference.

```
/seo → "Check my LLM visibility"
/seo → "What content gaps do I have?"
/seo → "Audit my SEO"
```

---

## Social credentials

Go to **BusinessKit → Settings → Credentials** and add your Zernio API key:

| Credential | What |
|---|---|
| Zernio API key | Enables posting to all 13 platforms |

Alternatively connect platforms in **BusinessKit → Settings → Social** using the Zernio OAuth flow.

---

## Requirements

- Node.js 18+
- BusinessKit account with Turso connected
- Zernio API key (optional, for social posting)

---

## Works with

| Tool | How |
|---|---|
| Claude Code | `/` slash commands in `.claude/commands/` |
| Claude Cowork | Plugin at claude.com/plugins |
| Gemini CLI | Reads `GEMINI.md` automatically |
| Codex | Reads `AGENTS.md` automatically |
| Cursor | Reads `.cursorrules` automatically |
| Any terminal | `npx tsx cli.ts <agent>` |

---

## Architecture

```
Your Turso DB (you own it)
    ↑
lib/db.ts, lib/memory.ts, lib/profile.ts
    ↑
agents/_base.ts (profile isolation enforced on every query)
    ↑
agents/csuite/   agents/creators/   agents/growth/
    ↑
.claude/commands/   (slash commands — Claude Code + Cowork)
.agents/skills/     (universal skills — all tools)
```

Phase 1 (now): local repo — Claude Code + Cowork + terminal
Phase 2 (next): in-app MCP server on Cloudflare Worker
Phase 3 (later): autonomous cron via Cloudflare Durable Objects