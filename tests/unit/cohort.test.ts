import { describe, it, expect } from 'vitest'
import { levelBand } from '../../src/cohort/levelBand'
import { computeOverlap, suggestBestSlot } from '../../src/cohort/overlap'
import {
  peerLessonState,
  collectivelyCompleted,
  collectivelyInProgress,
} from '../../src/cohort/peerProgress'
import { parseOutline, fallbackOutline } from '../../src/cohort/outline'
import { cohortName } from '../../src/cohort/cohortName'
import { currentWeekId } from '../../src/cohort/weekId'
import { allApproved } from '../../src/cohort/scheduling'
import type { Availability, MemberProgress } from '../../src/cohort/types'

describe('levelBand (PRD2 D2 cutoffs)', () => {
  it('maps lessons completed to coarse bands', () => {
    expect(levelBand(0)).toBe(0)
    expect(levelBand(1)).toBe(1)
    expect(levelBand(2)).toBe(1)
    expect(levelBand(3)).toBe(2)
    expect(levelBand(4)).toBe(2)
    expect(levelBand(5)).toBe(3)
  })

  it('clamps negatives and floors fractions', () => {
    expect(levelBand(-3)).toBe(0)
    expect(levelBand(2.9)).toBe(1)
  })
})

const avail = (uid: string, slots: number[]): Availability => ({
  uid,
  displayName: uid,
  slots,
  updatedAt: 0,
})

describe('overlap math', () => {
  const slots = [100, 200, 300, 400]

  it('counts free members per slot', () => {
    const counts = computeOverlap([avail('a', [100, 200]), avail('b', [200])], slots)
    expect(counts).toEqual({ 100: 1, 200: 2, 300: 0, 400: 0 })
  })

  it('ignores slots outside the candidate set', () => {
    const counts = computeOverlap([avail('a', [100, 999])], slots)
    expect(counts[100]).toBe(1)
    expect(counts).not.toHaveProperty('999')
  })

  it('suggests the max-count slot', () => {
    const best = suggestBestSlot([avail('a', [100, 300]), avail('b', [300])], slots)
    expect(best).toBe(300)
  })

  it('breaks ties by earliest start', () => {
    const best = suggestBestSlot([avail('a', [200, 400]), avail('b', [200, 400])], slots)
    expect(best).toBe(200)
  })

  it('returns null when nobody is free', () => {
    expect(suggestBestSlot([avail('a', [])], slots)).toBeNull()
    expect(suggestBestSlot([], slots)).toBeNull()
  })

  it('handles all-free', () => {
    const counts = computeOverlap([avail('a', slots), avail('b', slots)], slots)
    expect(Object.values(counts)).toEqual([2, 2, 2, 2])
    expect(suggestBestSlot([avail('a', slots), avail('b', slots)], slots)).toBe(100)
  })
})

describe('two-timezone overlap (guards D10 — absolute UTC instants)', () => {
  // Members in different timezones who mark the SAME real instant must overlap.
  // Because slots are absolute UTC ms, the same instant matches regardless of tz.
  const instant = Date.UTC(2026, 5, 24, 18, 0) // a specific moment in time
  const otherInstant = Date.UTC(2026, 5, 24, 19, 0)
  const slots = [instant, otherInstant]

  it('counts two members who picked the same real instant', () => {
    // Member A (e.g. New York) and Member B (e.g. London) both free at `instant`.
    const counts = computeOverlap([avail('ny', [instant]), avail('ldn', [instant])], slots)
    expect(counts[instant]).toBe(2)
    expect(suggestBestSlot([avail('ny', [instant]), avail('ldn', [instant])], slots)).toBe(instant)
  })

  it('does NOT merge different real instants', () => {
    const counts = computeOverlap([avail('ny', [instant]), avail('ldn', [otherInstant])], slots)
    expect(counts[instant]).toBe(1)
    expect(counts[otherInstant]).toBe(1)
  })
})

const member = (
  uid: string,
  displayName: string,
  started: string[],
  completed: string[],
): MemberProgress => ({
  uid,
  displayName,
  lessonsStarted: started,
  lessonsCompleted: completed,
  currentLessonId: started[started.length - 1] ?? null,
  updatedAt: 0,
})

describe('peer progress — presence, not ranking (PRD2 §6.2)', () => {
  it('shows "be the first" when nobody has started a lesson', () => {
    const state = peerLessonState('long-run', [member('a', 'Ada', [], [])])
    expect(state.kind).toBe('be-first')
  })

  it('shows unordered presence once someone has started', () => {
    const members = [
      member('z', 'Zoe', ['long-run'], []),
      member('a', 'Ada', ['long-run'], ['long-run']),
    ]
    const state = peerLessonState('long-run', members)
    expect(state.kind).toBe('present')
    if (state.kind === 'present') {
      // Alphabetical (NOT a progress ranking).
      expect(state.members.map((m) => m.displayName)).toEqual(['Ada', 'Zoe'])
      expect(state.members.find((m) => m.uid === 'a')?.completed).toBe(true)
      expect(state.members.find((m) => m.uid === 'z')?.completed).toBe(false)
    }
  })

  it('exposes no scores, attempts, or mastery in the presence shape', () => {
    const state = peerLessonState('long-run', [member('a', 'Ada', ['long-run'], [])])
    if (state.kind === 'present') {
      for (const m of state.members) {
        expect(Object.keys(m).sort()).toEqual(['completed', 'displayName', 'uid'])
      }
    }
  })

  it('computes collective completed/in-progress for the AI outline', () => {
    const members = [
      member('a', 'Ada', ['long-run', 'combining-events'], ['long-run']),
      member('b', 'Bo', ['long-run'], ['long-run']),
    ]
    expect(collectivelyCompleted(members).sort()).toEqual(['long-run'])
    expect(collectivelyInProgress(members)).toEqual(['combining-events'])
  })
})

describe('outline parsing (PRD2 §6.4)', () => {
  const valid = JSON.stringify({
    warmUp: 'hi',
    agenda: [{ title: 'a', minutes: 10, facilitatorNote: 'n' }],
    discussionQuestions: [{ lessonId: 'long-run', question: 'q?' }],
    peerTeachingActivity: 'teach',
    wrapUp: 'bye',
  })

  it('parses clean JSON', () => {
    expect(parseOutline(valid)?.warmUp).toBe('hi')
  })

  it('strips accidental code fences', () => {
    const fenced = '```json\n' + valid + '\n```'
    expect(parseOutline(fenced)?.wrapUp).toBe('bye')
  })

  it('narrows past leading/trailing prose', () => {
    expect(parseOutline('Here you go:\n' + valid + '\nHope that helps!')?.warmUp).toBe('hi')
  })

  it('returns null on malformed / wrong-shape output', () => {
    expect(parseOutline('not json at all')).toBeNull()
    expect(parseOutline('{"warmUp": "hi"}')).toBeNull()
  })

  it('falls back to a usable authored outline', () => {
    const fb = fallbackOutline([
      { id: 'long-run', title: 'Chance & the Long Run', conceptSummary: 'x', realWorldHook: 'y' },
    ])
    expect(fb.agenda.length).toBeGreaterThan(0)
    expect(fb.discussionQuestions[0].lessonId).toBe('long-run')
    expect(typeof fb.wrapUp).toBe('string')
  })

  it('produces a valid fallback even with no completed lessons', () => {
    const fb = fallbackOutline([])
    expect(fb.agenda.length).toBeGreaterThan(0)
    expect(fb.warmUp.length).toBeGreaterThan(0)
  })
})

describe('cohort name generator', () => {
  it('is deterministic for a given seed', () => {
    expect(cohortName('cohort_abc')).toBe(cohortName('cohort_abc'))
  })

  it('produces "The Adjective Noun" form', () => {
    expect(cohortName('seed-1')).toMatch(/^The \S+ \S+$/)
  })

  it('varies across seeds', () => {
    const names = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => cohortName(s)),
    )
    expect(names.size).toBeGreaterThan(1)
  })
})

describe('allApproved (a time locks only when everyone approves)', () => {
  it('is true only when every member has approved', () => {
    expect(allApproved(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true)
    expect(allApproved(['a', 'b', 'c'], ['a', 'b'])).toBe(false)
    expect(allApproved(['a', 'b', 'c'], ['a', 'b', 'c', 'd'])).toBe(true) // extras don't hurt
  })

  it('locks immediately for a solo cohort (proposer is the only member)', () => {
    expect(allApproved(['a'], ['a'])).toBe(true)
  })

  it('is false for an empty cohort (nothing to lock)', () => {
    expect(allApproved([], [])).toBe(false)
    expect(allApproved([], ['a'])).toBe(false)
  })
})

describe('currentWeekId', () => {
  it('formats an ISO week id', () => {
    expect(currentWeekId(new Date(2026, 5, 25))).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('is stable within the same ISO week and changes across weeks', () => {
    const mon = currentWeekId(new Date(2026, 5, 22)) // Mon Jun 22 2026
    const sun = currentWeekId(new Date(2026, 5, 28)) // Sun Jun 28 2026
    const nextMon = currentWeekId(new Date(2026, 5, 29)) // Mon Jun 29 2026
    expect(mon).toBe(sun)
    expect(mon).not.toBe(nextMon)
  })
})
