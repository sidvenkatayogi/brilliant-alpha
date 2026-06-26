import type { ComponentType } from 'react'
import type { WidgetType } from '../content/types'
import type { ScenarioPatch, ScenarioState } from '../player/scenario/ScenarioContext'
import { InsuranceDesk } from './InsuranceDesk'
import { RedundancyBay } from './RedundancyBay'
import { SpamInbox } from './SpamInbox'
import { ScreeningClinic } from './ScreeningClinic'
import { BayesFormula } from './BayesFormula'
import { CasinoFloor } from './CasinoFloor'

/** Props every widget receives from the renderer. */
export interface WidgetProps {
  /** Authored knobs from the lesson JSON (`widget.props`). */
  props?: Record<string, unknown>
  /** False renders a static illustration; true allows manipulation. */
  interactive?: boolean
  /**
   * Called as the learner manipulates the widget. The renderer watches this to
   * evaluate a step's `completion` condition (e.g. customers reaches 2000).
   */
  onParamChange?: (param: string, value: number) => void
  /**
   * The shared per-lesson world (PRD §3), if this lesson defines a `scenario`.
   * Widgets read seed values from here and publish their live state back so
   * concept/predict/question steps reflect the same world. Optional: undefined
   * for non-scenario lessons and standalone (test) renders.
   */
  scenario?: ScenarioState
  setScenario?: (patch: ScenarioPatch) => void
}

// The single source of truth mapping widget.type -> component. The renderer
// never special-cases a lesson; adding an interaction means one entry here.
const registry: Record<WidgetType, ComponentType<WidgetProps>> = {
  insuranceDesk: InsuranceDesk,
  redundancyBay: RedundancyBay,
  spamInbox: SpamInbox,
  screeningClinic: ScreeningClinic,
  bayesFormula: BayesFormula,
  casinoFloor: CasinoFloor,
}

export function getWidget(type: WidgetType): ComponentType<WidgetProps> | undefined {
  return registry[type]
}
