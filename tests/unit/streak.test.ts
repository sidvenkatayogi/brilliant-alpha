import { describe, it, expect } from 'vitest'
import { applyActivity, dayDiff, toLocalDateString } from '../../src/engine/streak'

describe('toLocalDateString / dayDiff', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(toLocalDateString(new Date(2026, 5, 22))).toBe('2026-06-22')
  })

  it('counts whole-day gaps, including across a month boundary', () => {
    expect(dayDiff('2026-06-22', '2026-06-23')).toBe(1)
    expect(dayDiff('2026-06-30', '2026-07-01')).toBe(1)
    expect(dayDiff('2026-06-22', '2026-06-25')).toBe(3)
    expect(dayDiff('2026-06-22', '2026-06-22')).toBe(0)
  })
})

describe('applyActivity', () => {
  const base = { currentStreak: 3, longestStreak: 5, lastActiveDate: '2026-06-22' }

  it('does nothing on the same day', () => {
    expect(applyActivity(base, '2026-06-22')).toEqual(base)
  })

  it('increments on the very next day and updates longest when surpassed', () => {
    const next = applyActivity({ ...base, longestStreak: 3 }, '2026-06-23')
    expect(next.currentStreak).toBe(4)
    expect(next.longestStreak).toBe(4)
    expect(next.lastActiveDate).toBe('2026-06-23')
  })

  it('does not lower longestStreak when current is still below it', () => {
    const next = applyActivity(base, '2026-06-23')
    expect(next.currentStreak).toBe(4)
    expect(next.longestStreak).toBe(5)
  })

  it('resets to 1 after a gap greater than one day', () => {
    const next = applyActivity(base, '2026-06-25')
    expect(next.currentStreak).toBe(1)
    expect(next.longestStreak).toBe(5)
    expect(next.lastActiveDate).toBe('2026-06-25')
  })

  it('starts a streak at 1 from no prior activity', () => {
    const fresh = applyActivity(
      { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
      '2026-06-22',
    )
    expect(fresh).toEqual({ currentStreak: 1, longestStreak: 1, lastActiveDate: '2026-06-22' })
  })
})
