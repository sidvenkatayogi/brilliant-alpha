import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Lesson } from '../content/types'
import { useProgress } from '../progress/ProgressContext'
import { StepRenderer } from './StepRenderer'
import { ScenarioProvider } from './scenario/ScenarioContext'

interface Props {
  lesson: Lesson
}

export function LessonPlayer({ lesson }: Props) {
  const navigate = useNavigate()
  const { getProgress, setCurrentStep, recordStepResult, restartLesson, completeLesson } =
    useProgress()

  const saved = getProgress(lesson.id)
  const lastIndex = lesson.steps.length - 1
  const resumeIndex = Math.min(saved.currentStepIndex, lastIndex)

  // A finished lesson opens on a choice screen (start over vs. pick up at the
  // end) instead of dropping the learner on the final step. In-progress and
  // fresh lessons go straight into the player and resume where they left off.
  const [phase, setPhase] = useState<'intro' | 'playing'>(() =>
    saved.status === 'completed' ? 'intro' : 'playing',
  )
  const [index, setIndex] = useState(resumeIndex)
  const [finishing, setFinishing] = useState(false)
  // Bumped on restart so the ScenarioProvider remounts and re-seeds its world
  // from `scenario.initialState` (the world is ephemeral — never persisted).
  const [runId, setRunId] = useState(0)

  const step = lesson.steps[index]
  const progressPct = useMemo(
    () => Math.round((index / lesson.steps.length) * 100),
    [index, lesson.steps.length],
  )

  // Persist position whenever it changes — powers resume-mid-lesson across
  // devices. Skipped during the intro screen so we don't clobber saved state.
  useEffect(() => {
    if (phase !== 'playing') return
    setCurrentStep(lesson.id, index)
  }, [lesson.id, index, phase, setCurrentStep])

  const goBack = () => {
    setIndex((i) => Math.max(0, i - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const advance = async () => {
    if (index < lastIndex) {
      setIndex((i) => i + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    // Last step → complete the lesson and route to the completion screen.
    setFinishing(true)
    await completeLesson(lesson)
    navigate(`/lesson/${lesson.id}/complete`)
  }

  const handleAnswered = (stepId: string, correct: boolean, attempts: number) => {
    recordStepResult(lesson.id, stepId, correct, attempts)
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto grid min-h-dvh max-w-sm place-items-center px-5">
        <div className="w-full space-y-6 text-center">
          <div>
            <p className="text-5xl">🔁</p>
            <h1 className="mt-3 text-2xl font-extrabold text-ink">You've finished this lesson</h1>
            <p className="text-sm text-slate-500">{lesson.title}</p>
          </div>
          <div className="space-y-2">
            <button
              className="btn-primary w-full"
              type="button"
              onClick={() => {
                restartLesson(lesson.id) // fresh first-try scoring for the redo
                setIndex(0)
                setRunId((r) => r + 1) // re-seed the scenario world for the redo
                setPhase('playing')
              }}
            >
              Start from the beginning
            </button>
            <button
              className="btn-ghost w-full"
              type="button"
              onClick={() => {
                setIndex(lastIndex)
                setPhase('playing')
              }}
            >
              Skip to the recap
            </button>
            <button
              className="w-full text-sm text-slate-400 hover:text-ink"
              type="button"
              onClick={() => navigate('/')}
            >
              Back to course
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-4">
      <header className="sticky top-0 z-10 -mx-4 bg-slate-50/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="shrink-0 px-1 text-sm font-medium text-slate-500 hover:text-ink"
            aria-label="Leave lesson"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={goBack}
            disabled={index === 0}
            className="shrink-0 px-1 text-sm font-medium text-slate-500 hover:text-ink disabled:opacity-30"
            aria-label="Previous step"
            data-testid="step-back"
          >
            ← Back
          </button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progressPct}%` }}
              data-testid="lesson-progress"
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-slate-400">
            {index + 1}/{lesson.steps.length}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col pt-6">
        <p className="mb-1 shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
          {lesson.title}
        </p>
        <ScenarioProvider key={`${lesson.id}-${runId}`} initialState={lesson.scenario?.initialState}>
          <div key={step.id} className="flex min-h-0 flex-1 flex-col animate-[fadeIn_0.2s_ease]">
            <StepRenderer step={step} onAnswered={handleAnswered} onAdvance={advance} />
          </div>
        </ScenarioProvider>
        {finishing && (
          <p className="mt-4 shrink-0 text-center text-sm text-slate-400">Wrapping up…</p>
        )}
      </main>
    </div>
  )
}
