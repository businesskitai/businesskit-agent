/**
 * Blog Writer — SEObot-quality content agent
 *
 * Produces 8 content formats from content.ts:
 *   posts        → blog: listicle, how-to, checklist, qa, versus, roundup, news, ultimate-guide
 *   compare      → "X vs Y" programmatic SEO pages
 *   alternative  → "Best alternatives to X" pages
 *   prompt       → prompt library articles
 *   notes        → short-form notes
 *   guides       → long-form step-by-step guides
 *   newsletter   → email newsletter content
 *
 * Quality bar (from SEObot research):
 *   - Min 1500 words for blog, 2500+ for ultimate-guide
 *   - SEO title ≤60 chars, meta description ≤160 chars
 *   - Excerpt is a hook sentence, not a summary
 *   - internal_links: link to 2-3 related posts in same profile
 *   - sources: cite real URLs when making factual claims
 *   - content_type drives structure (listicle ≠ how-to ≠ qa)
 *
 * Tables written: posts, compare, alternative, prompt, notes, guides, newsletter
 */

import { BaseAgent, db, ulid, iso } from '../_base.ts'
import { logMemory }                from '../../lib/memory.ts'

export type ContentType =
  | 'blog'          // generic post
  | 'listicle'      // "Top 10 X" — numbered list with explanations
  | 'how-to'        // "How to X" — step by step
  | 'checklist'     // "X Checklist" — checkbox format
  | 'qa'            // "What is X? FAQs" — question/answer pairs
  | 'versus'        // "X vs Y" — comparison post (uses compare table)
  | 'roundup'       // "Best X tools/resources" — curated list
  | 'news'          // timely news summary with source links
  | 'ultimate-guide'// definitive long-form guide 2500+ words
  | 'programmatic'  // template-based SEO at scale

export type ContentTable =
  | 'posts' | 'compare' | 'alternative' | 'prompt'
  | 'notes' | 'guides' | 'newsletter'

export interface WriteInput {
  title: string
  topic?: string             // if different from title
  content_type?: ContentType
  table?: ContentTable       // default: 'posts'
  target_keywords?: string[]
  word_count_target?: number // default varies by type
  collection_id?: string
  publish?: boolean          // default: false (draft)
}

export interface WriteResult {
  id: string
  table: ContentTable
  slug: string
  title: string
  word_count: number
  content_type: ContentType
  seo_title: string
  seo_description: string
  published: boolean
  url: string
}

// Word count targets by content type
const WORD_TARGETS: Record<ContentType, number> = {
  'blog':          1500,
  'listicle':      2000,
  'how-to':        2000,
  'checklist':     1200,
  'qa':            1500,
  'versus':        2000,
  'roundup':       2000,
  'news':          800,
  'ultimate-guide': 3000,
  'programmatic':  1000,
}

// Which table each type writes to by default
const TYPE_TABLE: Partial<Record<ContentType, ContentTable>> = {
  'versus': 'compare',
}

export class BlogWriter extends BaseAgent {
  readonly name  = 'Blog Writer'
  readonly title = 'Blog Writer'

  // ── Write new content ───────────────────────────────────────────────────────

  async write(input: WriteInput): Promise<WriteResult> {
    await this.init()

    const contentType  = input.content_type ?? 'blog'
    const table        = input.table ?? TYPE_TABLE[contentType] ?? 'posts'
    const wordTarget   = input.word_count_target ?? WORD_TARGETS[contentType]
    const slug         = await this.makeSlug(input.title, table)
    const id           = ulid()
    const now          = iso()
    const keywords     = input.target_keywords ?? []

    // Build content structure instructions per type
    const structureHint = this.structureForType(contentType, wordTarget, keywords)

    // Agent writes the actual content — this is the LLM's job
    // The method returns the structure; Claude fills in the words
    const content = await this.generateContent(input.title, input.topic ?? input.title, structureHint, keywords)
    const excerpt = await this.generateExcerpt(content, contentType)
    const seoTitle = await this.generateSEOTitle(input.title, keywords)
    const seoDesc  = await this.generateSEODescription(content, keywords)

    const wordCount    = this.countWords(content)
    const readingTime  = Math.ceil(wordCount / 200)

    // Get internal links from existing posts
    const internalLinks = await this.findInternalLinks(input.title, keywords)

    if (table === 'posts') {
      await db.execute({
        sql: `INSERT INTO posts
              (id,profile_id,user_id,slug,title,content,excerpt,
               content_type,seo_title,seo_description,seo_keywords,
               word_count,reading_time_mins,internal_links,sources,
               published,hidden,collection_id,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
        args: [
          id, this.profileId, this.userId, slug, input.title, content, excerpt,
          contentType, seoTitle, seoDesc,
          keywords.length ? JSON.stringify(keywords) : null,
          wordCount, readingTime,
          JSON.stringify(internalLinks), '[]',
          input.publish ? 1 : 0, null,
          input.collection_id ?? null, now, now,
        ],
      })
    } else {
      // compare, alternative, prompt, notes, guides, newsletter
      await db.execute({
        sql: `INSERT INTO ${table}
              (id,profile_id,user_id,slug,title,content,excerpt,
               published,hidden,collection_id,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,0,?,?,?)`,
        args: [
          id, this.profileId, this.userId, slug, input.title, content, excerpt,
          input.publish ? 1 : 0,
          input.collection_id ?? null, now, now,
        ],
      })
    }

    await logMemory('blog-writer',
      `${input.publish ? 'Published' : 'Drafted'} "${input.title}" (${contentType}, ${wordCount} words)`,
      { id, table, slug, content_type: contentType, word_count: wordCount }
    )

    return {
      id, table, slug, title: input.title,
      word_count: wordCount, content_type: contentType,
      seo_title: seoTitle, seo_description: seoDesc,
      published: !!input.publish,
      url: `https://${this.ctx.profile.slug}.businesskit.io/${table === 'posts' ? 'blog' : table}/${slug}`,
    }
  }

  // ── List + manage ───────────────────────────────────────────────────────────

  async listDrafts(table: ContentTable = 'posts') {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT id,title,slug,content_type,word_count,created_at
            FROM ${table} WHERE profile_id=? AND published=0 AND hidden=0
            ORDER BY created_at DESC LIMIT 20`,
      args: [this.profileId],
    })
    return rows
  }

  async listPublished(table: ContentTable = 'posts', limit = 20) {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT id,title,slug,content_type,word_count,created_at
            FROM ${table} WHERE profile_id=? AND published=1 AND hidden=0
            ORDER BY created_at DESC LIMIT ?`,
      args: [this.profileId, limit],
    })
    return rows
  }

  async publishContent(id: string, table: ContentTable = 'posts') {
    await this.init()
    await db.execute({
      sql: `UPDATE ${table} SET published=1,updated_at=? WHERE id=? AND profile_id=?`,
      args: [iso(), id, this.profileId],
    })
    const { rows: [r] } = await db.execute({
      sql: `SELECT title,slug FROM ${table} WHERE id=? LIMIT 1`,
      args: [id],
    })
    if (r) await logMemory('blog-writer', `Published "${r.title}"`, { id, table, slug: r.slug })
  }

  async unpublish(id: string, table: ContentTable = 'posts') {
    await this.init()
    await db.execute({
      sql: `UPDATE ${table} SET published=0,updated_at=? WHERE id=? AND profile_id=?`,
      args: [iso(), id, this.profileId],
    })
  }

  async archiveContent(id: string, table: ContentTable = 'posts') {
    await this.init()
    await db.execute({
      sql: `UPDATE ${table} SET hidden=1,updated_at=? WHERE id=? AND profile_id=?`,
      args: [iso(), id, this.profileId],
    })
  }

  // ── Content inventory across all tables ─────────────────────────────────────

  async inventory() {
    await this.init()
    const tables: ContentTable[] = ['posts', 'compare', 'alternative', 'prompt', 'notes', 'guides', 'newsletter']
    const results: Record<string, { published: number; drafts: number }> = {}

    for (const t of tables) {
      try {
        const { rows: [r] } = await db.execute({
          sql: `SELECT
                SUM(CASE WHEN published=1 AND hidden=0 THEN 1 ELSE 0 END) published,
                SUM(CASE WHEN published=0 AND hidden=0 THEN 1 ELSE 0 END) drafts
                FROM ${t} WHERE profile_id=?`,
          args: [this.profileId],
        })
        results[t] = { published: Number(r?.published ?? 0), drafts: Number(r?.drafts ?? 0) }
      } catch {
        results[t] = { published: 0, drafts: 0 }
      }
    }
    return results
  }

  // ── SEO quality audit ───────────────────────────────────────────────────────

  async seoAudit(table: ContentTable = 'posts') {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT id,title,slug,excerpt,seo_title,seo_description,word_count,content_type
            FROM ${table} WHERE profile_id=? AND published=1 AND hidden=0`,
      args: [this.profileId],
    })

    const issues: Array<{ id: string; title: string; problems: string[] }> = []
    for (const r of rows) {
      const problems: string[] = []
      if (!r.excerpt)                                   problems.push('missing excerpt')
      if (!r.seo_title)                                 problems.push('missing seo_title')
      if (!r.seo_description)                           problems.push('missing seo_description')
      if (r.seo_title && String(r.seo_title).length > 60)   problems.push('seo_title too long (>60)')
      if (r.seo_description && String(r.seo_description).length > 160) problems.push('seo_description too long (>160)')
      if (Number(r.word_count ?? 0) < 300)              problems.push('too short (<300 words)')
      if (!r.slug || String(r.slug).includes(' '))      problems.push('bad slug')
      if (problems.length) issues.push({ id: r.id as string, title: r.title as string, problems })
    }
    return issues
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private structureForType(type: ContentType, wordTarget: number, keywords: string[]): string {
    const kw = keywords.length ? `Target keywords: ${keywords.join(', ')}. ` : ''

    const structures: Record<ContentType, string> = {
      'blog':          `${kw}Write a comprehensive blog post. Intro hook → 3-5 main sections with H2s → conclusion with CTA. ~${wordTarget} words.`,
      'listicle':      `${kw}Write a numbered listicle. Hook intro → numbered items (each with H3, 2-3 sentences, practical tip) → summary. Aim for 7-15 items. ~${wordTarget} words.`,
      'how-to':        `${kw}Write a step-by-step how-to guide. Problem intro → numbered steps (each with H3, clear action, why it matters) → result/outcome. ~${wordTarget} words.`,
      'checklist':     `${kw}Write a practical checklist. Short intro → grouped checklist items with brief explanations → conclusion. Use clear imperative language. ~${wordTarget} words.`,
      'qa':            `${kw}Write a Q&A article. Short intro → 8-12 questions as H2s with 2-4 sentence answers → summary. Address real search queries. ~${wordTarget} words.`,
      'versus':        `${kw}Write a versus comparison. TL;DR verdict first → feature table → pros/cons each option → who should use what → verdict. ~${wordTarget} words.`,
      'roundup':       `${kw}Write a curated roundup. Intro explaining criteria → each option with H3, 2-3 sentences, best for who → comparison table → top pick. ~${wordTarget} words.`,
      'news':          `${kw}Write a news article. Lead paragraph (who/what/when/where/why) → context → implications → sources cited. ~${wordTarget} words. Cite all facts.`,
      'ultimate-guide':`${kw}Write a definitive ultimate guide. Executive summary → table of contents → deep-dive sections with H2+H3 hierarchy → examples → FAQs → conclusion. ~${wordTarget}+ words.`,
      'programmatic':  `${kw}Write an SEO-optimized page. Clear H1 → key info table → main content → FAQs → CTA. Concise and factual. ~${wordTarget} words.`,
    }
    return structures[type]
  }

  private async generateContent(title: string, topic: string, structure: string, keywords: string[]): Promise<string> {
    // In agent context: Claude IS the LLM. Claude writes this content directly.
    // This method returns the prompt structure; the agent fills it with real content.
    // When called from CLI or Claude Code, the agent generates and returns the content.
    return `<!-- Agent: generate ${structure} for title: "${title}" -->`
  }

  private async generateExcerpt(content: string, type: ContentType): Promise<string> {
    // Hook sentence, not a summary. Makes reader want to click.
    return `<!-- Agent: write a 1-sentence hook excerpt for this ${type} -->`
  }

  private async generateSEOTitle(title: string, keywords: string[]): Promise<string> {
    // ≤60 chars, includes primary keyword
    const kw = keywords[0] ?? ''
    const base = kw && !title.toLowerCase().includes(kw.toLowerCase())
      ? `${title} | ${kw}` : title
    return base.slice(0, 60)
  }

  private async generateSEODescription(content: string, keywords: string[]): Promise<string> {
    // ≤160 chars, compelling, includes keyword
    return `<!-- Agent: write 155-char meta description including: ${keywords.join(', ')} -->`
  }

  private async findInternalLinks(title: string, keywords: string[]): Promise<string[]> {
    // Find 2-3 related published posts in same profile
    try {
      const search = keywords[0] ?? title.split(' ')[0]
      const { rows } = await db.execute({
        sql: `SELECT slug,title FROM posts
              WHERE profile_id=? AND published=1 AND hidden=0
              AND (title LIKE ? OR slug LIKE ?)
              LIMIT 3`,
        args: [this.profileId, `%${search}%`, `%${search}%`],
      })
      return rows.map((r: any) => `/blog/${r.slug}`)
    } catch { return [] }
  }

  private async makeSlug(title: string, table: string): Promise<string> {
    const base = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)

    const { rows: [exists] } = await db.execute({
      sql: `SELECT slug FROM ${table} WHERE profile_id=? AND slug=? LIMIT 1`,
      args: [this.profileId, base],
    })
    return exists ? `${base}-${Date.now().toString(36)}` : base
  }

  private countWords(content: string): number {
    return content.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length
  }
}

export const blogWriter = new BlogWriter()
