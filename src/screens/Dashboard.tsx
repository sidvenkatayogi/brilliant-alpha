import { Link, useNavigate } from 'react-router-dom'
import { lessons } from '../content/loadLessons'
import { isUnlocked, needsReview, recommendNext } from '../engine/mastery'
import { useAuth } from '../auth/AuthContext'
import { useProgress } from '../progress/ProgressContext'

type State = 'locked' | 'available' | 'in_progress' | 'completed'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logOut } = useAuth()
  const { userDoc, progressByLesson, getProgress, loading } = useProgress()

  if (loading) {
    return <div className="grid min-h-dvh place-items-center text-slate-400">Loading…</div>
  }

  const next = recommendNext(lessons, progressByLesson)
  // "Continue" jumps to any in-progress lesson, else the recommended next one.
  const inProgress = lessons.find((l) => progressByLesson[l.id]?.status === 'in_progress')
  const continueTarget = inProgress ?? next

  const stateOf = (lessonId: string): State => {
    const lesson = lessons.find((l) => l.id === lessonId)!
    const p = progressByLesson[lessonId]
    if (p?.status === 'completed') return 'completed'
    if (!isUnlocked(lesson, lessons, progressByLesson)) return 'locked'
    if (p?.status === 'in_progress') return 'in_progress'
    return 'available'
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Hi, {userDoc?.displayName ?? user?.displayName ?? 'there'}
          </h1>
          <p className="text-sm text-slate-500">Probability &amp; Statistics</p>
        </div>
        <Link to="/profile" className="text-sm font-medium text-slate-500 hover:text-ink">
          Profile
        </Link>
      </header>

      {/* Streak banner */}
      <div className="card mt-5 flex items-center justify-between">
        <div>
          <p className="text-3xl font-extrabold text-ink">
            🔥 {userDoc?.currentStreak ?? 0}
          </p>
          <p className="text-sm text-slate-500">
            day streak{userDoc?.longestStreak ? ` · best ${userDoc.longestStreak}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold text-ink">
            {userDoc?.totalLessonsCompleted ?? 0}/{lessons.length}
          </p>
          <p className="text-sm text-slate-500">lessons done</p>
        </div>
      </div>

      {continueTarget && (
        <button
          className="btn-primary mt-4 w-full"
          onClick={() => navigate(`/lesson/${continueTarget.id}`)}
          type="button"
        >
          {inProgress ? 'Continue where you left off' : 'Start next lesson'}
        </button>
      )}

      {/* Vertical course path */}
      <ol className="mt-8 space-y-3">
        {lessons.map((lesson, i) => {
          const state = stateOf(lesson.id)
          const p = getProgress(lesson.id)
          const locked = state === 'locked'
          const review = needsReview(p)
          return (
            <li key={lesson.id}>
              <button
                type="button"
                disabled={locked}
                onClick={() => navigate(`/lesson/${lesson.id}`)}
                data-testid={`lesson-card-${lesson.id}`}
                data-state={state}
                className={`card flex w-full items-center gap-4 text-left transition ${
                  locked ? 'opacity-50' : 'hover:ring-accent/40'
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    state === 'completed'
                      ? 'bg-good text-white'
                      : locked
                        ? 'bg-slate-200 text-slate-400'
                        : 'bg-accent text-white'
                  }`}
                >
                  {state === 'completed' ? '✓' : locked ? '🔒' : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{lesson.title}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {lesson.subtitle}
                  </span>
                  {state === 'completed' && (
                    <span className="mt-0.5 block text-xs text-slate-400">
                      Mastery {Math.round(p.masteryScore * 100)}%
                      {review && <span className="text-accent"> · worth a revisit</span>}
                    </span>
                  )}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  {lesson.estimatedMinutes} min
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <button
        onClick={() => logOut()}
        className="mt-10 w-full text-center text-sm text-slate-400 hover:text-ink"
        type="button"
      >
        Log out
      </button>
    </div>
  )
}
