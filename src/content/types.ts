// The content model. A lesson is structured data — metadata + ordered typed
// steps — never hardcoded markup. The step renderer maps `type` -> component and
// the widget registry maps `widget.type` -> component, so adding a lesson is a
// JSON file (+ a widget only if it needs a brand-new interaction).

/** A manipulable visual embedded in a step. */
export interface WidgetSpec {
  type: WidgetType
  props?: Record<string, unknown>
  /** When false, the widget renders as a static illustration (used inside `concept`). */
  interactive?: boolean
}

export type WidgetType =
  | 'coinSampler'
  | 'probabilityArea'
  | 'conditionZoom'
  | 'bayesIconArray'
  | 'bayesFormula'
  | 'evBettingGame'

export type AnswerFormat = 'multiple_choice' | 'numeric'

export interface Option {
  id: string
  label: string
}

/** Multiple-choice → correctOptionId; numeric → value with tolerance. */
export type Answer =
  | { correctOptionId: string }
  | { value: number; tolerance: number }

export interface Feedback {
  correct: string
  incorrect: string
  /** Optional per-option override, keyed by option id (incorrect answers). */
  byOption?: Record<string, string>
}

/** A condition for marking an exploration step complete. */
export interface Completion {
  type: 'reaches'
  param: string
  value: number
}

interface StepBase {
  id: string
}

/** Explanation, optionally illustrated. Advances on "Continue". */
export interface ConceptStep extends StepBase {
  type: 'concept'
  title?: string
  body: string
  visual?: WidgetSpec
}

/** Capture a guess BEFORE the reveal. No wrong answer; powers the surprise. */
export interface PredictStep extends StepBase {
  type: 'predict'
  prompt: string
  format: AnswerFormat
  options?: Option[]
  /** Shown after locking in, regardless of the guess. */
  revealMessage?: string
  /** Optional per-option reveal (keyed by option id) so a savvy guess that
   *  lands on the right answer isn't told it's wrong. Falls back to revealMessage. */
  revealByOption?: Record<string, string>
}

/** The manipulable visual. May be free exploration or gated by `completion`. */
export interface InteractiveStep extends StepBase {
  type: 'interactive'
  prompt: string
  widget: WidgetSpec
  completion?: Completion
}

/** A checkpoint with answer-checking and authored feedback. */
export interface QuestionStep extends StepBase {
  type: 'question'
  prompt: string
  format: AnswerFormat
  options?: Option[]
  answer: Answer
  feedback: Feedback
  hint?: string
}

export type Step = ConceptStep | PredictStep | InteractiveStep | QuestionStep
export type StepType = Step['type']

export interface Lesson {
  id: string
  order: number
  title: string
  subtitle: string
  realWorldHook: string
  conceptSummary: string
  estimatedMinutes: number
  steps: Step[]
}

/** Steps that count toward mastery (have a checkable answer). */
export function isQuestionStep(step: Step): step is QuestionStep {
  return step.type === 'question'
}
