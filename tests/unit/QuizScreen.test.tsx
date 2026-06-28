import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Quiz from '../../src/screens/Quiz'
import { useProgress } from '../../src/progress/ProgressContext'
import { fetchPracticeQuiz } from '../../src/cohort/practiceQuiz'
import { generateMixedQuiz } from '../../src/engine/quiz'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('../../src/progress/ProgressContext', () => ({
  useProgress: vi.fn(),
}))

vi.mock('../../src/cohort/practiceQuiz', () => ({
  fetchPracticeQuiz: vi.fn(),
}))

vi.mock('../../src/engine/quiz', () => ({
  generateMixedQuiz: vi.fn(),
  scoreQuiz: vi.fn(() => ({ score: 0, total: 0, perLesson: [] })),
  nextMasteryAfterQuiz: vi.fn((v: number) => v),
}))

vi.mock('../../src/content/loadLessons', () => ({
  lessons: [
    {
      id: 'long-run',
      title: 'Chance & the Long Run',
      conceptSummary: 'Probability is long-run relative frequency',
      realWorldHook: 'insurance example',
      order: 1,
    },
  ],
}))

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockUseProgress = vi.mocked(useProgress)
const mockFetchPracticeQuiz = vi.mocked(fetchPracticeQuiz)
const mockGenerateMixedQuiz = vi.mocked(generateMixedQuiz)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseProgress = {
  progressByLesson: {
    'long-run': {
      lessonId: 'long-run',
      status: 'completed' as const,
      masteryScore: 0.8,
      currentStepIndex: 0,
      stepResults: {},
      startedAt: 0,
      completedAt: 0,
      lastAccessedAt: 0,
    },
  },
  loading: false,
  submitQuizAttempt: vi.fn(() => ({ score: 0, total: 0, perLesson: [] })),
  userDoc: null,
  getProgress: vi.fn(),
  setCurrentStep: vi.fn(),
  recordStepResult: vi.fn(),
  restartLesson: vi.fn(),
  completeLesson: vi.fn(),
  setCohortId: vi.fn(),
}

const mockQuestion = {
  lessonId: 'long-run',
  prompt: 'Which statement best captures the core idea?',
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  correctIndex: 0,
  explanation: 'Because frequency',
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Quiz screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // AC1 — quiz-loading shown while fetchPracticeQuiz is pending; controls disabled/absent
  it('shows quiz-loading while fetchPracticeQuiz is pending and disables submit', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolve!: (v: any) => void
    mockFetchPracticeQuiz.mockReturnValue(new Promise((r) => { resolve = r }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseProgress.mockReturnValue(baseProgress as any)

    render(<Quiz />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-loading')).toBeInTheDocument()
    })
    // No question cards while loading
    expect(screen.queryByTestId('quiz-q-0')).not.toBeInTheDocument()
    // I1: quiz-submit is rendered (not-yet-submitted branch) but disabled while quizLoading
    expect(screen.getByTestId('quiz-submit')).toBeDisabled()
    // I1: quiz-new only appears in the post-submit branch — absent during initial loading
    expect(screen.queryByTestId('quiz-new')).not.toBeInTheDocument()

    // Clean up the pending promise
    resolve([])
  })

  // AC2 — questions render after fetchPracticeQuiz resolves
  it('renders questions after fetchPracticeQuiz resolves', async () => {
    mockFetchPracticeQuiz.mockResolvedValue([mockQuestion])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseProgress.mockReturnValue(baseProgress as any)

    render(<Quiz />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-q-0')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('quiz-loading')).not.toBeInTheDocument()
    // The prompt is rendered inside a <p> that also includes the question number,
    // so match using a substring function rather than exact text.
    expect(screen.getByText((content) => content.includes(mockQuestion.prompt))).toBeInTheDocument()
  })

  // AC3 — fallback when fetchPracticeQuiz rejects
  it('falls back to generateMixedQuiz when fetchPracticeQuiz rejects', async () => {
    mockFetchPracticeQuiz.mockRejectedValue(new Error('network error'))
    mockGenerateMixedQuiz.mockReturnValue([mockQuestion])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseProgress.mockReturnValue(baseProgress as any)

    render(<Quiz />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-q-0')).toBeInTheDocument()
    })
    // No fatal error — quiz still renders
    expect(screen.queryByTestId('quiz-loading')).not.toBeInTheDocument()
    expect(mockGenerateMixedQuiz).toHaveBeenCalled()
  })

  // AC4 — quiz-empty when no completed lessons (no API call)
  it('shows quiz-empty when no lessons are completed', async () => {
    mockUseProgress.mockReturnValue({
      ...baseProgress,
      progressByLesson: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<Quiz />)

    expect(screen.getByTestId('quiz-empty')).toBeInTheDocument()
    expect(mockFetchPracticeQuiz).not.toHaveBeenCalled()
  })
})
