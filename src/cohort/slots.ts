// Candidate meeting slots. The sharpest edge in this build (PRD2 D10): slots are
// stored as ABSOLUTE UTC instants and rendered in each viewer's local timezone.
// A cohort spanning timezones must agree on the same real moment, not a naive
// "7pm" that means different things to different members.

import type { SlotConfig } from './types'
import { startOfIsoWeek } from './weekId'

export const DEFAULT_SLOT_CONFIG: Omit<SlotConfig, 'days'> = {
  tz: 'UTC',
  blockMinutes: 60,
  // Evening-weighted default range, local hours, kept tractable on mobile.
  startHour: 17,
  endHour: 22,
}

/** Build a SlotConfig for the coming week (7 days from this week's Monday). */
export function buildSlotConfig(weekStart: Date = startOfIsoWeek()): SlotConfig {
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return { ...DEFAULT_SLOT_CONFIG, days }
}

/**
 * Enumerate every candidate slot's UTC start (ms epoch) from a config.
 * The day/hour are interpreted in the VIEWER's local time, then converted to an
 * absolute instant — so the generated grid lines up with the labels the viewer
 * sees, while remaining a timezone-independent instant once stored.
 */
export function generateSlots(config: SlotConfig): number[] {
  const slots: number[] = []
  for (const day of config.days) {
    const [y, m, d] = day.split('-').map(Number)
    for (let hour = config.startHour; hour < config.endHour; hour += config.blockMinutes / 60) {
      // Local-time construction → absolute UTC instant.
      const local = new Date(y, m - 1, d, hour, 0, 0, 0)
      slots.push(local.getTime())
    }
  }
  return slots
}

/** Label a slot start (UTC ms) in the viewer's local timezone. */
export function labelSlot(slotStart: number): { day: string; time: string } {
  const d = new Date(slotStart)
  return {
    day: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}
