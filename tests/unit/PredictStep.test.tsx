import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PredictStep } from '../../src/player/steps/PredictStep'
import type { PredictStep as PredictStepType } from '../../src/content/types'

const step: PredictStepType = {
  id: 'p1',
  type: 'predict',
  prompt: 'What is P(A or B)?',
  format: 'multiple_choice',
  options: [
    { id: 'a', label: '125% — add them' },
    { id: 'b', label: '100%' },
  ],
  revealMessage: 'Generic reveal.',
  revealByOption: {
    a: 'That is the trap.',
    b: 'Right — and here is the twist.',
  },
}

describe('PredictStep per-option reveal', () => {
  it('shows the correct-guess reveal, not the trap copy, when the right option is chosen', async () => {
    const user = userEvent.setup()
    render(<PredictStep step={step} onAdvance={vi.fn()} />)
    await user.click(screen.getByText('100%'))
    await user.click(screen.getByRole('button', { name: 'Lock in my guess' }))
    expect(screen.getByText('Right — and here is the twist.')).toBeInTheDocument()
    expect(screen.queryByText('That is the trap.')).toBeNull()
    expect(screen.queryByText('Generic reveal.')).toBeNull()
  })

  it('shows the trap reveal when the trap option is chosen', async () => {
    const user = userEvent.setup()
    render(<PredictStep step={step} onAdvance={vi.fn()} />)
    await user.click(screen.getByText('125% — add them'))
    await user.click(screen.getByRole('button', { name: 'Lock in my guess' }))
    expect(screen.getByText('That is the trap.')).toBeInTheDocument()
  })

  it('falls back to revealMessage when an option has no override', async () => {
    const user = userEvent.setup()
    const noOverride: PredictStepType = { ...step, revealByOption: { a: 'Only A.' } }
    render(<PredictStep step={noOverride} onAdvance={vi.fn()} />)
    await user.click(screen.getByText('100%'))
    await user.click(screen.getByRole('button', { name: 'Lock in my guess' }))
    expect(screen.getByText('Generic reveal.')).toBeInTheDocument()
  })
})
