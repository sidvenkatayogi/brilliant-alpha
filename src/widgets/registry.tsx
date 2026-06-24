import type { ComponentType } from 'react'
import type { WidgetType } from '../content/types'
import { CoinSampler } from './CoinSampler'
import { ProbabilityArea } from './ProbabilityArea'
import { ConditionZoom } from './ConditionZoom'
import { BayesIconArray } from './BayesIconArray'
import { BayesFormula } from './BayesFormula'
import { EvBettingGame } from './EvBettingGame'

/** Props every widget receives from the renderer. */
export interface WidgetProps {
  /** Authored knobs from the lesson JSON (`widget.props`). */
  props?: Record<string, unknown>
  /** False renders a static illustration; true allows manipulation. */
  interactive?: boolean
  /**
   * Called as the learner manipulates the widget. The renderer watches this to
   * evaluate a step's `completion` condition (e.g. trials reaches 1000).
   */
  onParamChange?: (param: string, value: number) => void
}

// The single source of truth mapping widget.type -> component. The renderer
// never special-cases a lesson; adding an interaction means one entry here.
const registry: Record<WidgetType, ComponentType<WidgetProps>> = {
  coinSampler: CoinSampler,
  probabilityArea: ProbabilityArea,
  conditionZoom: ConditionZoom,
  bayesIconArray: BayesIconArray,
  bayesFormula: BayesFormula,
  evBettingGame: EvBettingGame,
}

export function getWidget(type: WidgetType): ComponentType<WidgetProps> | undefined {
  return registry[type]
}
