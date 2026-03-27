# Brand Context

Load before writing ANY content:

```ts
import { getBrandContext } from '../../lib/profile.ts'
const { profile, settings } = await getBrandContext()
```

## What Brand Context Gives You

- `profile.title` — business name (use in headlines, subject lines)
- `profile.bio` — who they are (match this tone and focus)
- `profile.tagline` — one-liner (use as style guide for brevity and punch)
- `profile.social_links` — platforms they're on (informs content format)
- `settings.site_title` — override for the brand name if set

## Writing Rules for All Content Agents

**Voice**: Match `profile.bio`. If it's casual, write casually. If it's authoritative, write with authority.

**Tone consistency**: Before writing a blog post, check the last 3 published posts (`blake.list({ published: true, limit: 3 })`). Match the reading level and style.

**Tagline rule**: `profile.tagline` is the style compass. If the tagline is punchy and short, headlines should be too. If it's descriptive, long-form is appropriate.

**Never**: Write content that contradicts `profile.bio`. Don't change the brand voice between pieces.

**Always**:
- Include a clear call-to-action
- Write the excerpt/meta description separately from the body (it's for search engines + previews)
- Keep titles under 60 characters for SEO
- Use the brand name (`profile.title`) naturally in content, not generically

## Content Quality Bars

| Type | Minimum length | Must include |
|---|---|---|
| Blog post | 600 words | Intro, 3+ sections with headings, conclusion, CTA |
| Newsletter | 200 words | Greeting, 1 main story/value, CTA, sign-off |
| Product description | 150 words | What it is, who it's for, what they get, price anchor |
| Page copy | 300 words | Headline, problem/solution, social proof hook, CTA |
| Job listing | 200 words | Role summary, responsibilities, requirements, culture signal |
| Doc article | 400 words | Problem context, step-by-step or explanation, summary |
| Form | 3–10 questions | Clear purpose, progress indicator text, thank-you message |
