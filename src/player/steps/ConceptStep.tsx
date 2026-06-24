import type { ConceptStep as ConceptStepType } from '../../content/types'
import { WidgetHost } from '../WidgetHost'
import { MarkdownText } from '../MarkdownText'

interface Props {
  step: ConceptStepType
  onAdvance: () => void
}

export function ConceptStep({ step, onAdvance }: Props) {
  return (
    <div className="space-y-5">
      {step.title && <h2 className="text-xl font-bold text-ink">{step.title}</h2>}
      <MarkdownText
        text={step.body}
        className="text-[15px] leading-relaxed text-slate-700"
      />
      {step.visual && (
        <WidgetHost spec={step.visual} interactive={step.visual.interactive ?? false} />
      )}
      <button className="btn-primary w-full" onClick={onAdvance} type="button">
        Continue
      </button>
    </div>
  )
}
