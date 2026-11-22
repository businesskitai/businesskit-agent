# Agent Composition Pattern

> "Build your marketing assets template, then use that to build skills
> to further automate your workflow." — Claude Design tutorial
>
> "Once I have this design system skills, I can continue to build all
> the skills on top." — same

---

## The pattern

Single agents are useful. Composed agents are a system.

```
User: "Launch the April product campaign"
  ↓
CEO agent (orchestrator)
  ├─ delegates to CMO → campaign strategy + brief
  ├─ delegates to Blog Writer → campaign blog post
  ├─ delegates to Social Agent → 3 platform posts from brief
  ├─ delegates to Newsletter Writer → launch email to subscribers
  └─ delegates to Store Manager → product visibility + pricing check

Result: full campaign from one instruction
```

---

## How it works technically

Each agent in `agents/` has a `runCommand()` method.
The CEO (orchestrator) calls those methods directly:

```ts
// CEO orchestrating a campaign launch
async launchCampaign(productId: string) {
  // 1. Get product context
  const product = await this.db.getProduct(productId)

  // 2. Delegate to CMO for strategy
  const brief = await this.cmo.campaignBrief(product)

  // 3. Parallel: content + social + email
  const [post, socialPosts, email] = await Promise.all([
    this.blogWriter.writePost(brief),
    this.socialAgent.createCampaignPosts(brief),
    this.newsletterWriter.draftLaunchEmail(brief),
  ])

  // 4. Push everything to agent_reports
  await this.pushReport('campaign-launch', { brief, post, socialPosts, email })

  // 5. Surface pending approvals
  return { pending: [post.id, ...socialPosts.map(p => p.id), email.id] }
}
```

---

## Skill composition (from Claude Design tutorial)

Skills compose the same way:

```
brand.md (foundation)
  └─ campaign-planning skill (calls brand.md + analytics.md)
      └─ carousel skill (calls brand.md + campaign brief)
          └─ campaign manager agent (orchestrates all above)
```

The campaign manager in the tutorial took one brief and produced:

- Campaign planning deck (slides)
- Performance tracker (Excel with formulas)
- Social carousel posts (3 on-brand variations)
- Animated video (HTML motion graphics)
- Landing page (with embedded video)

In 25 minutes, unattended.

Your equivalent: `/ceo launch-campaign` → brief → blog post + social posts
- newsletter + product settings checked + pending approvals surfaced.

---

## Three orchestration modes

### 1. Sequential (default)

Agent A finishes → result passes to Agent B.
Use for: workflows where each step depends on the last.

```
CMO brief → Blog Writer uses brief → Social Agent repurposes post
```

### 2. Parallel (faster, for independent tasks)

Agents run simultaneously. Use for: independent deliverables from same input.

```
Campaign brief → [Blog Writer + Social Agent + Newsletter Writer] in parallel
```

### 3. Human-gated (approval required)

Agent completes step → surfaces to user → user approves → next step.
Use for: anything that goes public (posts, emails, price changes).

```
Social Agent drafts → approval_status='pending' → user approves → publishes
```

---

## What the Shopify video showed

The Shopify AI toolkit installs as a Claude Code plugin with slash commands.
Same pattern as your `.claude/commands/`:

```
/shopify → SEO audit, conversion analysis, AOV report, bulk updates
/ceo     → business briefing, campaign launch, pending approvals
/crm     → contact management, deal pipeline, outreach
```

The difference: Shopify connects to one external store.
Your repo connects to the user's entire business database.

Shopify's approach also validated: one tool (Claude Code) as the connective
tissue between all their tools (Klaviyo, Canva, Clarity). That's your model —
one `bk` command connecting all their business data.

---

## Skills vs agents — the distinction

| | Skills | Agents |
|---|---|---|
| What | Instructions + rules | Executable code |
| Where | `.agents/skills/*.md` + `agent_skills` table | `agents/**/*.ts` |
| Load time | On demand | On demand |
| Can call other | Skills only | Agents + skills |
| Has memory | No | Via `agent_memory` |
| Persists output | No | Via `agent_reports` |

Skills teach agents *how* to approach something.
Agents *do* the thing and remember it.
