import { Navigate, useParams } from 'react-router-dom'
import { getLesson, lessons } from '../content/loadLessons'
import { isUnlocked } from '../engine/mastery'
import { useProgress } from '../progress/ProgressContext'
import { LessonPlayer } from '../player/LessonPlayer'

export default function LessonRoute() {
  const { lessonId } = useParams()
  const { progressByLesson, loading } = useProgress()

  if (loading) {
    return <div className="grid min-h-dvh place-items-center text-slate-400">Loading…</div>
  }

  const lesson = lessonId ? getLesson(lessonId) : undefined
  if (!lesson) return <Navigate to="/" replace />

  // Guard the unlock rule at the route level too (not just in the UI).
  if (!isUnlocked(lesson, lessons, progressByLesson)) {
    return <Navigate to="/" replace />
  }

  return <LessonPlayer lesson={lesson} />
}
