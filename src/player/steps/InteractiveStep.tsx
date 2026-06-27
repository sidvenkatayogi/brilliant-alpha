import { useCallback, useState } from 'react'
import type { InteractiveStep as InteractiveStepType } from '../../content/types'
import { WidgetHost } from '../WidgetHost'
import { MarkdownText } from '../MarkdownText'

interface Props {
  step: InteractiveStepType
  onAdvance: () => void
}

// The manipulable visual. If the step declares a `completion` condition (e.g.
// trials reaches 1000), Continue stays disabled until the widget reports the
// param crossing that threshold; otherwise it's free exploration.
export function InteractiveStep({ step, onAdvance }: Props) {
  const gate = step.completion
  const [satisfied, setSatisfied] = useState(!gate)

  const handleParamChange = useCallback(
    (param: string, value: number) => {
      if (gate && gate.type === 'reaches' && param === gate.param && value >= gate.value) {
        setSatisfied(true)
      }
    },
    [gate],
  )

  return (
    // Height-filling flex column so the widget expands to fill the viewport
    // budget (h-dvh − header) without page scroll during interaction.
    // prompt: shrink-0 with line-clamp guard on very small heights
    // widget: flex-1 min-h-0 — the widget fills remaining space
    // button: shrink-0 — always visible at the bottom
    <div className="flex h-full min-h-0 flex-col gap-3">
      <MarkdownText
        text={step.prompt}
        className="line-clamp-3 shrink-0 text-[15px] font-semibold leading-relaxed text-ink"
      />
      <div className="min-h-0 flex-1">
        <WidgetHost spec={step.widget} interactive onParamChange={handleParamChange} />
      </div>
      <button
        className="btn-primary w-full shrink-0"
        disabled={!satisfied}
        onClick={onAdvance}
        type="button"
      >
        {satisfied ? 'Continue' : `Keep going…`}
      </button>
    </div>
  )
}
