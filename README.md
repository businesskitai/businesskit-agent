# BusinessKit Agent

Your autonomous business team — 16 agents that read and write directly to your Turso database.

CEO briefs you every week. Blog Writer publishes posts. Store Manager launches products. Social Agent posts to X, LinkedIn, Facebook, and Instagram. All from a conversation.

---

## Setup

**Step 1 — Clone and install**

```bash
git clone https://github.com/businesskitai/businesskit-agent
cd businesskit-agent
npm install
```

**Step 2 — Add your Turso credentials**

```bash
cp .env.example .env
```

Open `.env` and paste your credentials. Find them at **BusinessKit → Settings → Credentials**:

```
TURSO_URL=libsql://your-db-name.turso.io
TURSO_TOKEN=your-auth-token
```

**Step 3 — Verify connection**

```bash
npm run setup
```

You should see your business name and profile confirmed. If not, check your `.env`.

---

## How to use it

### Option A — Claude Code (recommended)

Open this folder in Claude Code. Type any slash command to activate an agent.

### Option B — Claude Cowork

Install the BusinessKit plugin from [claude.com/plugins](https://claude.com/plugins). Same commands, runs in your browser.

### Option C — Terminal

```bash
npx tsx cli.ts ceo
npx tsx cli.ts blog-writer
npx tsx cli.ts analytics
```

---

## Agents + what to say

### Start here — CEO briefing

```
/ceo
```

Gives you: revenue last 30 days, traffic breakdown, content inventory, top products, and a prioritised action list. Start every week here.

---

### Content

```
/blog-writer
```

> "Write a post about the top 5 email marketing mistakes"
> "List my drafts"
> "Publish my draft post about pricing"

```
/newsletter-writer
```

> "Write this week's newsletter — highlight the new course launch"
> "How many subscribers do I have?"
> "Send the newsletter"

```
/course-creator
```

> "Create a course called Email Marketing Mastery at $97"
> "Add a lesson: Introduction to Email Lists"
> "Show me who enrolled in my course"

```
/store-manager
```

> "Add a 1:1 coaching call at $150 — link my Calendly"
> "Create a webinar called Build Your First Funnel for $29"
> "Add a sponsorship slot at $500/month"
> "List all my live products"

```
/copywriter
```

> "Write a landing page for my email course"
> "Improve the description on my coaching product"
> "Update my profile bio"

```
/docs-writer
```

> "Create a Getting Started article in the FAQ collection"
> "Write a doc: How to access your purchase"

```
/jobs-manager
```

> "Post a job: Senior Designer, remote, full-time"
> "Show me applications for the designer role"

```
/forms-builder
```

> "Build a waitlist form with name and email"
> "Create a client intake form with 5 questions"
> "Show me submissions for my contact form"

---

### Growth

```
/analytics
```

> "Show me my analytics"
> "Which product made the most revenue last month?"
> "Where is my traffic coming from?"

```
/seo
```

> "Audit my SEO"
> "Fix the missing excerpts on my posts"
> "Set SEO title and description for my blog category"

```
/social
```

> "Post my latest blog post to LinkedIn and X"
> "Announce the new course launch on all platforms"
> "Post to Instagram with a custom caption"

*Requires social tokens saved in BusinessKit → Settings → Credentials*

---

### Pipeline

```
/coo
```

> "Show me all my drafts"
> "What content is scheduled to publish today?"
> "Run the publish queue"

```
/cmo
```

> "Build me a 4-week content calendar"
> "What content gaps do I have?"

```
/cbo
```

> "Show me my revenue breakdown"
> "Which products should I price differently?"

```
/scheduler
```

> "Run the publish queue"
> "Schedule my draft post for Monday 9am"

---

### Deep Mode — full autonomous run

```
/deep
```

CEO takes over. Reads your progress history, checks analytics, writes a plan, and delegates to the whole team. Use this when you want to hand off your weekly content work entirely.

---

## Adding social credentials

Go to **BusinessKit → Settings → Credentials** and add:

| Platform | What you need |
|---|---|
| X / Twitter | API Key, API Secret, Access Token, Access Secret |
| LinkedIn | Access Token, Person URN (`urn:li:person:xxxxx`) |
| Facebook | Page ID, Page Token |
| Instagram | Account ID, Access Token |

The Social Agent reads these from your Turso database and posts directly — no third-party tools needed.

---

## How agents work

Each agent is a TypeScript class. It runs a SQL query against your Turso database and returns structured data. You are the LLM. The agent just does the database work.

```
You say:    /blog-writer → "Write a post about email marketing"
Agent does: SELECT profile from Turso → INSERT post row → returns slug + URL
```

Nothing is stored locally. Everything goes into your own Turso database that you own and control.

---

## Requirements

- Node.js 18+
- A BusinessKit account with Turso connected
- Social platform tokens (optional — for `/social`)

---

## Works with

| Tool | How |
|---|---|
| Claude Code | Slash commands in `.claude/commands/` |
| Claude Cowork | Plugin at claude.com/plugins |
| Gemini CLI | Reads `GEMINI.md` automatically |
| Codex | Reads `AGENTS.md` automatically |
| Cursor | Reads `.cursorrules` automatically |
| Any terminal | `npx tsx cli.ts <agent>` |
