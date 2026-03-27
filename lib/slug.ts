import { db } from './db.ts'

export const toSlug = (s: string) =>
  s.toLowerCase().trim()
   .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-')
   .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100)

/**
 * Generate a unique slug within a table.
 * Products use global uniqueness (no profile scope).
 * All other tables scope uniqueness to profile_id.
 */
export async function uniqueSlug(
  table: string,
  title: string,
  profileId?: string
): Promise<string> {
  const base = toSlug(title)
  let slug = base, i = 0
  while (true) {
    const { rows } = await db.execute({
      sql: profileId
        ? `SELECT 1 FROM ${table} WHERE slug=? AND profile_id=? LIMIT 1`
        : `SELECT 1 FROM ${table} WHERE slug=? LIMIT 1`,
      args: profileId ? [slug, profileId] : [slug],
    })
    if (!rows.length) return slug
    slug = `${base}-${++i}`
  }
}
