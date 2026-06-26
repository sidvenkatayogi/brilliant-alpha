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
        <div className="space-y-2">
          {(step.visual.interactive ?? false) === false && (
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
              Preview · you'll try this yourself in a moment
            </p>
          )}
          <div className={(step.visual.interactive ?? false) === false ? 'pointer-events-none opacity-95' : ''}>
            <WidgetHost spec={step.visual} interactive={step.visual.interactive ?? false} />
          </div>
        </div>
      )}
      <button className="btn-primary w-full" onClick={onAdvance} type="button">
        Continue
      </button>
    </div>
  )
}
