import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { UserDoc } from '../../src/progress/types'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

let mockUserDoc: UserDoc | null = null

vi.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-uid', email: 'test@example.com', displayName: 'Maya' }, logOut: vi.fn() }),
}))

vi.mock('../../src/progress/ProgressContext', () => ({
  useProgress: () => ({ userDoc: mockUserDoc, progressByLesson: {} }),
}))

vi.mock('../../src/progress/firestore', () => ({
  updateEmailPrefs: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/content/loadLessons', () => ({ lessons: [] }))

import { updateEmailPrefs } from '../../src/progress/firestore'
import Profile from '../../src/screens/Profile'

const mockUpdateEmailPrefs = updateEmailPrefs as ReturnType<typeof vi.fn>

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

describe('Profile email quiz toggle', () => {
  beforeEach(() => {
    mockUpdateEmailPrefs.mockClear()
    mockUserDoc = null
  })

  it('AC1: toggle is off by default when emailPrefs is absent', () => {
    mockUserDoc = { ...baseUserDoc }
    render(<Profile />)
    const toggle = screen.getByRole('switch', {
      name: 'Send me a daily probability quiz by email',
    })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('AC2: toggle is on when emailPrefs.dailyQuiz is true', () => {
    mockUserDoc = { ...baseUserDoc, emailPrefs: { dailyQuiz: true } }
    render(<Profile />)
    const toggle = screen.getByRole('switch', {
      name: 'Send me a daily probability quiz by email',
    })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('AC3: clicking toggle (off -> on) calls updateEmailPrefs with { dailyQuiz: true }', async () => {
    mockUserDoc = { ...baseUserDoc, emailPrefs: { dailyQuiz: false } }
    render(<Profile />)
    const toggle = screen.getByRole('switch', {
      name: 'Send me a daily probability quiz by email',
    })
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(mockUpdateEmailPrefs).toHaveBeenCalledWith('test-uid', { dailyQuiz: true })
    })
  })

  it('AC4: clicking toggle (on -> off) calls updateEmailPrefs with { dailyQuiz: false }', async () => {
    mockUserDoc = { ...baseUserDoc, emailPrefs: { dailyQuiz: true } }
    render(<Profile />)
    const toggle = screen.getByRole('switch', {
      name: 'Send me a daily probability quiz by email',
    })
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(mockUpdateEmailPrefs).toHaveBeenCalledWith('test-uid', { dailyQuiz: false })
    })
  })
})
