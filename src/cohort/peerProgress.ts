// Peer progress is PRESENCE, not ranking (PRD2 §6.2). The persona quits if she
// feels "behind", so there is no ordering by progress, no positions, no counts
// like "3rd of 6". Per lesson: "be the first" when nobody has started, otherwise
// an UNORDERED set of who's present (started/completed). This file never sorts by
// progress and never exposes scores/attempts/mastery (the projection lacks them).

import type { MemberProgress } from './types'

export interface PeerPresence {
  uid: string
  displayName: string
  completed: boolean
}

export type PeerLessonState =
  | { kind: 'be-first' }
  | { kind: 'present'; members: PeerPresence[] }

/**
 * State for one lesson across the cohort's projections.
 * - No member has started → "be-first".
 * - At least one has started → unordered presence list (alphabetical by name,
 *   which is explicitly NOT a progress ranking).
 */
export function peerLessonState(
  lessonId: string,
  projections: MemberProgress[],
): PeerLessonState {
  const members: PeerPresence[] = []
  for (const p of projections) {
    const started = p.lessonsStarted.includes(lessonId)
    const completed = p.lessonsCompleted.includes(lessonId)
    if (started || completed) {
      members.push({ uid: p.uid, displayName: p.displayName, completed })
    }
  }
  if (members.length === 0) return { kind: 'be-first' }
  // Alphabetical = stable + presence-only. Never order by progress.
  members.sort((a, b) => a.displayName.localeCompare(b.displayName))
  return { kind: 'present', members }
}

/** Lessons the cohort has COLLECTIVELY completed (union). Used by the AI outline. */
export function collectivelyCompleted(projections: MemberProgress[]): string[] {
  const set = new Set<string>()
  for (const p of projections) for (const id of p.lessonsCompleted) set.add(id)
  return [...set]
}

/** Lessons in progress somewhere in the cohort but not yet completed by anyone. */
export function collectivelyInProgress(projections: MemberProgress[]): string[] {
  const completed = new Set(collectivelyCompleted(projections))
  const set = new Set<string>()
  for (const p of projections) {
    for (const id of p.lessonsStarted) if (!completed.has(id)) set.add(id)
  }
  return [...set]
}
