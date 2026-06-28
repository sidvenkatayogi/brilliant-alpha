import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { UserDoc } from '../../src/progress/types'

let mockUserDoc: UserDoc | null = null
const mockSetDailyQuizEnabled = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/progress/ProgressContext', () => ({
  useProgress: () => ({ userDoc: mockUserDoc, setDailyQuizEnabled: mockSetDailyQuizEnabled }),
}))

// framer-motion: render motion.* as plain elements so the switch/markup is testable.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({ children, ...props }: { children?: React.ReactNode }) => {
          // Strip motion-only props that React would warn about on a DOM node.
          const { initial, animate, transition, layout, ...rest } = props as Record<string, unknown>
          void initial
          void animate
          void transition
          void layout
          const Tag = tag as keyof JSX.IntrinsicElements
          return <Tag {...rest}>{children}</Tag>
        },
    },
  ),
}))

import DailyQuizToggle from '../../src/widgets/DailyQuizToggle'

const baseUserDoc: UserDoc = {
  displayName: 'Maya',
  email: 'test@example.com',
  createdAt: Date.now(),
  currentStreak: 0,
  longestStreak: 0,
  totalLessonsCompleted: 0,
  lastActiveDate: null,
  milestones: [],
  cohortId: null,
}

const getSwitch = () =>
  screen.getByRole('switch', { name: 'Send me a daily probability quiz by email' })

describe('DailyQuizToggle (home floating widget)', () => {
  beforeEach(() => {
    mockSetDailyQuizEnabled.mockClear()
    mockUserDoc = null
  })

  it('is off by default when emailPrefs is absent', () => {
    mockUserDoc = { ...baseUserDoc }
    render(<DailyQuizToggle />)
    expect(getSwitch()).toHaveAttribute('aria-checked', 'false')
  })

  it('is on when emailPrefs.dailyQuiz is true', () => {
    mockUserDoc = { ...baseUserDoc, emailPrefs: { dailyQuiz: true } }
    render(<DailyQuizToggle />)
    expect(getSwitch()).toHaveAttribute('aria-checked', 'true')
  })

  it('clicking (off -> on) calls setDailyQuizEnabled(true)', async () => {
    mockUserDoc = { ...baseUserDoc, emailPrefs: { dailyQuiz: false } }
    render(<DailyQuizToggle />)
    fireEvent.click(getSwitch())
    await waitFor(() => {
      expect(mockSetDailyQuizEnabled).toHaveBeenCalledWith(true)
    })
  })

  it('clicking (on -> off) calls setDailyQuizEnabled(false)', async () => {
    mockUserDoc = { ...baseUserDoc, emailPrefs: { dailyQuiz: true } }
    render(<DailyQuizToggle />)
    fireEvent.click(getSwitch())
    await waitFor(() => {
      expect(mockSetDailyQuizEnabled).toHaveBeenCalledWith(false)
    })
  })

  it('shows an inline error if the save fails', async () => {
    mockUserDoc = { ...baseUserDoc, emailPrefs: { dailyQuiz: false } }
    mockSetDailyQuizEnabled.mockRejectedValueOnce(new Error('network'))
    render(<DailyQuizToggle />)
    fireEvent.click(getSwitch())
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
    })
  })
})
