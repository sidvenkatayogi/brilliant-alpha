import { describe, it, expect } from 'vitest'
import { checkAnswer } from '../../src/engine/checkAnswer'

describe('checkAnswer — multiple choice', () => {
  const answer = { correctOptionId: 'b' }

  it('marks the correct option correct and echoes the id', () => {
    expect(checkAnswer('multiple_choice', answer, { optionId: 'b' })).toEqual({
      correct: true,
      optionId: 'b',
    })
  })

  it('marks a wrong option incorrect but still echoes the id', () => {
    expect(checkAnswer('multiple_choice', answer, { optionId: 'a' })).toEqual({
      correct: false,
      optionId: 'a',
    })
  })

  it('does not crash on a numeric response to an MC question', () => {
    expect(checkAnswer('multiple_choice', answer, { value: 1 }).correct).toBe(false)
  })
})

describe('checkAnswer — numeric with tolerance', () => {
  const answer = { value: 0.167, tolerance: 0.01 }

  it('accepts a value inside the tolerance band', () => {
    expect(checkAnswer('numeric', answer, { value: 0.17 }).correct).toBe(true)
  })

  it('accepts the exact boundary (inclusive)', () => {
    // Integer-exact band to avoid floating-point noise at the boundary.
    const band = { value: 100, tolerance: 5 }
    expect(checkAnswer('numeric', band, { value: 105 }).correct).toBe(true)
    expect(checkAnswer('numeric', band, { value: 95 }).correct).toBe(true)
    expect(checkAnswer('numeric', band, { value: 106 }).correct).toBe(false)
  })

  it('rejects a value just outside the band', () => {
    expect(checkAnswer('numeric', answer, { value: 0.18 }).correct).toBe(false)
  })

  it('rejects NaN / non-finite input', () => {
    expect(checkAnswer('numeric', answer, { value: NaN }).correct).toBe(false)
    expect(checkAnswer('numeric', answer, { value: Infinity }).correct).toBe(false)
  })

  it('handles negative targets', () => {
    expect(checkAnswer('numeric', { value: -0.05, tolerance: 0.01 }, { value: -0.05 }).correct).toBe(
      true,
    )
  })
})
