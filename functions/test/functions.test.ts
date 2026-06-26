import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chooseExistingCohort } from '../src/cohortMatch'
import { buildUserPrompt } from '../src/anthropic'
import { levelBand } from '../src/shared/levelBand'
import { cohortName } from '../src/shared/cohortName'
import { parseOutline, fallbackOutline } from '../src/shared/outline'
import { LESSON_META_BY_ID } from '../src/lessonMeta'

describe('chooseExistingCohort (assignCohort matching logic)', () => {
  it('fills an under-capacity cohort', () => {
    expect(
      chooseExistingCohort([{ id: 'a', memberUids: ['x'], maxSize: 6 }]),
    ).toBe('a')
  })

  it('creates a new cohort (null) when none has room', () => {
    expect(
      chooseExistingCohort([{ id: 'a', memberUids: ['1', '2', '3', '4', '5', '6'], maxSize: 6 }]),
    ).toBeNull()
  })

  it('creates a new cohort when there are no candidates (lonely pioneer)', () => {
    expect(chooseExistingCohort([])).toBeNull()
  })

  it('picks the fewest-members cohort to fill toward the soft target', () => {
    const chosen = chooseExistingCohort([
      { id: 'big', memberUids: ['1', '2', '3'], maxSize: 6 },
      { id: 'small', memberUids: ['1'], maxSize: 6 },
      { id: 'mid', memberUids: ['1', '2'], maxSize: 6 },
    ])
    expect(chosen).toBe('small')
  })

  it('skips full cohorts even if listed first', () => {
    const chosen = chooseExistingCohort([
      { id: 'full', memberUids: ['1', '2', '3', '4', '5', '6'], maxSize: 6 },
      { id: 'open', memberUids: ['1', '2'], maxSize: 6 },
    ])
    expect(chosen).toBe('open')
  })
})

describe('buildUserPrompt', () => {
  const completed = [LESSON_META_BY_ID['long-run']]
  const inProgress = [LESSON_META_BY_ID['combining-events']]

  it('includes completed lesson ids and titles', () => {
    const prompt = buildUserPrompt({ cohortSize: 3, completed, inProgress, meetingMinutes: 45 })
    expect(prompt).toContain('long-run')
    expect(prompt).toContain('Chance & the Long Run')
    expect(prompt).toContain('3 people')
    expect(prompt).toContain('45 minutes')
  })

  it('lists in-progress lessons separately and omits unrelated ones', () => {
    const prompt = buildUserPrompt({ cohortSize: 2, completed, inProgress, meetingMinutes: 30 })
    expect(prompt).toContain('combining-events')
    expect(prompt).not.toContain('expected-value')
  })

  it('handles an empty completed set', () => {
    const prompt = buildUserPrompt({ cohortSize: 1, completed: [], inProgress: [], meetingMinutes: 45 })
    expect(prompt).toContain('(none yet)')
  })
})

describe('shared helpers stay in sync with the client copies', () => {
  it('levelBand matches PRD2 D2', () => {
    expect([0, 1, 2, 3, 4, 5].map(levelBand)).toEqual([0, 1, 1, 2, 2, 3])
  })
  it('cohortName is deterministic and well-formed', () => {
    expect(cohortName('seed')).toBe(cohortName('seed'))
    expect(cohortName('seed')).toMatch(/^The \S+ \S+$/)
  })
  it('outline parse + fallback work', () => {
    expect(parseOutline('garbage')).toBeNull()
    expect(fallbackOutline([]).agenda.length).toBeGreaterThan(0)
  })
})

// generateOutline is tested with the Anthropic SDK mocked so CI never calls the
// real API (PRD2 §13).
describe('generateOutline', () => {
  const input = {
    cohortSize: 3,
    completed: [LESSON_META_BY_ID['long-run']],
    inProgress: [],
    meetingMinutes: 45,
  }

  beforeEach(() => {
    delete process.env.FUNCTIONS_EMULATOR
    delete process.env.OUTLINE_STUB
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unmock('@anthropic-ai/sdk')
  })

  it('returns a deterministic stub when no API key is present', async () => {
    const { generateOutline } = await import('../src/anthropic')
    const res = await generateOutline(input, undefined)
    expect(res.model).toBe('stub')
    expect(res.usedFallback).toBe(false)
    expect(res.outline.warmUp).toContain('[stub outline')
  })

  it('returns a stub under the emulator even with a key', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true'
    const { generateOutline } = await import('../src/anthropic')
    const res = await generateOutline(input, 'sk-test')
    expect(res.model).toBe('stub')
  })

  it('parses a valid mocked model response', async () => {
    const validJson = JSON.stringify({
      warmUp: 'w',
      agenda: [{ title: 't', minutes: 10, facilitatorNote: 'n' }],
      discussionQuestions: [{ lessonId: 'long-run', question: 'q?' }],
      peerTeachingActivity: 'p',
      wrapUp: 'done',
    })
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = {
          create: async () => ({ content: [{ type: 'text', text: validJson }] }),
        }
      },
    }))
    const { generateOutline } = await import('../src/anthropic')
    const res = await generateOutline(input, 'sk-real-key')
    expect(res.usedFallback).toBe(false)
    expect(res.outline.warmUp).toBe('w')
  })

  it('falls back to the authored template on an API error', async () => {
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = {
          create: async () => {
            throw new Error('boom')
          },
        }
      },
    }))
    const { generateOutline } = await import('../src/anthropic')
    const res = await generateOutline(input, 'sk-real-key')
    expect(res.usedFallback).toBe(true)
    expect(res.outline.agenda.length).toBeGreaterThan(0)
  })

  it('falls back when the model returns malformed JSON', async () => {
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = {
          create: async () => ({ content: [{ type: 'text', text: 'not json' }] }),
        }
      },
    }))
    const { generateOutline } = await import('../src/anthropic')
    const res = await generateOutline(input, 'sk-real-key')
    expect(res.usedFallback).toBe(true)
  })
})
