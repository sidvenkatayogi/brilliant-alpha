import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionStep } from '../../src/player/steps/QuestionStep'
import { StepRenderer } from '../../src/player/StepRenderer'
import type { QuestionStep as QuestionStepType } from '../../src/content/types'

const step: QuestionStepType = {
  id: 'q1',
  type: 'question',
  prompt: 'Why do the bars settle?',
  format: 'multiple_choice',
  options: [
    { id: 'a', label: 'The die changes' },
    { id: 'b', label: 'Small samples are noisy' },
  ],
  answer: { correctOptionId: 'b' },
  feedback: {
    correct: 'Right — lumpy up close, smooth far away.',
    incorrect: 'Look at the spread.',
    byOption: { a: "The die is fair throughout." },
  },
  hint: 'Compare the wobble.',
}

describe('QuestionStep flow', () => {
  it('shows per-option feedback on a wrong answer, then recovers on the right one', async () => {
    const user = userEvent.setup()
    const onAnswered = vi.fn()
    const onAdvance = vi.fn()
    render(<QuestionStep step={step} onAnswered={onAnswered} onAdvance={onAdvance} />)

    // Wrong answer → byOption message, attempts = 1, Continue not shown yet.
    await user.click(screen.getByText('The die changes'))
    await user.click(screen.getByRole('button', { name: 'Check' }))
    expect(screen.getByTestId('feedback')).toHaveTextContent('The die is fair throughout.')
    expect(screen.getByTestId('feedback')).toHaveAttribute('data-correct', 'false')
    expect(onAnswered).toHaveBeenLastCalledWith('q1', false, 1)
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()

    // Correct answer → correct message, attempts = 2, Continue appears.
    await user.click(screen.getByText('Small samples are noisy'))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
    expect(onAnswered).toHaveBeenLastCalledWith('q1', true, 2)

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onAdvance).toHaveBeenCalledOnce()
  })
})

describe('StepRenderer dispatch', () => {
  it('routes a question step to the question component', () => {
    render(<StepRenderer step={step} onAnswered={vi.fn()} onAdvance={vi.fn()} />)
    expect(screen.getByText('Why do the bars settle?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument()
  })

  it('routes a concept step to the concept component', () => {
    render(
      <StepRenderer
        step={{ id: 'c', type: 'concept', body: 'Hello concept' }}
        onAnswered={vi.fn()}
        onAdvance={vi.fn()}
      />,
    )
    expect(screen.getByText('Hello concept')).toBeInTheDocument()
  })
})
