/**
 * SCOUT — SEO Agent
 * "Invisible to people. Unmissable to search engines."
 * Writes to: collections (SEO per category), profile meta
 * Reads: posts, products, doc_articles — audits slug + meta quality
 */

import { BaseAgent, db, now } from '../_base.ts'
import { toSlug }              from '../../lib/slug.ts'

export class SEOAgent extends BaseAgent {
  readonly name  = 'SCOUT'
  readonly title = 'SEO Agent'

  /** Audit all published content for SEO completeness */
  async audit() {
    await this.init()
    const [posts, products, articles] = await Promise.all([
      db.execute({
        sql: 'SELECT id,title,slug,excerpt FROM posts WHERE profile_id=? AND published=1 AND hidden=0',
        args: [this.profileId],
      }),
      db.execute({
        sql: 'SELECT id,title,slug,excerpt FROM products WHERE profile_id=? AND published=1 AND hidden=0',
        args: [this.profileId],
      }),
      db.execute({
        sql: 'SELECT id,title,slug,excerpt FROM doc_articles WHERE profile_id=? AND published=1',
        args: [this.profileId],
      }),
    ])

    const issues: AuditIssue[] = []
    const check = (rows: typeof posts.rows, type: string) => {
      for (const r of rows) {
        if (!r.excerpt)           issues.push({ type, id: r.id as string, title: r.title as string, issue: 'Missing excerpt/meta description' })
        if (!r.slug)              issues.push({ type, id: r.id as string, title: r.title as string, issue: 'Missing slug' })
        if ((r.slug as string)?.length > 60) issues.push({ type, id: r.id as string, title: r.title as string, issue: 'Slug too long (>60 chars)' })
        if ((r.title as string)?.length > 60) issues.push({ type, id: r.id as string, title: r.title as string, issue: 'Title too long for SEO (>60 chars)' })
      }
    }

    check(posts.rows, 'post')
    check(products.rows, 'product')
    check(articles.rows, 'article')

    return { issues, score: Math.max(0, 100 - issues.length * 10), total_audited: posts.rows.length + products.rows.length + articles.rows.length }
  }

  /** Upsert SEO metadata for a category collection */
  async setCollectionSEO(categorySlug: string, seo: {
    seo_title?: string; seo_description?: string
    seo_og_image?: string; seo_robots?: string; seo_block_indexing?: boolean
  }) {
    await this.init()
    const id = `${this.profileId}_${categorySlug}`
    const ts = now()

    await db.execute({
      sql: `INSERT INTO collections (id,profile_id,category_slug,seo_title,seo_description,seo_og_image,seo_robots,seo_block_indexing,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              seo_title=excluded.seo_title, seo_description=excluded.seo_description,
              seo_og_image=excluded.seo_og_image, seo_robots=excluded.seo_robots,
              seo_block_indexing=excluded.seo_block_indexing, updated_at=excluded.updated_at`,
      args: [
        id, this.profileId, categorySlug,
        seo.seo_title ?? null, seo.seo_description ?? null,
        seo.seo_og_image ?? null, seo.seo_robots ?? null,
        seo.seo_block_indexing ? 1 : 0, ts, ts,
      ],
    })
  }

  /** Suggest SEO-optimised slug for any title */
  suggestSlug(title: string): string { return toSlug(title) }

  /** Generate meta description from content body */
  generateMeta(content: string, maxLength = 155): string {
    const clean = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    return clean.length <= maxLength ? clean : clean.slice(0, maxLength - 3) + '...'
  }
}

interface AuditIssue { type: string; id: string; title: string; issue: string }

export const seoAgent = new SEOAgent()
