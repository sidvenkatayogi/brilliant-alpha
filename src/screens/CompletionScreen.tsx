import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getLesson, lessons } from '../content/loadLessons'
import { isMastered, recommendNext } from '../engine/mastery'
import { REVIEW_NUDGE_THRESHOLD } from '../engine/mastery'
import { useProgress } from '../progress/ProgressContext'
import type { Milestone } from '../progress/types'

const MILESTONE_LABEL: Record<Milestone, string> = {
  first_lesson: '🎉 First lesson complete!',
  streak_3: '🔥 3-day streak!',
  course_complete: '🏆 You finished the whole course!',
}

export default function CompletionScreen() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const { progressByLesson, getProgress, userDoc } = useProgress()

  const lesson = lessonId ? getLesson(lessonId) : undefined
  if (!lesson) return <Navigate to="/" replace />

  const progress = getProgress(lesson.id)
  const mastery = progress.masteryScore
  const next = recommendNext(lessons, progressByLesson)
  const lowMastery = mastery < REVIEW_NUDGE_THRESHOLD

  // Milestones just earned (best-effort: show any the user holds — celebratory).
  const justEarned = userDoc?.milestones ?? []

  return (
    <div className="mx-auto grid min-h-dvh max-w-sm place-items-center px-5">
      <div className="w-full space-y-6 text-center">
        <div>
          <p className="text-5xl">{isMastered(mastery) ? '🌟' : '✅'}</p>
          <h1 className="mt-3 text-2xl font-extrabold text-ink">Lesson complete</h1>
          <p className="text-sm text-slate-500">{lesson.title}</p>
        </div>

        <div className="card">
          <p className="text-4xl font-extrabold text-ink">{Math.round(mastery * 100)}%</p>
          <p className="text-sm text-slate-500">first-try mastery</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${isMastered(mastery) ? 'bg-good' : 'bg-accent'}`}
              style={{ width: `${Math.round(mastery * 100)}%` }}
            />
          </div>
        </div>

        <div className="card flex items-center justify-center gap-2">
          <span className="text-2xl">🔥</span>
          <span className="font-semibold text-ink">
            {userDoc?.currentStreak ?? 0}-day streak
          </span>
        </div>

        {justEarned.length > 0 && (
          <div className="space-y-1">
            {justEarned.map((m) => (
              <p key={m} className="text-sm font-semibold text-accent">
                {MILESTONE_LABEL[m]}
              </p>
            ))}
          </div>
        )}

        {lowMastery && (
          <p className="rounded-xl bg-accent/10 p-3 text-sm text-ink ring-1 ring-accent/30">
            That one was tricky — a quick revisit would lock it in.
          </p>
        )}

        <div className="space-y-2">
          {lowMastery && (
            <button
              className="btn-ghost w-full"
              onClick={() => navigate(`/lesson/${lesson.id}`)}
              type="button"
            >
              Revisit this lesson
            </button>
          )}
          {next ? (
            <button
              className="btn-primary w-full"
              onClick={() => navigate(`/lesson/${next.id}`)}
              type="button"
            >
              Next: {next.title}
            </button>
          ) : (
            <button className="btn-primary w-full" onClick={() => navigate('/')} type="button">
              Back to course
            </button>
          )}
          <button
            className="w-full text-sm text-slate-400 hover:text-ink"
            onClick={() => navigate('/')}
            type="button"
          >
            Back to course path
          </button>
        </div>
      </div>
    </div>
  )
}
