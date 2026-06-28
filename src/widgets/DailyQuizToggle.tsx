import { useState } from 'react'
import { motion } from 'framer-motion'
import { useProgress } from '../progress/ProgressContext'

/**
 * Floating opt-in for the daily personalized email quiz. Pinned to the bottom-right
 * of the home page. The switch flips instantly (the preference is updated
 * optimistically in ProgressContext) and reverts with an inline error if the save
 * fails.
 */
export default function DailyQuizToggle() {
  const { userDoc, setDailyQuizEnabled } = useProgress()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dailyQuiz = userDoc?.emailPrefs?.dailyQuiz ?? false

  async function handleToggle() {
    const next = !dailyQuiz
    setError(null)
    setSaving(true)
    try {
      await setDailyQuizEnabled(next)
    } catch {
      setError('Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 24 }}
      className="fixed bottom-5 right-5 z-40 max-w-[calc(100vw-2.5rem)]"
    >
      <div className="flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-lg ring-1 ring-black/5 backdrop-blur">
        <span className="text-lg" aria-hidden="true">
          ✉️
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-ink">Daily quiz email</p>
          {error ? (
            <p className="text-xs text-red-500" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-xs leading-tight text-slate-500">
              {dailyQuiz ? 'On · personalized to you' : 'A personalized quiz each day'}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={dailyQuiz}
          aria-label="Send me a daily probability quiz by email"
          onClick={handleToggle}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-60 ${
            dailyQuiz ? 'bg-accent' : 'bg-slate-200'
          }`}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              dailyQuiz ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </motion.div>
  )
}
