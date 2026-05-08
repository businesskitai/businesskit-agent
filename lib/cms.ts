/**
 * lib/cms.ts — cms row resolver.
 *
 * The app-side `cms` table is one row per content section (Blog, Notes, Jobs,
 * Forms, Docs, etc.) keyed by (profile_id, category_id). Triggers on
 * job_listings, forms, products, doc_articles, content all UPDATE `cms_analytics`
 * for the matching cms_id — so the cms row must exist for counters to move.
 *
 * Use `ensureCmsRow()` before any INSERT into a table whose trigger touches
 * cms_analytics. Idempotent — unique index on (profile_id, category_id).
 *
 * Category IDs (seeded by app; stable):
 *   cat_1  Links          cat_31 Jobs
 *   cat_18 Courses        cat_32 Docs (Knowledge Base)
 *   cat_19 Downloads      cat_34 Forms
 *   cat_20 Newsletter     cat_35 Blog
 *   cat_22 Meetings       cat_36 Guides
 *   cat_24 Webinars       cat_37 Notes
 *   cat_25 Services       cat_38 Skills
 *   cat_27 Listing        cat_39 Prompt
 *   cat_30 Booking        cat_40 Compare
 *                         cat_41 Alternative
 *   cat_42 Community      cat_45 Posts
 *   cat_47 Pages          cat_8  Events
 *   cat_21 Sponsorship
 */

import { db } from './db.ts'
import { ulid } from './id.ts'

/** Find or create a cms row for (profile_id, category_id). Returns the cms.id. */
export async function ensureCmsRow(
  profileId: string,
  categoryId: string,
  opts: { slug?: string; title?: string } = {},
): Promise<string> {
  const { rows: [existing] } = await db.execute({
    sql: `SELECT id FROM cms WHERE profile_id=? AND category_id=? LIMIT 1`,
    args: [profileId, categoryId],
  })
  if (existing?.id) return existing.id as string

  const id = ulid()
  await db.write({
    sql: `INSERT OR IGNORE INTO cms (id, profile_id, slug, title, category_id)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      id, profileId,
      opts.slug  ?? categoryId,
      opts.title ?? categoryId,
      categoryId,
    ],
  })

  const { rows: [row] } = await db.execute({
    sql: `SELECT id FROM cms WHERE profile_id=? AND category_id=? LIMIT 1`,
    args: [profileId, categoryId],
  })
  return (row?.id as string) ?? id
}

/** Category IDs used by app — import by name to avoid magic strings. */
export const CATEGORY = {
  LINKS:       'cat_1',
  EVENTS:      'cat_8',
  COURSES:     'cat_18',
  DOWNLOADS:   'cat_19',
  NEWSLETTER:  'cat_20',
  SPONSORSHIP: 'cat_21',
  MEETINGS:    'cat_22',
  WEBINARS:    'cat_24',
  SERVICES:    'cat_25',
  LISTING:     'cat_27',
  BOOKING:     'cat_30',
  JOBS:        'cat_31',
  DOCS:        'cat_32',
  FORMS:       'cat_34',
  BLOG:        'cat_35',
  GUIDES:      'cat_36',
  NOTES:       'cat_37',
  SKILLS:      'cat_38',
  PROMPT:      'cat_39',
  COMPARE:     'cat_40',
  ALTERNATIVE: 'cat_41',
  COMMUNITY:   'cat_42',
  POSTS:       'cat_45',
  PAGES:       'cat_47',
} as const
