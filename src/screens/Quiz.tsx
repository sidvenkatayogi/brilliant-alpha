import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { lessons } from '../content/loadLessons'
import { generateMixedQuiz } from '../engine/quiz'
import type { QuizQuestion, QuizResult } from '../engine/quiz'
import { useProgress } from '../progress/ProgressContext'
import { fetchPracticeQuiz } from '../cohort/practiceQuiz'

export default function Quiz() {
  const { progressByLesson, loading, submitQuizAttempt } = useProgress()

  // Build completed QuizLessonMeta from progress + lesson content
  // Filter progressByLesson for status === 'completed', then join with lessons array
  const completedMeta = lessons
    .filter((l) => progressByLesson[l.id]?.status === 'completed')
    .map((l) => ({ id: l.id, title: l.title, conceptSummary: l.conceptSummary, realWorldHook: l.realWorldHook }))

  // Stable key derived from which lessons are completed (sorted for determinism).
  // Changes only when the set of completed lessons actually changes, so it is safe
  // to use as an effect dependency in place of the full completedMeta array object.
  const completedKey = completedMeta.map((m) => m.id).join(',')

  // Derive lesson id lists for the API call
  const completedLessonIds = completedMeta.map((m) => m.id)
  const weakLessonIds = completedMeta
    .filter((m) => (progressByLesson[m.id]?.masteryScore ?? 0) < 0.6)
    .map((m) => m.id)

  // Quiz state
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [picks, setPicks] = useState<(number | null)[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [showWarning, setShowWarning] = useState(false)
  const [quizLoading, setQuizLoading] = useState(false)

  // Generate a fresh quiz when completedMeta is available (and on "Generate new quiz").
  // Async: tries fetchPracticeQuiz first; falls back to local generateMixedQuiz on any error.
  async function generateQuiz() {
    setQuizLoading(true)
    setPicks([])
    setSubmitted(false)
    setResult(null)
    setShowWarning(false)
    try {
      const qs = await fetchPracticeQuiz(completedLessonIds, weakLessonIds)
      setQuestions(qs)
      setPicks(new Array(qs.length).fill(null))
    } catch {
      const qs = generateMixedQuiz(completedMeta, 5)
      setQuestions(qs)
      setPicks(new Array(qs.length).fill(null))
    } finally {
      setQuizLoading(false)
    }
  }

  // Auto-generate once loading is done AND there are completed lessons AND no quiz yet.
  // Depends on both `loading` and `completedKey` so it fires correctly if progress
  // arrives after loading flips (auth/progress load race).
  // `generateQuiz` is intentionally omitted from deps: it is a render-scope function
  // that reads `completedMeta` from the same render as `completedKey`, so it is always
  // consistent when the effect fires. Calling an async fn from useEffect is fine —
  // we do not await it in the effect body.
  useEffect(() => {
    if (!loading && completedKey.length > 0 && questions.length === 0) {
      void generateQuiz()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, completedKey])

  if (loading) {
    return <Shell><div className="grid min-h-[40vh] place-items-center text-slate-400">Loading…</div></Shell>
  }

  // Empty state: no completed lessons
  if (completedMeta.length === 0) {
    return (
      <Shell>
        <div data-testid="quiz-empty" className="card mt-8 text-center">
          <p className="text-2xl">📚</p>
          <h2 className="mt-2 text-lg font-bold text-ink">Complete a lesson first</h2>
          <p className="mt-1 text-sm text-slate-500">
            Finish at least one lesson to unlock your practice quiz.
          </p>
          <Link to="/" className="btn-primary mt-4 inline-block">Go to lessons</Link>
        </div>
      </Shell>
    )
  }

  function handlePick(qi: number, oi: number) {
    if (submitted) return
    setPicks((prev) => {
      const next = [...prev]
      next[qi] = oi
      return next
    })
    setShowWarning(false)
  }

  function handleSubmit() {
    // AC20: block if any question unanswered
    if (picks.some((p) => p === null)) {
      setShowWarning(true)
      return
    }
    const r = submitQuizAttempt(questions, picks as number[])
    setResult(r)
    setSubmitted(true)
    setShowWarning(false)
  }

  return (
    <Shell>
      <header className="mt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Practice Quiz</h1>
        <p className="text-sm text-slate-500">
          {submitted && result
            ? `Score: ${result.score} / ${result.total}`
            : quizLoading
              ? 'Generating your quiz…'
              : `${questions.length} question${questions.length !== 1 ? 's' : ''}`}
        </p>
      </header>

      {quizLoading ? (
        <div data-testid="quiz-loading" className="mt-10 grid min-h-[20vh] place-items-center text-slate-400">
          Generating your quiz…
        </div>
      ) : (
        <div data-testid="quiz" className="mt-6 space-y-6">
          {questions.map((q, qi) => {
            const pick = picks[qi] ?? null
            const isSubmitted = submitted && result !== null
            const correctIdx = q.correctIndex
            return (
              <div key={qi} data-testid={`quiz-q-${qi}`} className="card">
                <p className="text-sm font-semibold text-ink">
                  {qi + 1}. {q.prompt}
                </p>
                <div className="mt-3 space-y-2">
                  {q.options.map((opt, oi) => {
                    const selected = pick === oi
                    const isCorrect = isSubmitted && correctIdx === oi
                    const wrongPick = isSubmitted && selected && !isCorrect
                    const cls = isCorrect
                      ? 'ring-good bg-good/10 text-ink'
                      : wrongPick
                        ? 'ring-bad bg-bad/10 text-ink'
                        : selected
                          ? 'ring-accent bg-accent/5 text-ink'
                          : 'ring-slate-200 text-slate-600 hover:ring-slate-300'
                    return (
                      <button
                        type="button"
                        key={oi}
                        data-testid={`quiz-opt-${qi}-${oi}`}
                        onClick={() => handlePick(qi, oi)}
                        disabled={submitted}
                        className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm ring-1 transition ${cls}`}
                      >
                        <span className="font-semibold">{String.fromCharCode(65 + oi)}.</span>
                        <span className="flex-1">{opt}</span>
                        {isCorrect && <span className="font-bold text-good">✓</span>}
                        {wrongPick && <span className="font-bold text-bad">✕</span>}
                      </button>
                    )
                  })}
                </div>
                {isSubmitted && (
                  <p className="mt-2 text-xs text-slate-500">{q.explanation}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Submit / score / new quiz controls */}
      <div className="mt-6 space-y-3">
        {showWarning && (
          <p data-testid="quiz-warning" className="text-sm text-bad">
            Please answer all questions before submitting.
          </p>
        )}

        {!submitted ? (
          <button
            type="button"
            data-testid="quiz-submit"
            onClick={handleSubmit}
            disabled={quizLoading}
            className="btn-primary w-full"
          >
            Submit
          </button>
        ) : (
          <>
            <p data-testid="quiz-score" className="text-center text-lg font-bold text-ink">
              {result?.score} / {result?.total} correct
            </p>
            <button
              type="button"
              data-testid="quiz-new"
              onClick={() => void generateQuiz()}
              disabled={quizLoading}
              className="btn-primary w-full"
            >
              Generate new quiz
            </button>
          </>
        )}
      </div>

    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <nav className="flex items-center justify-between text-sm">
        <Link to="/" className="font-medium text-slate-500 hover:text-ink">
          ← Course
        </Link>
        <Link to="/profile" className="font-medium text-slate-500 hover:text-ink">
          Profile
        </Link>
      </nav>
      {children}
    </div>
  )
}
