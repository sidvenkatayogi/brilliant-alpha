import { useState } from 'react'
import type { QuestionStep as QuestionStepType } from '../../content/types'
import { checkAnswer, type Response } from '../../engine/checkAnswer'
import { selectFeedback } from '../../engine/selectFeedback'
import { FeedbackPanel } from '../FeedbackPanel'
import { MarkdownText } from '../MarkdownText'

interface Props {
  step: QuestionStepType
  /** Reports every submission so progress/mastery can track first-try correctness. */
  onAnswered: (stepId: string, correct: boolean, attempts: number) => void
  onAdvance: () => void
}

export function QuestionStep({ step, onAnswered, onAdvance }: Props) {
  const [choice, setChoice] = useState<string | null>(null)
  const [numeric, setNumeric] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [result, setResult] = useState<{ correct: boolean; message: string } | null>(null)
  const [showHint, setShowHint] = useState(false)

  const hasAnswer =
    step.format === 'multiple_choice' ? choice !== null : numeric.trim() !== ''
  const solved = result?.correct ?? false

  const submit = () => {
    const response: Response =
      step.format === 'multiple_choice'
        ? { optionId: choice as string }
        : { value: Number(numeric) }

    // Pure, synchronous, local — renders feedback well under 100ms.
    const check = checkAnswer(step.format, step.answer, response)
    const message = selectFeedback(step.feedback, check)
    const nextAttempts = attempts + 1

    setAttempts(nextAttempts)
    setResult({ correct: check.correct, message })
    onAnswered(step.id, check.correct, nextAttempts)
  }

  return (
    <div className="space-y-5">
      <MarkdownText
        text={step.prompt}
        className="text-[15px] font-semibold leading-relaxed text-ink"
      />

      {step.format === 'multiple_choice' ? (
        <div className="space-y-2">
          {step.options?.map((opt) => {
            const chosen = choice === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                disabled={solved}
                onClick={() => {
                  setChoice(opt.id)
                  setResult(null)
                }}
                className={`block w-full rounded-xl px-4 py-3 text-left text-[15px] ring-1 transition ${
                  chosen
                    ? 'bg-accent/10 ring-accent font-semibold text-ink'
                    : 'bg-white ring-slate-200 hover:bg-slate-50'
                } ${solved && !chosen ? 'opacity-50' : ''}`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      ) : (
        <input
          type="number"
          inputMode="decimal"
          disabled={solved}
          value={numeric}
          onChange={(e) => {
            setNumeric(e.target.value)
            setResult(null)
          }}
          className="w-full rounded-xl px-4 py-3 text-[15px] ring-1 ring-slate-200 focus:outline-none focus:ring-accent"
          placeholder="Your answer"
        />
      )}

      {result && <FeedbackPanel correct={result.correct} message={result.message} />}

      {/* Hint becomes available after a wrong attempt. */}
      {step.hint && !solved && attempts > 0 && (
        showHint ? (
          <p className="text-sm italic text-slate-500">💡 {step.hint}</p>
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-accent underline"
            onClick={() => setShowHint(true)}
          >
            Show a hint
          </button>
        )
      )}

      {solved ? (
        <button className="btn-primary w-full" onClick={onAdvance} type="button">
          Continue
        </button>
      ) : (
        <button
          className="btn-primary w-full"
          disabled={!hasAnswer}
          onClick={submit}
          type="button"
        >
          {attempts > 0 ? 'Try again' : 'Check'}
        </button>
      )}
    </div>
  )
}
