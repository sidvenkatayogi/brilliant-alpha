import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CasinoFloor } from '../../src/widgets/CasinoFloor'

describe('CasinoFloor', () => {
  it('shows a negative expected value for the player', () => {
    render(
      <CasinoFloor
        props={{ startingBankroll: 100, wager: 5, payout: 35, winProbability: 1 / 38 }}
        interactive
      />,
    )
    // Player on a 35-to-1, p=1/38 bet has EV ≈ −$0.26 per $5 spin — a minus sign.
    expect(screen.getByTestId('ev-per-play').textContent).toContain('-')
  })

  it('starts the bankroll at $100', () => {
    render(
      <CasinoFloor
        props={{ startingBankroll: 100, wager: 5, payout: 35, winProbability: 1 / 38 }}
        interactive
      />,
    )
    expect(screen.getByTestId('bankroll')).toHaveTextContent('$100')
  })
})
