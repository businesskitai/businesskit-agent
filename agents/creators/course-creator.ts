/**
 * SAGE — Course Creator
 * "I structure knowledge into learnable paths."
 * Delegates storage to LEO (same products table, type='course').
 * Owns: lesson structure, curriculum, progress tracking reads.
 */

import { BaseAgent, db, now }   from '../_base.ts'
import { storeManager }                  from './store-manager.ts'

export interface Lesson {
  id: string
  title: string
  content?: string
  video_url?: string
  duration_minutes?: number
  position: number
  free_preview?: boolean
}

export interface CourseInput {
  title: string
  description?: string
  excerpt?: string
  price_cents: number
  sale_price_cents?: number
  thumbnail_url?: string
  lessons?: Lesson[]
  publish?: boolean
}

export class CourseCreator extends BaseAgent {
  readonly name  = 'SAGE'
  readonly title = 'Course Creator'

  async create(input: CourseInput) {
    return storeManager.create({
      type: 'course',
      ...input,
      // lessons stored as JSON on the product row
    })
  }

  async addLesson(courseId: string, lesson: Omit<Lesson, 'position'>) {
    await this.init()
    const course = await storeManager.get(courseId)
    if (course.type !== 'course') throw new Error('Not a course')

    const lessons: Lesson[] = JSON.parse(course.lessons as string || '[]')
    const newLesson: Lesson = { ...lesson, position: lessons.length }
    lessons.push(newLesson)

    const ts = now()
    await db.execute({
      sql: 'UPDATE products SET lessons=?,total_lessons=?,updated_at=? WHERE id=?',
      args: [JSON.stringify(lessons), lessons.length, ts, courseId],
    })
    return storeManager.get(courseId)
  }

  async updateLesson(courseId: string, lessonId: string, fields: Partial<Lesson>) {
    await this.init()
    const course = await storeManager.get(courseId)
    const lessons: Lesson[] = JSON.parse(course.lessons as string || '[]')
    const idx = lessons.findIndex(l => l.id === lessonId)
    if (idx === -1) throw new Error(`Lesson not found: ${lessonId}`)
    lessons[idx] = { ...lessons[idx], ...fields }

    await db.execute({
      sql: 'UPDATE products SET lessons=?,updated_at=? WHERE id=?',
      args: [JSON.stringify(lessons), now(), courseId],
    })
    return storeManager.get(courseId)
  }

  async reorderLessons(courseId: string, orderedIds: string[]) {
    await this.init()
    const course = await storeManager.get(courseId)
    const lessons: Lesson[] = JSON.parse(course.lessons as string || '[]')
    const sorted = orderedIds
      .map((id, i) => { const l = lessons.find(x => x.id === id); return l ? { ...l, position: i } : null })
      .filter(Boolean) as Lesson[]

    await db.execute({
      sql: 'UPDATE products SET lessons=?,updated_at=? WHERE id=?',
      args: [JSON.stringify(sorted), now(), courseId],
    })
  }

  async listCourses(published?: boolean) {
    return storeManager.list({ type: 'course', published })
  }

  /** Students who purchased this course and their progress */
  async getStudents(courseId: string) {
    await this.init()
    const { rows } = await db.execute({
      sql: `SELECT email,customer_name,course_progress,course_completed,course_completion_date,created_at
            FROM purchases WHERE product_id=? AND profile_id=? ORDER BY created_at DESC`,
      args: [courseId, this.profileId],
    })
    return rows
  }
}

export const courseCreator = new CourseCreator()
