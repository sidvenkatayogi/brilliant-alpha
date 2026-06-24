import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DICE_EVENTS, probability } from '../../src/widgets/diceEvents'
import { ProbabilityArea } from '../../src/widgets/ProbabilityArea'
import { ConditionZoom } from '../../src/widgets/ConditionZoom'
import { BayesIconArray } from '../../src/widgets/BayesIconArray'
import { EvBettingGame } from '../../src/widgets/EvBettingGame'

describe('diceEvents probabilities', () => {
  it('computes single-event probabilities over 36 outcomes', () => {
    expect(probability(DICE_EVENTS.sum7.test)).toBeCloseTo(6 / 36)
    expect(probability(DICE_EVENTS.firstEven.test)).toBeCloseTo(18 / 36)
    expect(probability(DICE_EVENTS.firstDie3.test)).toBeCloseTo(6 / 36)
  })
})

describe('ProbabilityArea', () => {
  it('shows AND as the product of the two probabilities', () => {
    // mode 'and': P(A and B) = 50% × 40% = 20%.
    render(<ProbabilityArea props={{ mode: 'and', pA: 0.5, pB: 0.4 }} interactive />)
    expect(screen.getByTestId('p-and')).toHaveTextContent('20%')
  })

  it('shows OR as P(A) + P(B) minus the overlap (not a plain sum)', () => {
    // mode 'or': P(A or B) = 50% + 40% − 20% = 70% (90% would be the trap).
    render(<ProbabilityArea props={{ mode: 'or', pA: 0.5, pB: 0.4 }} interactive />)
    expect(screen.getByTestId('p-or')).toHaveTextContent('70%')
    expect(screen.getByTestId('p-and')).toHaveTextContent('20%')
  })
})

describe('ConditionZoom', () => {
  it('shrinks the denominator and regrows the fraction when conditioned', async () => {
    const user = userEvent.setup()
    render(<ConditionZoom props={{ condition: 'firstDie6', target: 'sumGte10' }} interactive />)
    // Unconditioned: P(sum >= 10) = 6/36 = 17%.
    expect(screen.getByTestId('conditional-prob')).toHaveTextContent('17%')
    expect(screen.getByTestId('cond-fraction')).toHaveTextContent('6 of 36')
    // Conditioning on first die = 6 shrinks the world to 6 rolls; (6,4),(6,5),
    // (6,6) clear 10 → 3 of 6. (The percentage itself eases via rAF.)
    await user.click(screen.getByTestId('condition-toggle'))
    expect(screen.getByTestId('cond-fraction')).toHaveTextContent('3 of 6')
  })
})

describe('EvBettingGame', () => {
  it('starts the crowd at the break-even stake with a negative-EV bet', () => {
    render(
      <EvBettingGame
        props={{ startingBankroll: 100, payout: 35, winProbability: 1 / 38, players: 50 }}
        interactive
      />,
    )
    // Before any rounds are revealed, the mean sits exactly at the starting stake.
    expect(screen.getByTestId('mean-bankroll')).toHaveTextContent('$100')
    // And the controls to run the simulation are present.
    expect(screen.getByTestId('run')).toBeInTheDocument()
    expect(screen.getByTestId('reset')).toBeInTheDocument()
  })
})

describe('BayesIconArray', () => {
  it('shows a low PPV for a rare disease despite an accurate test', () => {
    render(
      <BayesIconArray
        props={{ prevalence: 0.001, sensitivity: 0.99, falsePositive: 0.05 }}
        interactive
      />,
    )
    // 1 true positive vs ~50 false positives → PPV ~2%, well under 50%.
    const ppv = Number(screen.getByTestId('ppv').textContent!.replace('%', ''))
    expect(ppv).toBeLessThan(10)
  })

  it('raises PPV sharply when the disease is common', () => {
    render(
      <BayesIconArray
        props={{ prevalence: 0.5, sensitivity: 0.99, falsePositive: 0.05 }}
        interactive
      />,
    )
    const ppv = Number(screen.getByTestId('ppv').textContent!.replace('%', ''))
    expect(ppv).toBeGreaterThan(90)
  })
})
