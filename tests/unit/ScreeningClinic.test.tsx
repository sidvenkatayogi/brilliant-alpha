import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScreeningClinic } from '../../src/widgets/ScreeningClinic'

// The headline PPV must be computed synchronously from props — independent of the
// canvas (jsdom has no real 2d context). A rare disease makes a positive almost
// always false; a common one makes it almost always real.
//
// Co-visibility regression: in interactive mode, the reflective visual (PPV
// readout + canvas wrapper) must be inside a sticky container so it stays in
// frame while the learner scrolls to the controls.

describe('ScreeningClinic', () => {
  it('shows a low PPV for a rare disease despite an accurate test', () => {
    render(
      <ScreeningClinic
        props={{ prevalence: 0.001, sensitivity: 0.99, falsePositive: 0.05 }}
        interactive
      />,
    )
    const ppv = Number(screen.getByTestId('ppv').textContent!.replace('%', ''))
    expect(ppv).toBeLessThan(10)
  })

  it('raises PPV above 90% when the disease is common', () => {
    render(
      <ScreeningClinic
        props={{ prevalence: 0.5, sensitivity: 0.99, falsePositive: 0.05 }}
        interactive
      />,
    )
    const ppv = Number(screen.getByTestId('ppv').textContent!.replace('%', ''))
    expect(ppv).toBeGreaterThan(90)
  })

  it('renders without controls and without crashing when not interactive', () => {
    render(
      <ScreeningClinic
        props={{ prevalence: 0.001, sensitivity: 0.99, falsePositive: 0.05 }}
        interactive={false}
      />,
    )
    expect(screen.getByTestId('screening-clinic')).toBeInTheDocument()
    expect(screen.queryByTestId('slider-prevalence')).not.toBeInTheDocument()
    // Visual still renders in non-interactive mode.
    expect(screen.getByTestId('ppv')).toBeInTheDocument()
  })

  // Co-visibility regression: the PPV readout (reflective visual) must be
  // inside a sticky wrapper so it stays in frame as the learner scrolls to the
  // sliders beneath it. Asserts the [data-sticky-visual] attribute is present
  // on an ancestor of the PPV element.
  it('wraps the reflective visual in a sticky container in interactive mode', () => {
    render(
      <ScreeningClinic
        props={{ prevalence: 0.001, sensitivity: 0.99, falsePositive: 0.05 }}
        interactive
      />,
    )
    const ppv = screen.getByTestId('ppv')
    // Walk up the DOM to find the sticky wrapper with data-sticky-visual.
    let el: HTMLElement | null = ppv
    let foundSticky = false
    while (el) {
      if (el.hasAttribute('data-sticky-visual')) {
        foundSticky = true
        break
      }
      el = el.parentElement
    }
    expect(foundSticky).toBe(true)
  })

  // Edge: in non-interactive mode the visual is present but there is no sticky
  // wrapper requirement (controls are absent so scroll separation cannot occur).
  // The test simply confirms the PPV is still rendered and accessible.
  it('renders the PPV readout in non-interactive mode without crashing', () => {
    render(
      <ScreeningClinic
        props={{ prevalence: 0.001, sensitivity: 0.99, falsePositive: 0.05 }}
        interactive={false}
      />,
    )
    expect(screen.getByTestId('ppv')).toBeInTheDocument()
  })
})
