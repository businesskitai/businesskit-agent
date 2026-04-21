# BusinessKit Agent

Your agents are useless without a knowledge layer.
This is the knowledge layer — plus the agents that read from it.

17 agents (CEO, CRM, Social, SEO, Blog Writer, and more) that read and write directly
to your Turso database. Two layers:

**Brand Foundation (BF)** — static, you write once: `context/brand-voice.md`,
`context/about-me.md`, `SOUL.md`. Agents read before producing anything.

**Knowledge Base Layer (KBL)** — dynamic, agents maintain: `agent_kb` table grows
every session. Drop anything into `agent_notes` inbox — links, ideas, tweets, articles.
Run `/ingest` and the agent compiles structured wiki pages with cross-links.
Every question you ask gets filed back as a new entry. Knowledge compounds.

Works with Claude Code, Claude Cowork, Gemini CLI, Codex, and any terminal.

---

## Setup — 3 steps

**1. Clone and install**

```bash
git clone https://github.com/businesskitai/businesskit-agent
cd businesskit-agent
npm install
```

**2. Add credentials**

```bash
cp .env.example .env
# Paste TURSO_URL and TURSO_TOKEN from BusinessKit → Settings → Credentials
```

**3. Verify**

```bash
npm run setup
```

You'll see your business name confirmed. If not, check your `.env`.

---

## Fill in your context (20 minutes, once)

These files make every agent 10x better. Without them, agents guess.

```
context/about-me.md      → who you are, your background, credibility
context/brand-voice.md   → voice bible with real writing examples
context/working-style.md → how you work, approval preferences, schedule
context/business.md      → goals, revenue model, 90-day targets
```

**This is the most important step.** Shann Holmberg (Espressio) calls this the Brand Foundation —
the static layer agents read before producing anything so the output sounds like you, not generic AI.

---

## How to use

### Claude Code

Open this folder. Type any slash command:

```
/ceo          → weekly business briefing, priorities, pending approvals
/blog-writer  → write posts, listicles, how-tos, comparisons
/newsletter   → draft and send newsletters
/social       → post to Twitter, LinkedIn, Instagram, TikTok (13 platforms)
/crm          → manage contacts, deals, outreach pipeline
/seo          → audit, fix meta, track LLM visibility
/analytics    → revenue, traffic, product performance
/store        → launch products, courses, services
/ingest       → process agent_notes inbox into knowledge base
/kb           → query your knowledge base
/compress     → save session before context runs out
/resume       → reload context next session
```

### Claude Cowork

Install the BusinessKit plugin. Same commands, runs in your browser.

### Terminal

```bash
npx tsx cli.ts ceo
npx tsx cli.ts blog-writer
npx tsx cli.ts crm
```

---

## The knowledge layer

Drop anything into your inbox:

```
"add to notes: https://twitter.com/karpathy/status/... — useful for SEO strategy"
"add to notes: idea — launch a free email course as lead magnet"
"add to notes: competitor just raised prices, opportunity"
```

Run `/ingest` weekly. The agent reads each note, builds or updates wiki pages,
cross-references related entries, marks contradictions as stale.

Query anytime:

```
/kb  →  "what do I know about email deliverability?"
        "what content formats performed best?"
        "what's my current positioning vs competitors?"
```

Every answer gets filed back. The knowledge base gets richer every session.

---

## Agents

| Agent | What they do |
|---|---|
| **CEO** | Weekly briefing, revenue pulse, priorities, pending approvals |
| **CMO** | Marketing strategy, content calendar, growth planning |
| **COO** | Operations, publishing queue, task management |
| **CBO** | Revenue analysis, pricing strategy, product performance |
| **Blog Writer** | Posts, listicles, how-tos, comparisons, programmatic content |
| **Newsletter Writer** | Drafts, subscriber analytics, send management |
| **Copywriter** | Landing pages, product copy, profile bio |
| **Course Creator** | Course structure, lessons, pricing, access |
| **Store Manager** | Products, webinars, services, sponsorships, 1:1 calls |
| **Jobs Manager** | Job listings, applications |
| **Forms Builder** | Intake forms, waitlists, surveys |
| **Docs Writer** | Knowledge base articles, FAQs |
| **CRM Agent** | Contacts, deals, outreach pipeline with approval gates |
| **Social Agent** | 13 platforms via Zernio, scheduling, inbox |
| **Analytics Agent** | Revenue, traffic, product, email stats |
| **SEO Agent** | Technical audit, meta, LLM visibility tracking |
| **Scheduler** | Cron tasks, publish queue, Hermes pattern detection |

---

## Cost

Every agent is built to minimise token cost:

- Skills loaded on demand — only what the task needs
- KB index scanned first (slug + summary), content loaded only when needed
- Reports pushed to Turso mid-conversation — never lost if session ends
- `SYSTEM.md` enforces: do first, report after. No narrating what's about to happen.

One founder moved from $130/5 days on a heavyweight agent setup to $10 on a lean
knowledge-layer-first approach. That's the target.

---

## Works with

| Tool | How |
|---|---|
| Claude Code | Primary runtime — slash commands in `.claude/commands/` |
| Claude Cowork | Plugin at `.claude-plugin/plugin.json` — 18 commands |
| Gemini CLI | Reads `GEMINI.md` automatically |
| Codex | Reads `AGENTS.md` automatically |
| Cursor | Reads `.cursorrules` automatically |
| Any terminal | `npx tsx cli.ts <agent>` |

---

## Requirements

- Node.js 18+
- A BusinessKit account with Turso connected
- Social platform tokens (optional — for `/social`)

MIT License
