// Overlap heatmap + best-slot suggestion, computed entirely client-side from the
// availability docs (PRD2 §6.3). No network in the interaction. Because slots are
// absolute UTC instants, two members in different timezones who mark the same
// real moment overlap correctly (guarded by a two-timezone unit test).

import type { Availability } from './types'

/** Per-slot count of how many members are free. Keyed by slot start (UTC ms). */
export function computeOverlap(
  availabilities: Availability[],
  slots: number[],
): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const slot of slots) counts[slot] = 0
  for (const a of availabilities) {
    for (const slot of a.slots) {
      // Only count slots that are part of the current candidate set.
      if (slot in counts) counts[slot] += 1
    }
  }
  return counts
}

/**
 * The suggested best slot: the slot with the maximum free count, ties broken by
 * earliest start. Returns null if no slot has anyone free.
 */
export function suggestBestSlot(
  availabilities: Availability[],
  slots: number[],
): number | null {
  const counts = computeOverlap(availabilities, slots)
  let best: number | null = null
  let bestCount = 0
  // Iterate slots in ascending order so earliest wins ties.
  for (const slot of [...slots].sort((a, b) => a - b)) {
    const c = counts[slot] ?? 0
    if (c > bestCount) {
      bestCount = c
      best = slot
    }
  }
  return bestCount > 0 ? best : null
}
