/**
 * Content Agent — unified CMS writer (SEObot-quality).
 *
 * DB reality (see businesskit-files/content.ts):
 *   There is no `posts` / `notes` / `guides` / `compare` / `newsletter` table.
 *   Everything lives in ONE table: `content`. The "type" of content is
 *   encoded by `cms_id` (→ one row per section in the `cms` table, which in
 *   turn has a `category_id` like `cat_35` for blog, `cat_37` for notes, etc).
 *
 *   Analytics are trigger-maintained:
 *     - content_analytics (1 row per content item) — scalar counts + JSON
 *       breakdowns. JSON is lazy-aggregated on dashboard page visit;
 *       `last_aggregated_at` throttles rebuilds. AGENTS MUST NOT REBUILD.
 *     - cms_analytics (1 row per cms page) — total_posts / total_draft /
 *       total_published maintained by trg_content_insert / update / delete.
 *
 * Supported kinds (pick one; maps to cms_id via category_id):
 *   blog, notes, guides, newsletter, compare, alternative, prompt, skills
 *
 * Quality bar (from SEObot research):
 *   - Min 1500 words for blog, 2500+ for ultimate-guide
 *   - SEO title ≤60 chars, meta description ≤160 chars
 *   - Excerpt is a hook sentence, not a summary
 *   - internal_links count maintained, sources JSON cited when factual
 */

import { BaseAgent, db, ulid, iso } from '../_base.ts'
import { logMemory }                from '../../lib/memory.ts'
import { ensureCmsRow }             from '../../lib/cms.ts'

// ── Content "kinds" — the logical content type. Maps to cms_id at write. ────
// Kept as a stable public API so other agents (seo, operations, ceo, marketing)
// don't have to know about cms_id internals.
export type ContentKind =
  | 'blog' | 'notes' | 'guides' | 'newsletter'
  | 'compare' | 'alternative' | 'prompt' | 'skills'

// Back-compat alias — old callers said `ContentTable`, same values.
export type ContentTable = ContentKind

export type ContentType =
  | 'blog'
  | 'listicle'
  | 'how-to'
  | 'checklist'
  | 'qa'
  | 'versus'
  | 'roundup'
  | 'news'
  | 'ultimate-guide'
  | 'programmatic'

export interface WriteInput {
  title: string
  kind?: ContentKind         // default: 'blog'
  table?: ContentTable       // back-compat alias for `kind`
  topic?: string
  content_type?: ContentType
  target_keywords?: string[]
  word_count_target?: number
  collection_id?: string
  publish?: boolean
}

export interface WriteResult {
  id: string
  kind: ContentKind
  slug: string
  title: string
  word_count: number
  content_type: ContentType
  seo_title: string
  seo_description: string
  published: boolean
  url: string
}

// Logical kind → category_id (seeded, stable — see DEFAULT_CMS_PAGES).
const KIND_CATEGORY: Record<ContentKind, string> = {
  blog:         'cat_35',
  notes:        'cat_37',
  guides:       'cat_36',
  newsletter:   'cat_20',
  compare:      'cat_40',
  alternative:  'cat_41',
  prompt:       'cat_39',
  skills:       'cat_38',
}

// Public URL path per kind — blog lives under /blog, everything else under /<kind>.
const KIND_ROUTE: Record<ContentKind, string> = {
  blog:         'blog',
  notes:        'notes',
  guides:       'guides',
  newsletter:   'n',
  compare:      'compare',
  alternative:  'alternative',
  prompt:       'prompt',
  skills:       'skills',
}

// Word-count target per content_type
const WORD_TARGETS: Record<ContentType, number> = {
  'blog':           1500,
  'listicle':       2000,
  'how-to':         2000,
  'checklist':      1200,
  'qa':             1500,
  'versus':         2000,
  'roundup':        2000,
  'news':           800,
  'ultimate-guide': 3000,
  'programmatic':   1000,
}

// `versus` is the content_type that belongs in the `compare` kind
const TYPE_KIND: Partial<Record<ContentType, ContentKind>> = {
  'versus': 'compare',
}

/** Resolve a cms_id for a logical content kind — creates missing rows on demand. */
export async function getCmsId(profileId: string, kind: ContentKind): Promise<string> {
  return ensureCmsRow(profileId, KIND_CATEGORY[kind], {
    slug: KIND_ROUTE[kind],
    title: kind.charAt(0).toUpperCase() + kind.slice(1),
  })
}

export class BlogWriter extends BaseAgent {
  readonly name  = 'Content'
  readonly title = 'Content Agent'

  // ── Write new content ──────────────────────────────────────────────────────

  async write(input: WriteInput): Promise<WriteResult> {
    await this.init()

    const contentType = input.content_type ?? 'blog'
    const kind        = input.kind ?? input.table ?? TYPE_KIND[contentType] ?? 'blog'
    const wordTarget  = input.word_count_target ?? WORD_TARGETS[contentType]
    const keywords    = input.target_keywords ?? []

    const cms_id = await getCmsId(this.profileId, kind)
    const slug   = await this.makeSlug(input.title, cms_id)
    const id     = ulid()
    const ts     = iso()

    // Structural hint — Claude writes actual content when invoked via CLI/Code.
    const structureHint = this.structureForType(contentType, wordTarget, keywords)
    const content       = await this.generateContent(input.title, input.topic ?? input.title, structureHint, keywords)
    const excerpt       = await this.generateExcerpt(content, contentType)
    const seoTitle      = await this.generateSEOTitle(input.title, keywords)
    const seoDesc       = await this.generateSEODescription(content, keywords)
    const wordCount     = this.countWords(content)
    const readingTime   = Math.ceil(wordCount / 200)
    const internalLinks = await this.countInternalLinks(input.title, keywords)

    await db.write({
      sql: `INSERT INTO content
             (id, cms_id, category_id, profile_id, user_id, slug, title,
              content, excerpt, published, hidden, collection_id,
              seo_title, seo_description, seo_keywords,
              word_count, reading_time_mins, internal_links, sources,
              created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,'[]',?,?)`,
      args: [
        id, cms_id, KIND_CATEGORY[kind], this.profileId, this.userId, slug, input.title,
        content, excerpt, input.publish ? 1 : 0,
        input.collection_id ?? null,
        seoTitle, seoDesc,
        keywords.length ? JSON.stringify(keywords) : null,
        wordCount, readingTime, internalLinks,
        ts, ts,
      ],
    })

    await logMemory(this.agentType,
      `${input.publish ? 'Published' : 'Drafted'} "${input.title}" (${kind}/${contentType}, ${wordCount} words)`,
      { id, kind, slug, content_type: contentType, word_count: wordCount })

    return {
      id, kind, slug, title: input.title,
      word_count: wordCount, content_type: contentType,
      seo_title: seoTitle, seo_description: seoDesc,
      published: !!input.publish,
      url: `https://${this.ctx.profile.slug}.businesskit.io/${KIND_ROUTE[kind]}/${slug}`,
    }
  }

  // ── List + manage (unified table, filter by cms_id/kind) ──────────────────

  async listDrafts(kind: ContentKind = 'blog') {
    await this.init()
    const cms_id = await getCmsId(this.profileId, kind)
    const { rows } = await db.execute({
      sql: `SELECT id, title, slug, word_count, created_at, updated_at
            FROM content
            WHERE profile_id=? AND cms_id=? AND published=0 AND hidden=0
            ORDER BY updated_at DESC LIMIT 20`,
      args: [this.profileId, cms_id],
    })
    return rows
  }

  async listPublished(kind: ContentKind = 'blog', limit = 20) {
    await this.init()
    const cms_id = await getCmsId(this.profileId, kind)
    const { rows } = await db.execute({
      sql: `SELECT id, title, slug, word_count, created_at, updated_at
            FROM content
            WHERE profile_id=? AND cms_id=? AND published=1 AND hidden=0
            ORDER BY updated_at DESC LIMIT ?`,
      args: [this.profileId, cms_id, limit],
    })
    return rows
  }

  /** Publish (trigger flips cms_analytics draft→published). */
  async publishContent(id: string) {
    await this.init()
    await db.write({
      sql: `UPDATE content SET published=1, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [iso(), id, this.profileId],
    })
    const { rows: [r] } = await db.execute({
      sql: `SELECT title, slug FROM content WHERE id=? AND profile_id=? LIMIT 1`,
      args: [id, this.profileId],
    })
    if (r) await logMemory(this.agentType, `Published "${r.title}"`, { id, slug: r.slug })
  }

  async unpublish(id: string) {
    await this.init()
    await db.write({
      sql: `UPDATE content SET published=0, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [iso(), id, this.profileId],
    })
  }

  /** Soft archive — never hard DELETE (that would fire trg_content_delete and
   *  decrement counters). hidden=1 keeps counters intact. */
  async archiveContent(id: string) {
    await this.init()
    await db.write({
      sql: `UPDATE content SET hidden=1, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [iso(), id, this.profileId],
    })
  }

  // ── Content inventory — free via cms_analytics (trigger-maintained) ───────

  async inventory() {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT c.slug AS kind, c.category_id,
                   a.total_posts, a.total_published, a.total_draft
            FROM cms c
            LEFT JOIN cms_analytics a ON a.cms_id = c.id
            WHERE c.profile_id=?`,
      args: [this.profileId],
    })

    const out: Record<string, { total: number; published: number; drafts: number }> = {}
    for (const r of rows) {
      const k = String(r.kind ?? r.category_id)
      out[k] = {
        total:     Number(r.total_posts ?? 0),
        published: Number(r.total_published ?? 0),
        drafts:    Number(r.total_draft ?? 0),
      }
    }
    return out
  }

  // ── SEO quality audit ─────────────────────────────────────────────────────

  async seoAudit(kind: ContentKind = 'blog') {
    await this.init()
    const cms_id = await getCmsId(this.profileId, kind)
    const { rows } = await db.execute({
      sql: `SELECT id, title, slug, excerpt, seo_title, seo_description, word_count
            FROM content
            WHERE profile_id=? AND cms_id=? AND published=1 AND hidden=0`,
      args: [this.profileId, cms_id],
    })

    const issues: Array<{ id: string; title: string; problems: string[] }> = []
    for (const r of rows) {
      const problems: string[] = []
      if (!r.excerpt)                                   problems.push('missing excerpt')
      if (!r.seo_title)                                 problems.push('missing seo_title')
      if (!r.seo_description)                           problems.push('missing seo_description')
      if (r.seo_title && String(r.seo_title).length > 60)                problems.push('seo_title too long (>60)')
      if (r.seo_description && String(r.seo_description).length > 160)   problems.push('seo_description too long (>160)')
      if (Number(r.word_count ?? 0) < 300)              problems.push('too short (<300 words)')
      if (!r.slug || String(r.slug).includes(' '))      problems.push('bad slug')
      if (problems.length) issues.push({ id: r.id as string, title: r.title as string, problems })
    }
    return issues
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private structureForType(type: ContentType, wordTarget: number, keywords: string[]): string {
    const kw = keywords.length ? `Target keywords: ${keywords.join(', ')}. ` : ''
    const structures: Record<ContentType, string> = {
      'blog':          `${kw}Write a comprehensive blog post. Intro hook → 3-5 main sections with H2s → conclusion with CTA. ~${wordTarget} words.`,
      'listicle':      `${kw}Write a numbered listicle. Hook intro → numbered items (H3 each, 2-3 sentences, practical tip) → summary. 7-15 items. ~${wordTarget} words.`,
      'how-to':        `${kw}Write a step-by-step how-to. Problem intro → numbered steps (H3 each, clear action, why it matters) → result. ~${wordTarget} words.`,
      'checklist':     `${kw}Write a practical checklist. Short intro → grouped checklist items with brief explanations → conclusion. Imperative language. ~${wordTarget} words.`,
      'qa':             `${kw}Write a Q&A article. Short intro → 8-12 questions as H2s with 2-4 sentence answers → summary. Address real search queries. ~${wordTarget} words.`,
      'versus':        `${kw}Write a versus comparison. TL;DR verdict → feature table → pros/cons each option → who should use what → verdict. ~${wordTarget} words.`,
      'roundup':       `${kw}Write a curated roundup. Criteria intro → each option (H3, 2-3 sentences, best for who) → comparison table → top pick. ~${wordTarget} words.`,
      'news':          `${kw}Write a news article. Lead paragraph (who/what/when/where/why) → context → implications → sources cited. ~${wordTarget} words. Cite all facts.`,
      'ultimate-guide':`${kw}Write a definitive ultimate guide. Executive summary → TOC → deep-dive sections (H2+H3) → examples → FAQs → conclusion. ~${wordTarget}+ words.`,
      'programmatic':  `${kw}Write an SEO-optimized page. Clear H1 → key info table → main content → FAQs → CTA. Concise, factual. ~${wordTarget} words.`,
    }
    return structures[type]
  }

  private async generateContent(_title: string, _topic: string, structure: string, _keywords: string[]): Promise<string> {
    // Claude, the runtime LLM, fills this in when invoked via CLI / Code.
    return `<!-- Agent: generate ${structure} -->`
  }

  private async generateExcerpt(_content: string, type: ContentType): Promise<string> {
    return `<!-- Agent: write a 1-sentence hook excerpt for this ${type} -->`
  }

  private async generateSEOTitle(title: string, keywords: string[]): Promise<string> {
    const kw = keywords[0] ?? ''
    const base = kw && !title.toLowerCase().includes(kw.toLowerCase())
      ? `${title} | ${kw}` : title
    return base.slice(0, 60)
  }

  private async generateSEODescription(_content: string, keywords: string[]): Promise<string> {
    return `<!-- Agent: write 155-char meta description including: ${keywords.join(', ')} -->`
  }

  /** Count of internal-link candidates — stored as an integer on content. */
  private async countInternalLinks(title: string, keywords: string[]): Promise<number> {
    try {
      const search = keywords[0] ?? title.split(' ')[0]
      const { rows: [r] } = await db.execute({
        sql: `SELECT COUNT(*) AS n FROM content
              WHERE profile_id=? AND published=1 AND hidden=0
                AND (title LIKE ? OR slug LIKE ?)`,
        args: [this.profileId, `%${search}%`, `%${search}%`],
      })
      return Math.min(3, Number(r?.n ?? 0))
    } catch { return 0 }
  }

  private async makeSlug(title: string, cms_id: string): Promise<string> {
    const base = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)

    // Unique index is (profile_id, category_id, slug). Dedupe per cms section.
    const { rows: [exists] } = await db.execute({
      sql: `SELECT slug FROM content
            WHERE profile_id=? AND cms_id=? AND slug=? LIMIT 1`,
      args: [this.profileId, cms_id, base],
    })
    return exists ? `${base}-${Date.now().toString(36)}` : base
  }

  private countWords(content: string): number {
    return content.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length
  }
}

export const blogWriter = new BlogWriter()
