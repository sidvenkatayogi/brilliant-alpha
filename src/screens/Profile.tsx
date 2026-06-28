import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { lessons } from '../content/loadLessons'
import { useAuth } from '../auth/AuthContext'
import { useProgress } from '../progress/ProgressContext'
import { updateEmailPrefs } from '../progress/firestore'

export default function Profile() {
  const navigate = useNavigate()
  const { user, logOut } = useAuth()
  const { userDoc, progressByLesson } = useProgress()

  const [emailToggleLoading, setEmailToggleLoading] = useState(false)
  const [emailToggleError, setEmailToggleError] = useState<string | null>(null)

  const dailyQuiz = userDoc?.emailPrefs?.dailyQuiz ?? false

  async function handleEmailToggle() {
    const newValue = !dailyQuiz
    setEmailToggleLoading(true)
    setEmailToggleError(null)
    try {
      await updateEmailPrefs(user!.uid, { dailyQuiz: newValue })
    } catch {
      setEmailToggleError('Failed to save preference. Please try again.')
    } finally {
      setEmailToggleLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <button
        onClick={() => navigate('/')}
        className="text-sm font-medium text-slate-500 hover:text-ink"
        type="button"
      >
        ← Back
      </button>

      <div className="card mt-4">
        <p className="text-xl font-bold text-ink">
          {userDoc?.displayName ?? user?.displayName ?? 'Learner'}
        </p>
        <p className="text-sm text-slate-500">{user?.email}</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Streak" value={userDoc?.currentStreak ?? 0} unit="day" />
        <Stat label="Best" value={userDoc?.longestStreak ?? 0} unit="day" />
        <Stat label="Done" value={userDoc?.totalLessonsCompleted ?? 0} unit="lesson" />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-400">
        History
      </h2>
      <ul className="mt-2 space-y-2">
        {lessons.map((lesson) => {
          const p = progressByLesson[lesson.id]
          return (
            <li key={lesson.id} className="card flex items-center justify-between">
              <span className="font-medium text-ink">{lesson.title}</span>
              <span className="text-sm text-slate-500">
                {p?.status === 'completed'
                  ? `${Math.round(p.masteryScore * 100)}%`
                  : p?.status === 'in_progress'
                    ? 'In progress'
                    : '—'}
              </span>
            </li>
          )
        })}
      </ul>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Email Quiz
      </h2>
      <div className="card mt-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-ink">
              Send me a daily probability quiz by email
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Personalized to your progress. Unsubscribe anytime from the email.
            </p>
            {emailToggleError && (
              <p className="mt-1 text-sm text-red-500" role="alert">
                {emailToggleError}
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dailyQuiz}
            aria-label="Send me a daily probability quiz by email"
            onClick={handleEmailToggle}
            disabled={emailToggleLoading}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 ${
              dailyQuiz ? 'bg-indigo-600' : 'bg-slate-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                dailyQuiz ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
            <span className="sr-only">Send me a daily probability quiz by email</span>
          </button>
        </div>
      </div>

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

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="card text-center">
      <p className="text-2xl font-extrabold text-ink">
        {value}
        <span className="ml-1 text-sm font-semibold text-slate-400">
          {value === 1 ? unit : `${unit}s`}
        </span>
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}
