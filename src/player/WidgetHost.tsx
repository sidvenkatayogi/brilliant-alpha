import type { WidgetSpec } from '../content/types'
import { getWidget } from '../widgets/registry'
import { useScenario } from './scenario/ScenarioContext'

interface WidgetHostProps {
  spec: WidgetSpec
  interactive?: boolean
  onParamChange?: (param: string, value: number) => void
}

/**
 * Resolves a widget spec to its component via the registry, threading the
 * shared scenario world (if the active lesson has one) into the widget. Never
 * special-cases a lesson.
 */
export function WidgetHost({ spec, interactive, onParamChange }: WidgetHostProps) {
  const Widget = getWidget(spec.type)
  const scenarioCtx = useScenario()
  if (!Widget) {
    return (
      <div className="rounded-xl bg-bad/10 p-4 text-sm text-bad">
        Unknown widget: {spec.type}
      </div>
    )
  }
  return (
    <Widget
      props={spec.props}
      interactive={interactive ?? spec.interactive ?? true}
      onParamChange={onParamChange}
      scenario={scenarioCtx?.scenario}
      setScenario={scenarioCtx?.setScenario}
    />
  )
}
