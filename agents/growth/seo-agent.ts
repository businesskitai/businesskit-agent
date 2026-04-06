/**
 * SEO Agent
 *
 * Google SEO + LLM Visibility (Arvow insight).
 * Tracks brand mentions in ChatGPT, Claude, Gemini, Perplexity.
 * Audits all content tables for SEO issues and fixes them.
 *
 * Tables read: posts, compare, alternative, prompt, guides, collections
 * Tables written: posts (seo_title, seo_description, seo_keywords)
 *                 profiles (llm_visibility)
 *                 collections (seo_title, seo_description)
 */

import { BaseAgent, db, iso } from '../_base.ts'
import { logMemory }          from '../../lib/memory.ts'

export interface SEOIssue {
  table: string
  id: string
  title: string
  slug: string
  problems: string[]
}

export interface LLMVisibility {
  chatgpt:    number  // mention count or 0
  claude:     number
  gemini:     number
  perplexity: number
  last_checked: string
}

export class SEOAgent extends BaseAgent {
  readonly name  = 'SEO Agent'
  readonly title = 'SEO Agent'

  // ── Full audit across all content tables ─────────────────────────────────

  async audit(): Promise<{ issues: SEOIssue[]; score: number; summary: string }> {
    await this.init()

    const tables = ['posts', 'compare', 'alternative', 'guides'] as const
    const allIssues: SEOIssue[] = []

    for (const table of tables) {
      try {
        const { rows } = await db.execute({
          sql: `SELECT id,title,slug,excerpt,seo_title,seo_description,word_count
                FROM ${table} WHERE profile_id=? AND published=1 AND hidden=0`,
          args: [this.profileId],
        })

        for (const r of rows) {
          const problems: string[] = []
          if (!r.excerpt)                                              problems.push('missing excerpt')
          if (!r.seo_title)                                            problems.push('missing seo_title')
          if (!r.seo_description)                                      problems.push('missing seo_description')
          if (r.seo_title && String(r.seo_title).length > 60)         problems.push('seo_title >60 chars')
          if (r.seo_description && String(r.seo_description).length > 160) problems.push('seo_description >160 chars')
          if (Number(r.word_count ?? 0) < 300)                        problems.push('thin content <300 words')
          if (!r.slug || String(r.slug).includes(' '))                 problems.push('slug has spaces')
          if (String(r.slug ?? '').length > 80)                        problems.push('slug too long >80 chars')

          if (problems.length) {
            allIssues.push({ table, id: r.id as string, title: r.title as string, slug: r.slug as string, problems })
          }
        }
      } catch { /* table may not exist on older DBs */ }
    }

    const score = allIssues.length === 0 ? 100 : Math.max(0, 100 - allIssues.length * 5)
    const summary = allIssues.length === 0
      ? 'All content passes SEO checks.'
      : `${allIssues.length} issues found across ${tables.join(', ')}.`

    await logMemory('seo', `SEO audit: score ${score}/100, ${allIssues.length} issues`, { issues: allIssues.length, score })

    return { issues: allIssues, score, summary }
  }

  // ── Fix a specific post's SEO fields ─────────────────────────────────────

  async fixPost(id: string, fixes: {
    seo_title?: string
    seo_description?: string
    seo_keywords?: string[]
    excerpt?: string
    slug?: string
  }, table = 'posts') {
    const sets: string[] = ['updated_at=?']
    const args: unknown[] = [iso()]

    if (fixes.seo_title)       { sets.push('seo_title=?');       args.push(fixes.seo_title.slice(0, 60)) }
    if (fixes.seo_description) { sets.push('seo_description=?'); args.push(fixes.seo_description.slice(0, 160)) }
    if (fixes.seo_keywords)    { sets.push('seo_keywords=?');    args.push(JSON.stringify(fixes.seo_keywords)) }
    if (fixes.excerpt)         { sets.push('excerpt=?');         args.push(fixes.excerpt) }
    if (fixes.slug)            { sets.push('slug=?');            args.push(this.toSlug(fixes.slug)) }

    args.push(id)
    await db.execute({
      sql: `UPDATE ${table} SET ${sets.join(',')} WHERE id=? AND profile_id=?`,
      args: [...args, this.profileId],
    })
  }

  // ── Collection SEO ────────────────────────────────────────────────────────

  async setCollectionSEO(categorySlug: string, opts: {
    seo_title: string
    seo_description: string
    seo_robots?: string
  }) {
    await this.init()
    await db.execute({
      sql: `UPDATE collections SET
            seo_title=?,seo_description=?,seo_robots=?,updated_at=?
            WHERE profile_id=? AND category_slug=?`,
      args: [
        opts.seo_title.slice(0, 60),
        opts.seo_description.slice(0, 160),
        opts.seo_robots ?? 'index,follow',
        iso(), this.profileId, categorySlug,
      ],
    })
  }

  // ── Slug suggestions ──────────────────────────────────────────────────────

  suggestSlug(title: string, keyword?: string): string {
    const base = (keyword ?? title)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    return base.slice(0, 80)
  }

  // ── LLM Visibility (Arvow-inspired) ──────────────────────────────────────
  //
  // Tracks whether ChatGPT, Claude, Gemini, Perplexity mention your brand.
  // This is the "AI SEO" layer on top of Google SEO.
  // Strategy: write content that gets cited by LLMs (detailed, factual, well-structured).

  async checkLLMVisibility(): Promise<LLMVisibility> {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT llm_visibility FROM profiles WHERE id=? LIMIT 1`,
      args: [this.profileId],
    })

    const current: LLMVisibility = safeJSON(r?.llm_visibility, {
      chatgpt: 0, claude: 0, gemini: 0, perplexity: 0, last_checked: '',
    })

    return current
  }

  async updateLLMVisibility(counts: Partial<Omit<LLMVisibility, 'last_checked'>>) {
    await this.init()
    const current = await this.checkLLMVisibility()
    const updated: LLMVisibility = {
      ...current,
      ...counts,
      last_checked: iso(),
    }
    await db.execute({
      sql: `UPDATE profiles SET llm_visibility=? WHERE id=?`,
      args: [JSON.stringify(updated), this.profileId],
    })
    await logMemory('seo', 'Updated LLM visibility', updated)
    return updated
  }

  llmVisibilityAdvice(visibility: LLMVisibility): string[] {
    const advice: string[] = []
    const allZero = !visibility.chatgpt && !visibility.claude && !visibility.gemini && !visibility.perplexity

    if (allZero) {
      advice.push('No LLM mentions detected yet. Publish more detailed, factual, well-structured content.')
      advice.push('Write ultimate guides and how-to articles — LLMs prefer citing comprehensive sources.')
      advice.push('Include data, statistics, and clear definitions — these get cited more often.')
      advice.push('Use your brand name consistently in titles, headings, and the first paragraph.')
    } else {
      if (!visibility.perplexity) advice.push('Not visible in Perplexity. Add more cited sources and data to your content.')
      if (!visibility.chatgpt)    advice.push('Not visible in ChatGPT. Publish FAQ-style content around your core topic.')
      if (visibility.chatgpt > 0) advice.push(`ChatGPT mentions: ${visibility.chatgpt} — keep publishing in this area.`)
    }

    return advice
  }

  // ── Content gap analysis ──────────────────────────────────────────────────

  async contentGaps(): Promise<{
    missing_types: string[]
    thin_posts: number
    no_compare: boolean
    no_alternative: boolean
    advice: string[]
  }> {
    await this.init()
    const [
      { rows: typeCounts },
      { rows: [compareCount] },
      { rows: [altCount] },
    ] = await Promise.all([
      db.execute({
        sql: `SELECT content_type, COUNT(*) as cnt FROM posts
              WHERE profile_id=? AND published=1 AND hidden=0
              GROUP BY content_type`,
        args: [this.profileId],
      }),
      db.execute({
        sql: `SELECT COUNT(*) cnt FROM compare WHERE profile_id=? AND published=1`,
        args: [this.profileId],
      }),
      db.execute({
        sql: `SELECT COUNT(*) cnt FROM alternative WHERE profile_id=? AND published=1`,
        args: [this.profileId],
      }),
    ])

    const publishedTypes = new Set(typeCounts.map(r => r.content_type as string))
    const highValueTypes = ['listicle', 'how-to', 'ultimate-guide', 'qa']
    const missingTypes   = highValueTypes.filter(t => !publishedTypes.has(t))

    const { rows: [thin] } = await db.execute({
      sql: `SELECT COUNT(*) cnt FROM posts WHERE profile_id=? AND published=1 AND word_count < 500`,
      args: [this.profileId],
    })

    const noCompare     = Number(compareCount?.cnt ?? 0) === 0
    const noAlternative = Number(altCount?.cnt ?? 0) === 0
    const thinPosts     = Number(thin?.cnt ?? 0)

    const advice: string[] = []
    if (missingTypes.includes('listicle'))      advice.push('Write a "Top 10 X" listicle — high traffic format.')
    if (missingTypes.includes('how-to'))        advice.push('Write a "How to X" guide — high search intent.')
    if (missingTypes.includes('ultimate-guide')) advice.push('Write an ultimate guide — best for LLM citations.')
    if (missingTypes.includes('qa'))            advice.push('Write an FAQ article — targets long-tail queries.')
    if (noCompare)                              advice.push('Create compare pages (X vs Y) — high buying intent.')
    if (noAlternative)                          advice.push('Create "alternatives to X" pages — high buying intent.')
    if (thinPosts > 0)                          advice.push(`${thinPosts} thin posts (<500 words) need expanding.`)

    return { missing_types: missingTypes, thin_posts: thinPosts, no_compare: noCompare, no_alternative: noAlternative, advice }
  }

  private toSlug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
  }

  // ── llms.txt awareness ───────────────────────────────────────────────────────
  // Your live app generates llms.txt at /llms.txt — agent checks it exists
  // and advises on content. Generation is server-side, not agent's job.

  async checkLLMSTxt(): Promise<{ exists: boolean; url: string; advice: string[] }> {
    await this.init()
    const url = `https://${this.ctx.profile.slug}.businesskit.io/llms.txt`
    let exists = false
    try {
      const res = await fetch(url, { method: 'HEAD' })
      exists = res.ok
    } catch { /* network error */ }

    const advice: string[] = []
    if (!exists) {
      advice.push('llms.txt not reachable at ' + url)
      advice.push('Ensure the live app is generating it at /llms.txt')
    } else {
      advice.push('llms.txt exists — AI crawlers (GPTBot, ClaudeBot, PerplexityBot) can discover your content')
      advice.push('Review it includes your latest products and top published posts')
    }
    return { exists, url, advice }
  }
}

function safeJSON(v: unknown, fb: unknown) {
  try { return JSON.parse(v as string) } catch { return fb }
}

export const seoAgent = new SEOAgent()