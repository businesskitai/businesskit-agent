# /course-creator — Create Course

1. Ask: title, price (dollars), description, lesson count
2. Per lesson: title, content or video_url, duration_minutes, free_preview?
3. `sage.create({ title, price_cents, description })` → get courseId
4. `sage.addLesson(courseId, lesson)` for each lesson
5. Confirm: slug, total_lessons, price.

Students/progress: `sage.getStudents(courseId)`
