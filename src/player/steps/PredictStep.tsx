import { useState } from 'react'
import type { PredictStep as PredictStepType } from '../../content/types'
import { MarkdownText } from '../MarkdownText'

interface Props {
  step: PredictStepType
  onAdvance: () => void
}

// Captures a guess BEFORE the reveal — there's no wrong answer here. Locking in
// a prediction is what lets the next step surprise the learner.
export function PredictStep({ step, onAdvance }: Props) {
  const [choice, setChoice] = useState<string | null>(null)
  const [numeric, setNumeric] = useState('')
  const [locked, setLocked] = useState(false)

  const hasGuess =
    step.format === 'multiple_choice' ? choice !== null : numeric.trim() !== ''

  // A per-option reveal (if authored for the chosen option) takes precedence, so
  // a learner who guesses the right answer isn't shown the "you were wrong" copy.
  const reveal = (choice && step.revealByOption?.[choice]) || step.revealMessage

  return (
    <div className="space-y-5">
      <MarkdownText
        text={step.prompt}
        className="text-[15px] font-semibold leading-relaxed text-ink"
      />

      {step.format === 'multiple_choice' ? (
        <div className="space-y-2">
          {step.options?.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={locked}
              onClick={() => setChoice(opt.id)}
              className={`block w-full rounded-xl px-4 py-3 text-left text-[15px] ring-1 transition ${
                choice === opt.id
                  ? 'bg-accent/10 ring-accent text-ink font-semibold'
                  : 'bg-white ring-slate-200 hover:bg-slate-50'
              } ${locked ? 'opacity-70' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <input
          type="number"
          inputMode="decimal"
          disabled={locked}
          value={numeric}
          onChange={(e) => setNumeric(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-[15px] ring-1 ring-slate-200 focus:outline-none focus:ring-accent"
          placeholder="Your best guess"
        />
      )}

      {!locked ? (
        <button
          className="btn-primary w-full"
          disabled={!hasGuess}
          onClick={() => setLocked(true)}
          type="button"
        >
          Lock in my guess
        </button>
      ) : (
        <div className="space-y-4">
          {reveal && (
            <div className="rounded-xl bg-accent/10 p-4 text-sm font-medium text-ink ring-1 ring-accent/30">
              <MarkdownText text={reveal} />
            </div>
          )}
          <button className="btn-primary w-full" onClick={onAdvance} type="button">
            Continue
          </button>
        </div>
      )}
    </div>
  )
}
