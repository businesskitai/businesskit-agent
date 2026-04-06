# Brand Context + Voice

## Load brand context before writing ANY content

```ts
import { getBrandContext } from '../../lib/profile.ts'
const { profile, settings } = await getBrandContext()
```

### What you get

| Field | Use for |
|---|---|
| `profile.title` | Business name — use in headlines, subject lines, CTAs |
| `profile.bio` | Who they are — match this tone exactly |
| `profile.tagline` | Style compass — if punchy, headlines should be too |
| `profile.social_links` | Platforms they're on — informs content format |
| `settings.site_title` | Override brand name if set |

### Tone consistency check
Before writing a blog post, check the last 3 published posts and match the reading level and style:
```ts
const recent = await blogWriter.listPublished('posts', 3)
// Read titles + excerpts — match that voice
```

---

## Voice rules

**Match `profile.bio`.** If it's casual, write casually. If it's authoritative, write with authority.

**`profile.tagline` is the compass.** Short punchy tagline → short punchy headlines. Descriptive tagline → long-form is fine.

**Never** write content that contradicts `profile.bio`. Don't switch voice between pieces.

**Always**:
- Include a clear CTA
- Write excerpt/meta description separately from the body — it's for search engines + previews
- Keep titles under 60 characters for SEO
- Use `profile.title` (brand name) naturally in content — not generically

---

## Content quality bars

| Type | Min length | Must include |
|---|---|---|
| Blog post | 1500 words | Hook intro, 3+ H2 sections, conclusion, CTA |
| Ultimate guide | 3000 words | ToC, H2+H3 hierarchy, examples, FAQs, CTA |
| Listicle | 2000 words | 7–15 items, each with H3 + 2-3 sentences + tip |
| How-to | 2000 words | Numbered steps, clear action per step, outcome |
| Newsletter | 200 words | Greeting, 1 main value/story, CTA, sign-off |
| Product description | 150 words | What it is, who it's for, what they get, price anchor |
| Page copy | 300 words | Headline, problem/solution, social proof hook, CTA |
| Job listing | 200 words | Role summary, responsibilities, requirements, culture |
| Doc article | 400 words | Problem context, step-by-step or explanation, summary |
| Form | 3–10 questions | Clear purpose, progress indicator text, thank-you message |
| Excerpt | 1 sentence | Hook — makes reader click. Not a summary. |

---

## What good writing looks like
- First sentence: lead with the outcome or the surprise — never wind up to it
- Short sentences. Vary the rhythm.
- One idea per paragraph
- Active voice always
- Real numbers over vague claims ("$4,200 in 30 days" not "significant revenue")
- Specific examples over general advice
- Scannable: bullet points, bold key phrases, clear H2s

## What bad writing looks like — delete on sight
- "Delve into" / "dive deep" — never
- "In today's fast-paced world" — delete the whole sentence
- "It's important to note that" — delete it
- Three-sentence intros that say nothing — cut to the first real sentence
- Passive voice — rewrite it
- "Leverage" / "synergy" / "utilize" / "robust" — forbidden
- Starting with "Great question!" or "Certainly!" — never
- Generic opener: "In this article, we will..." — start with the point

## Channel-specific tone
- Blog → authoritative but approachable
- Newsletter → warmest voice, most personal
- Social → punchy, direct, no filler
- Product copy → outcome-first, specific, no hype
- Job listings → honest about culture, specific about role