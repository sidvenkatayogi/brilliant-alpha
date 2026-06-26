import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RedundancyBay } from '../../src/widgets/RedundancyBay'

// L2 — The Redundancy Bay has two modes, both computing their headline odds
// SYNCHRONOUSLY from the design (no simulation required):
//
//   mode "compare" (default, the DEMO): a fixed side-by-side comparison —
//     Triple backup: 3 systems each fail 1-in-10 -> P(all fail) = 0.1^3 = 0.1%
//     One tough sys: 1 system fails 1-in-100      -> P(fail)      = 0.01  = 1%
//   So three mediocre independent backups are ~10x SAFER than one better single
//   system — the "3 weak beats 1 strong" insight, provable here.
//
//   mode "sandbox" (the EXPERIMENT): the learner's own design, seeded from props.
//     P(all fail) = rate^systems, P(at least one) = 1 - (1-rate)^systems.

const pctOf = (text: string | null): number => Number(String(text).replace('%', ''))

describe('RedundancyBay — compare mode (the demo)', () => {
  it('defaults to compare mode and shows the triple-backup catastrophe ≈ 0.1% (0.1^3)', () => {
    render(<RedundancyBay interactive />)
    expect(screen.getByTestId('triple-catastrophe')).toHaveTextContent('0.1%')
  })

  it('shows the single-system catastrophe ≈ 1% (1-in-100)', () => {
    render(<RedundancyBay interactive />)
    expect(screen.getByTestId('single-catastrophe')).toHaveTextContent('1.0%')
  })

  it('proves three weak backups beat one stronger system (~10x safer)', () => {
    render(<RedundancyBay interactive />)
    const triple = pctOf(screen.getByTestId('triple-catastrophe').textContent)
    const single = pctOf(screen.getByTestId('single-catastrophe').textContent)
    expect(triple).toBeLessThan(single)
    expect(single / triple).toBeCloseTo(10, 0)
  })

  it('has the redundancy-bay root and a "Fly the fleet" button when interactive', () => {
    render(<RedundancyBay interactive props={{ mode: 'compare' }} />)
    expect(screen.getByTestId('redundancy-bay')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fly the fleet' })).toBeInTheDocument()
  })

  it('renders a representative already-flown state when not interactive (no fly button)', () => {
    render(<RedundancyBay interactive={false} props={{ mode: 'compare' }} />)
    expect(screen.getByTestId('redundancy-bay')).toBeInTheDocument()
    // The two designs still report their fixed odds with no simulation.
    expect(screen.getByTestId('triple-catastrophe')).toHaveTextContent('0.1%')
    expect(screen.getByTestId('single-catastrophe')).toHaveTextContent('1.0%')
    expect(screen.queryByRole('button', { name: 'Fly the fleet' })).toBeNull()
  })
})

describe('RedundancyBay — sandbox mode (the experiment)', () => {
  it('starts with a single plane and NO comparison panel by default', () => {
    render(<RedundancyBay interactive props={{ mode: 'sandbox' }} />)
    // Only the learner's own design is shown — no reference panel yet.
    expect(screen.getByTestId('catastrophe-prob')).toBeInTheDocument()
    expect(screen.queryByTestId('ref-catastrophe')).toBeNull()
    expect(screen.getByTestId('compare-toggle')).toHaveAttribute('aria-checked', 'false')
  })

  it('exposes sandbox controls and a Fly the fleet button', () => {
    render(<RedundancyBay interactive props={{ mode: 'sandbox' }} />)
    expect(screen.getByTestId('systems-slider')).toBeInTheDocument()
    expect(screen.getByTestId('rate-slider')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fly the fleet' })).toBeInTheDocument()
  })

  it('computes P(all fail) = rate^systems for the seeded design (3 systems @ 1-in-10 → 0.1%)', () => {
    render(<RedundancyBay interactive props={{ mode: 'sandbox', systems: 3, failureRate: 0.1 }} />)
    expect(screen.getByTestId('catastrophe-prob')).toHaveTextContent('0.1%')
  })

  it('for a single system, P(all fail) equals the per-system rate (1 @ 1-in-100 → 1.0%)', () => {
    render(<RedundancyBay interactive props={{ mode: 'sandbox', systems: 1, failureRate: 0.01 }} />)
    expect(screen.getByTestId('catastrophe-prob')).toHaveTextContent('1.0%')
  })
})
