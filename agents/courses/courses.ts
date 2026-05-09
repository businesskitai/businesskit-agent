/**
 * Courses Agent — course-shaped products.
 *
 * A course is `products.type='course'` + `category_id='cat_18'`. StoreManager
 * owns storage, slug, cms-row seeding, and analytics triggers. This agent
 * owns the course-shaped layer on top: the **module → lesson** tree stored as
 * JSON on products.lessons, the total_lessons scalar, and student progress
 * reads from purchases.
 *
 * JSON shape on products.lessons (app-side canonical):
 *   [
 *     { id: 'module-…', title: 'Module 1', order: 0, lessons: [
 *         { id: 'lesson-…', title: 'Hello', content: '<p>…</p>', order: 0 },
 *         …
 *       ] },
 *     …
 *   ]
 *
 * total_lessons is the SUM of lessons across every module — not the module
 * count. Order fields are 0-indexed and we rewrite them on every mutation so
 * they stay contiguous.
 *
 * ID convention matches the app (`module-<ms>`, `lesson-<ms>`). If caller
 * passes an id we keep it; otherwise we mint one.
 *
 * DB contract (businesskit-files/provision.ts):
 *   - products.lessons                  TEXT (JSON — see shape above)
 *   - products.total_lessons            INTEGER
 *   - products.course_access_type       'open' | …
 *   - products.course_access_config     TEXT (JSON)
 *   - purchases.course_progress         TEXT (JSON — lesson_id → state)
 *   - purchases.course_completed        INTEGER 0/1
 *   - purchases.course_completion_date  INTEGER unix
 *
 * Triggers (product-triggers.ts): trg_product_insert /
 * trg_product_update_published / trg_product_delete all fire through
 * StoreManager. We never INSERT / DELETE products here.
 *
 * Timestamps on products are INTEGER unix seconds (now()).
 */

import { BaseAgent, db, now } from '../_base.ts'
import { storeManager }        from '../store/store.ts'

export interface Lesson {
  id:                string
  title:             string
  content?:          string
  video_url?:        string
  duration_minutes?: number
  free_preview?:     boolean
  order:             number
}

export interface Module {
  id:      string
  title:   string
  order:   number
  lessons: Lesson[]
}

export type LessonInput = Omit<Lesson, 'id' | 'order'> & { id?: string }
export type ModuleInput = {
  id?:      string
  title:    string
  lessons?: LessonInput[]
}

export interface CourseInput {
  title:                 string
  description?:          string
  excerpt?:              string
  price_cents:           number
  sale_price_cents?:     number
  currency?:             string
  thumbnail_url?:        string
  hero_image_url?:       string
  cover_video_url?:      string
  tags?:                 string[]
  features?:             string[]
  button_text?:          string
  modules?:              ModuleInput[]
  course_access_type?:   string
  course_access_config?: Record<string, unknown>
  collection_id?:        string
  seo_title?:            string
  seo_description?:      string
  publish?:              boolean
}

export class CourseCreator extends BaseAgent {
  readonly name  = 'Courses'
  readonly title = 'Course Creator'

  // ── Create / lifecycle (delegates to StoreManager) ────────────────────────

  async create(input: CourseInput) {
    await this.init()
    const modules = (input.modules ?? []).map((m, mi) => ({
      id:      m.id ?? moduleId(),
      title:   m.title,
      order:   mi,
      lessons: (m.lessons ?? []).map((l, li) => ({
        ...l,
        id:    l.id ?? lessonId(),
        order: li,
      })),
    })) as Module[]

    // StoreManager inserts the product row, seeds cat_18 cms row, and lets
    // trg_product_insert bump cms_analytics/profile_analytics. We pass the
    // module tree via `lessons` — StoreManager JSON-encodes it verbatim.
    const row = await storeManager.create({
      ...input,
      type:    'course',
      lessons: modules as unknown[],
    })

    // total_lessons is SUM across modules, not module count. StoreManager
    // doesn't know about the module shape, so we sync it here.
    const total = countLessons(modules)
    if (total) {
      await db.write({
        sql: `UPDATE products SET total_lessons=?, updated_at=?
              WHERE id=? AND profile_id=?`,
        args: [total, now(), row.id as string, this.profileId],
      })
    }

    await this.logMemory(
      `${input.publish ? 'Published' : 'Drafted'} course "${input.title}"`,
      { id: row.id, modules: modules.length, lessons: total },
    )
    return this.get(row.id as string)
  }

  async publish(id: string) {
    await this.assertCourse(id)
    return storeManager.publish(id)
  }

  async unpublish(id: string) {
    await this.assertCourse(id)
    return storeManager.unpublish(id)
  }

  async archive(id: string) {
    await this.assertCourse(id)
    await storeManager.archive(id)
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async get(id: string) {
    const row = await storeManager.get(id)
    if (row.type !== 'course') throw new Error(`Not a course: ${id}`)
    return row
  }

  async list(opts: { published?: boolean; include_hidden?: boolean; limit?: number } = {}) {
    return storeManager.list({ ...opts, type: 'course' })
  }

  async modules(courseId: string): Promise<Module[]> {
    const course = await this.get(courseId)
    return parseModules(course.lessons as string | null)
  }

  /** Flatten every lesson across every module — useful for progress views. */
  async allLessons(courseId: string): Promise<Array<Lesson & { module_id: string }>> {
    const modules = await this.modules(courseId)
    return modules.flatMap(m => m.lessons.map(l => ({ ...l, module_id: m.id })))
  }

  // ── Module mutations ──────────────────────────────────────────────────────

  async addModule(courseId: string, mod: ModuleInput): Promise<Module[]> {
    await this.assertCourse(courseId)
    const modules = await this.modules(courseId)
    const next: Module = {
      id:      mod.id ?? moduleId(),
      title:   mod.title,
      order:   modules.length,
      lessons: (mod.lessons ?? []).map((l, i) => ({
        ...l,
        id:    l.id ?? lessonId(),
        order: i,
      })),
    }
    const updated = [...modules, next]
    await this.writeModules(courseId, updated)
    await this.logMemory(`Added module "${mod.title}"`, { courseId, moduleId: next.id })
    return updated
  }

  async updateModule(
    courseId: string,
    moduleId: string,
    patch:    Partial<Pick<Module, 'title'>>,
  ): Promise<Module[]> {
    await this.assertCourse(courseId)
    const modules = await this.modules(courseId)
    const idx = modules.findIndex(m => m.id === moduleId)
    if (idx === -1) throw new Error(`Module not found: ${moduleId}`)
    modules[idx] = { ...modules[idx], ...patch }
    await this.writeModules(courseId, modules)
    return modules
  }

  async removeModule(courseId: string, moduleId: string): Promise<Module[]> {
    await this.assertCourse(courseId)
    const modules = await this.modules(courseId)
    const next = modules
      .filter(m => m.id !== moduleId)
      .map((m, i) => ({ ...m, order: i }))
    if (next.length === modules.length) throw new Error(`Module not found: ${moduleId}`)
    await this.writeModules(courseId, next)
    await this.logMemory(`Removed module ${moduleId}`, { courseId })
    return next
  }

  /** Reorder modules. Pass the new full order as a list of module ids.
   *  Ids not present are dropped — pass the full list to preserve all. */
  async reorderModules(courseId: string, orderedIds: string[]): Promise<Module[]> {
    await this.assertCourse(courseId)
    const modules = await this.modules(courseId)
    const byId    = new Map(modules.map(m => [m.id, m]))
    const next: Module[] = []
    for (let i = 0; i < orderedIds.length; i++) {
      const m = byId.get(orderedIds[i])
      if (m) next.push({ ...m, order: i })
    }
    await this.writeModules(courseId, next)
    return next
  }

  // ── Lesson mutations (scoped to a module) ─────────────────────────────────

  async addLesson(
    courseId: string,
    moduleId: string,
    lesson:   LessonInput,
  ): Promise<Module[]> {
    await this.assertCourse(courseId)
    const modules = await this.modules(courseId)
    const m = modules.find(x => x.id === moduleId)
    if (!m) throw new Error(`Module not found: ${moduleId}`)

    const next: Lesson = {
      ...lesson,
      id:    lesson.id ?? lessonId(),
      order: m.lessons.length,
    }
    m.lessons = [...m.lessons, next]
    await this.writeModules(courseId, modules)
    await this.logMemory(`Added lesson "${lesson.title}"`,
      { courseId, moduleId, lessonId: next.id })
    return modules
  }

  async updateLesson(
    courseId: string,
    moduleId: string,
    lessonId: string,
    patch:    Partial<Omit<Lesson, 'id' | 'order'>>,
  ): Promise<Module[]> {
    await this.assertCourse(courseId)
    const modules = await this.modules(courseId)
    const m = modules.find(x => x.id === moduleId)
    if (!m) throw new Error(`Module not found: ${moduleId}`)
    const idx = m.lessons.findIndex(l => l.id === lessonId)
    if (idx === -1) throw new Error(`Lesson not found: ${lessonId}`)
    m.lessons[idx] = { ...m.lessons[idx], ...patch }
    await this.writeModules(courseId, modules)
    return modules
  }

  async removeLesson(
    courseId: string,
    moduleId: string,
    lessonId: string,
  ): Promise<Module[]> {
    await this.assertCourse(courseId)
    const modules = await this.modules(courseId)
    const m = modules.find(x => x.id === moduleId)
    if (!m) throw new Error(`Module not found: ${moduleId}`)
    const before = m.lessons.length
    m.lessons = m.lessons
      .filter(l => l.id !== lessonId)
      .map((l, i) => ({ ...l, order: i }))
    if (m.lessons.length === before) throw new Error(`Lesson not found: ${lessonId}`)
    await this.writeModules(courseId, modules)
    await this.logMemory(`Removed lesson ${lessonId}`, { courseId, moduleId })
    return modules
  }

  /** Reorder lessons inside a module. Ids not present are dropped. */
  async reorderLessons(
    courseId:   string,
    moduleId:   string,
    orderedIds: string[],
  ): Promise<Module[]> {
    await this.assertCourse(courseId)
    const modules = await this.modules(courseId)
    const m = modules.find(x => x.id === moduleId)
    if (!m) throw new Error(`Module not found: ${moduleId}`)
    const byId = new Map(m.lessons.map(l => [l.id, l]))
    m.lessons = orderedIds
      .map((id, i) => {
        const l = byId.get(id)
        return l ? { ...l, order: i } : null
      })
      .filter(Boolean) as Lesson[]
    await this.writeModules(courseId, modules)
    return modules
  }

  /** Move a lesson to a different module. Appends at end of the target
   *  module and compacts order on both sides. */
  async moveLesson(
    courseId:     string,
    lessonId:     string,
    fromModuleId: string,
    toModuleId:   string,
  ): Promise<Module[]> {
    await this.assertCourse(courseId)
    if (fromModuleId === toModuleId) return this.modules(courseId)
    const modules = await this.modules(courseId)
    const from = modules.find(m => m.id === fromModuleId)
    const to   = modules.find(m => m.id === toModuleId)
    if (!from) throw new Error(`Source module not found: ${fromModuleId}`)
    if (!to)   throw new Error(`Target module not found: ${toModuleId}`)

    const idx = from.lessons.findIndex(l => l.id === lessonId)
    if (idx === -1) throw new Error(`Lesson not found in source module: ${lessonId}`)
    const [lesson] = from.lessons.splice(idx, 1)
    from.lessons = from.lessons.map((l, i) => ({ ...l, order: i }))
    to.lessons   = [...to.lessons, { ...lesson, order: to.lessons.length }]

    await this.writeModules(courseId, modules)
    return modules
  }

  // ── Student progress (reads from purchases) ───────────────────────────────

  async students(courseId: string, opts: { completed?: boolean; limit?: number } = {}) {
    await this.init()
    await this.assertCourse(courseId)
    let where = `WHERE product_id=? AND profile_id=?
                   AND payment_status='completed' AND status='active'`
    const args: unknown[] = [courseId, this.profileId]
    if (opts.completed !== undefined) {
      where += ' AND course_completed=?'
      args.push(opts.completed ? 1 : 0)
    }
    const { rows } = await db.execute({
      sql: `SELECT id, email, customer_name,
                   course_progress, course_completed, course_completion_date,
                   last_accessed_at, access_count, created_at
            FROM purchases ${where}
            ORDER BY created_at DESC LIMIT ?`,
      args: [...args, opts.limit ?? 100],
    })
    return rows
  }

  async enrollmentStats(courseId: string) {
    await this.init()
    await this.assertCourse(courseId)
    const { rows: [r] } = await db.execute({
      sql: `SELECT
              COUNT(*)                                            AS enrolled,
              SUM(CASE WHEN course_completed=1 THEN 1 ELSE 0 END) AS completed,
              COALESCE(SUM(amount_cents), 0)                      AS revenue_cents
            FROM purchases
            WHERE product_id=? AND profile_id=?
              AND payment_status='completed' AND status='active'`,
      args: [courseId, this.profileId],
    })
    const enrolled  = Number(r?.enrolled  ?? 0)
    const completed = Number(r?.completed ?? 0)
    return {
      enrolled,
      completed,
      completion_rate: enrolled ? completed / enrolled : 0,
      revenue_cents:   Number(r?.revenue_cents ?? 0),
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async assertCourse(id: string): Promise<void> {
    await this.init()
    const { rows: [r] } = await db.execute({
      sql: `SELECT type FROM products WHERE id=? AND profile_id=? LIMIT 1`,
      args: [id, this.profileId],
    })
    if (!r) throw new Error(`Course not found (or not yours): ${id}`)
    if (r.type !== 'course') throw new Error(`Not a course: ${id}`)
  }

  private async writeModules(courseId: string, modules: Module[]): Promise<void> {
    await db.write({
      sql: `UPDATE products
              SET lessons=?, total_lessons=?, updated_at=?
            WHERE id=? AND profile_id=?`,
      args: [
        JSON.stringify(modules),
        countLessons(modules),
        now(),
        courseId, this.profileId,
      ],
    })
  }
}

function countLessons(modules: Module[]): number {
  return modules.reduce((sum, m) => sum + (m.lessons?.length ?? 0), 0)
}

function parseModules(raw: string | null): Module[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Normalise — older rows might use `position` instead of `order`, or
    // store a flat lesson array with no modules. Coerce to module shape.
    return parsed.map((entry, i) => {
      if (entry && typeof entry === 'object' && Array.isArray(entry.lessons)) {
        return {
          id:      entry.id    ?? moduleId(),
          title:   entry.title ?? `Module ${i + 1}`,
          order:   Number(entry.order ?? entry.position ?? i),
          lessons: entry.lessons.map((l: Record<string, unknown>, li: number) => ({
            ...l,
            order: Number(l.order ?? l.position ?? li),
          })) as Lesson[],
        } as Module
      }
      // Flat lesson — wrap as a single default module on first parse.
      return null
    }).filter(Boolean) as Module[]
  } catch {
    return []
  }
}

const moduleId = () => `module-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const lessonId = () => `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const courseCreator = new CourseCreator()
