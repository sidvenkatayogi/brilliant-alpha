// Streak logic, pure and date-injected so it's trivially testable with fixed
// dates. All comparisons use local-time YYYY-MM-DD strings.

export interface StreakState {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
}

/** Local-time YYYY-MM-DD for a given Date. */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Whole-day difference between two YYYY-MM-DD strings (b - a), local noon to dodge DST. */
export function dayDiff(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`)
  const db = new Date(`${b}T12:00:00`)
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

/**
 * Advance a streak on activity for `today`:
 *  - same day  → no change
 *  - exactly +1 day → currentStreak++ (update longest)
 *  - gap > 1 day, or no prior activity → reset currentStreak to 1
 * Always sets lastActiveDate to today.
 */
export function applyActivity(state: StreakState, today: string): StreakState {
  const { lastActiveDate } = state

  if (lastActiveDate === today) {
    return state
  }

  let currentStreak: number
  if (lastActiveDate == null) {
    currentStreak = 1
  } else {
    const diff = dayDiff(lastActiveDate, today)
    currentStreak = diff === 1 ? state.currentStreak + 1 : 1
  }

  return {
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    lastActiveDate: today,
  }
}
