// Pure cohort-matching decision, extracted so it's unit-testable without the
// Firestore transaction wiring. Given the same-band candidate cohorts, pick the
// one to join (fewest members, to fill toward the soft target before opening a
// new seat) or return null to signal "create a fresh cohort" (PRD2 §6.1).

export interface CohortCandidate {
  id: string
  memberUids: string[]
  maxSize: number
}

export function chooseExistingCohort(candidates: CohortCandidate[]): string | null {
  let bestId: string | null = null
  let bestCount = Number.POSITIVE_INFINITY
  for (const c of candidates) {
    if (c.memberUids.length < c.maxSize && c.memberUids.length < bestCount) {
      bestId = c.id
      bestCount = c.memberUids.length
    }
  }
  return bestId
}
