import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InsuranceDesk } from '../../src/widgets/InsuranceDesk'

describe('InsuranceDesk', () => {
  it('shows the break-even premium as payout × true crash rate', () => {
    render(
      <InsuranceDesk
        props={{ premium: 800, trueCrashRate: 0.05, payout: 12000, bankroll: 5000, customers: 10 }}
        interactive
      />,
    )
    // 12000 × 0.05 = 600, computed synchronously from props.
    expect(screen.getByTestId('break-even')).toHaveTextContent('600')
  })

  it('renders the bankroll readout', () => {
    render(
      <InsuranceDesk
        props={{ premium: 800, trueCrashRate: 0.05, payout: 12000, bankroll: 5000, customers: 10 }}
        interactive
      />,
    )
    expect(screen.getByTestId('bankroll')).toBeInTheDocument()
  })

  it('exposes the customers slider and growth controls', () => {
    render(
      <InsuranceDesk
        props={{ premium: 800, trueCrashRate: 0.05, payout: 12000, bankroll: 5000, customers: 10 }}
        interactive
      />,
    )
    expect(screen.getByTestId('customers-slider')).toBeInTheDocument()
    expect(screen.getByTestId('scale-2000')).toBeInTheDocument()
  })

  it('does not crash when rendered standalone without scenario/setScenario', () => {
    render(<InsuranceDesk props={{ customers: 10 }} />)
    expect(screen.getByTestId('insurance-desk')).toBeInTheDocument()
  })
})
