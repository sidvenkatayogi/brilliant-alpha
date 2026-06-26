import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { lessons } from '../content/loadLessons'
import { isUnlocked, needsReview, recommendNext } from '../engine/mastery'
import { useAuth } from '../auth/AuthContext'
import { useProgress } from '../progress/ProgressContext'
import { useCohort } from '../cohort/CohortContext'
import PeerAvatars from '../cohort/PeerAvatars'

type State = 'locked' | 'available' | 'in_progress' | 'completed'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logOut } = useAuth()
  const { userDoc, progressByLesson, getProgress, loading } = useProgress()
  const { members, loadIfAssigned, ensureCohort } = useCohort()

  const inGroup = Boolean(userDoc?.cohortId)
  const [showJoin, setShowJoin] = useState(false)
  const [joining, setJoining] = useState(false)

  const onGroupCta = () => {
    if (inGroup) navigate('/group')
    else setShowJoin(true)
  }

  const confirmJoin = async () => {
    setJoining(true)
    try {
      await ensureCohort()
      navigate('/group')
    } finally {
      setJoining(false)
      setShowJoin(false)
    }
  }

  // Show cohort presence on the course path. Loads only if already in a cohort —
  // brand-new learners get assigned the first time they open the Group tab.
  useEffect(() => {
    void loadIfAssigned()
  }, [loadIfAssigned])

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
        <nav className="flex items-center gap-4 text-sm font-medium text-slate-500">
          <Link to="/profile" className="hover:text-ink">
            Profile
          </Link>
          <button type="button" onClick={() => logOut()} className="hover:text-ink">
            Log out
          </button>
        </nav>
      </header>

      {/* Streak + group CTA */}
      <div className="card mt-5 flex items-stretch gap-4">
        <div className="flex-1">
          <p className="text-3xl font-extrabold text-ink">
            🔥 {userDoc?.currentStreak ?? 0}
          </p>
          <p className="text-sm text-slate-500">
            day streak{userDoc?.longestStreak ? ` · best ${userDoc.longestStreak}` : ''}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            {userDoc?.totalLessonsCompleted ?? 0}/{lessons.length} lessons done
          </p>
        </div>
        <button
          type="button"
          onClick={onGroupCta}
          data-testid="group-cta"
          className="flex flex-1 flex-col items-start justify-center gap-1 self-stretch rounded-xl bg-accent px-4 py-3 text-left text-white transition hover:bg-accent-soft active:scale-[0.99]"
        >
          <span className="text-lg">👥</span>
          <span className="font-bold leading-tight">
            {inGroup ? 'View your group' : 'Join a group'}
          </span>
          <span className="text-xs text-white/80">
            {inGroup ? 'Members, meeting & outline' : 'Learn alongside peers'}
          </span>
        </button>
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
                className={`card relative flex w-full items-center gap-4 pb-9 text-left transition ${
                  locked ? '' : 'hover:ring-accent/40'
                }`}
              >
                {/* Lesson content fades when locked; the peer avatars stay bright. */}
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    locked ? 'opacity-50 ' : ''
                  }${
                    state === 'completed'
                      ? 'bg-good text-white'
                      : locked
                        ? 'bg-slate-200 text-slate-400'
                        : 'bg-accent text-white'
                  }`}
                >
                  {state === 'completed' ? '✓' : locked ? '🔒' : i + 1}
                </span>
                <span className={`min-w-0 flex-1 ${locked ? 'opacity-50' : ''}`}>
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
                <span className={`text-xs font-medium text-slate-400 ${locked ? 'opacity-50' : ''}`}>
                  {lesson.estimatedMinutes} min
                </span>
                <PeerAvatars lessonId={lesson.id} members={members} />
              </button>
            </li>
          )
        })}
      </ol>

      {/* "Join a group" — explain cohorts, then confirm joining. */}
      {showJoin && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !joining && setShowJoin(false)}
        >
          <div
            className="card w-full max-w-md"
            data-testid="join-group-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-2xl">👥</p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">Learn with a group</h2>
            <p className="mt-1 text-sm text-slate-500">
              Groups turn the solo course into a little book club — a low-pressure way to keep momentum.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink">
              <li>• You’ll be matched into a small cohort of peers around your level.</li>
              <li>• Pick a weekly meeting time together with a quick availability poll.</li>
              <li>• Get an AI-made discussion outline to make the meeting easy.</li>
              <li>• See where your cohort-mates are in the course — presence, never rankings.</li>
            </ul>
            <p className="mt-4 text-xs text-slate-400">
              You’ll stay with the same group as you go. You can leave this page any time.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => setShowJoin(false)}
                disabled={joining}
              >
                Maybe later
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => void confirmJoin()}
                disabled={joining}
                data-testid="confirm-join"
              >
                {joining ? 'Joining…' : 'Join a group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
