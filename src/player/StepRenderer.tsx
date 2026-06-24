import type { Step } from '../content/types'
import { ConceptStep } from './steps/ConceptStep'
import { PredictStep } from './steps/PredictStep'
import { InteractiveStep } from './steps/InteractiveStep'
import { QuestionStep } from './steps/QuestionStep'

interface Props {
  step: Step
  onAnswered: (stepId: string, correct: boolean, attempts: number) => void
  onAdvance: () => void
}

// Maps step.type -> component. The single dispatch point; lessons are never
// special-cased anywhere else.
export function StepRenderer({ step, onAnswered, onAdvance }: Props) {
  switch (step.type) {
    case 'concept':
      return <ConceptStep step={step} onAdvance={onAdvance} />
    case 'predict':
      return <PredictStep step={step} onAdvance={onAdvance} />
    case 'interactive':
      return <InteractiveStep step={step} onAdvance={onAdvance} />
    case 'question':
      return <QuestionStep step={step} onAnswered={onAnswered} onAdvance={onAdvance} />
    default: {
      // Exhaustiveness guard — a new step type must be handled here.
      const _never: never = step
      return _never
    }
  }
}
