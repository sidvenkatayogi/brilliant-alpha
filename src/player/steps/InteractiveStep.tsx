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
    <div className="space-y-5">
      <MarkdownText
        text={step.prompt}
        className="text-[15px] font-semibold leading-relaxed text-ink"
      />
      <WidgetHost spec={step.widget} interactive onParamChange={handleParamChange} />
      <button
        className="btn-primary w-full"
        disabled={!satisfied}
        onClick={onAdvance}
        type="button"
      >
        {satisfied ? 'Continue' : `Keep going…`}
      </button>
    </div>
  )
}
