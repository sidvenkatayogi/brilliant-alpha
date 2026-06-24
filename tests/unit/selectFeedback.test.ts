import { describe, it, expect } from 'vitest'
import { selectFeedback } from '../../src/engine/selectFeedback'

const feedback = {
  correct: 'Nice.',
  incorrect: 'Not quite.',
  byOption: { a: 'A is a classic trap.' },
}

describe('selectFeedback', () => {
  it('returns the correct message when right', () => {
    expect(selectFeedback(feedback, { correct: true })).toBe('Nice.')
  })

  it('prefers a per-option override for a wrong answer', () => {
    expect(selectFeedback(feedback, { correct: false, optionId: 'a' })).toBe(
      'A is a classic trap.',
    )
  })

  it('falls back to the generic incorrect message when no override matches', () => {
    expect(selectFeedback(feedback, { correct: false, optionId: 'c' })).toBe('Not quite.')
  })

  it('falls back to incorrect when there is no option id at all (numeric)', () => {
    expect(selectFeedback(feedback, { correct: false })).toBe('Not quite.')
  })

  it('ignores byOption when the answer is correct', () => {
    expect(selectFeedback(feedback, { correct: true, optionId: 'a' })).toBe('Nice.')
  })
})
