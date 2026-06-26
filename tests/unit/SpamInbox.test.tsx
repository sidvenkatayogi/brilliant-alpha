import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpamInbox } from '../../src/widgets/SpamInbox'

const pct = (el: HTMLElement) => Number(el.textContent!.replace('%', '').trim())

describe('SpamInbox', () => {
  it('opens at the ~10% base rate over the full inbox', () => {
    render(<SpamInbox interactive />)
    // Baseline P(spam) is the deterministic 10/100 = 10% base rate.
    expect(pct(screen.getByTestId('p-spam'))).toBeLessThanOrEqual(20)
    expect(screen.getByTestId('denominator')).toHaveTextContent('100')
  })

  it('makes spam dominate after conditioning on FREE + ALL CAPS', async () => {
    const user = userEvent.setup()
    render(<SpamInbox interactive />)
    await user.click(screen.getByTestId('clue-free'))
    await user.click(screen.getByTestId('clue-caps'))
    // The FREE + ALL CAPS slice is mostly spam (~80%) by construction.
    await waitFor(() => {
      expect(pct(screen.getByTestId('p-spam'))).toBeGreaterThan(50)
    })
    // The world has visibly shrunk from 100.
    expect(pct(screen.getByTestId('denominator'))).toBeLessThan(100)
  })

  it('renders standalone with no scenario or callbacks and never crashes', () => {
    render(<SpamInbox />)
    expect(screen.getByTestId('spam-inbox')).toBeInTheDocument()
  })

  it('hides the clue chips in the non-interactive static frame', () => {
    render(<SpamInbox interactive={false} />)
    expect(screen.getByTestId('spam-inbox')).toBeInTheDocument()
    expect(screen.queryByTestId('clue-free')).toBeNull()
  })
})
