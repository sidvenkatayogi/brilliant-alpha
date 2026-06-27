import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScreeningClinic } from '../../src/widgets/ScreeningClinic'

// The headline PPV must be computed synchronously from props — independent of the
// canvas (jsdom has no real 2d context). A rare disease makes a positive almost
// always false; a common one makes it almost always real.
//
// Fit-layout regression: in interactive mode, the widget uses a height-filling
// flex-column layout so the visual, sliders, and Continue button all fit within
// the viewport without page scroll. The outer element carries a fit-layout class
// (h-full flex flex-col) so the parent InteractiveStep can size it.

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

  // Fit-layout regression (replaces the sticky-wrapper test):
  // In interactive mode the widget must use the fit-layout: the outer element
  // is a height-filling flex column (h-full flex flex-col) so InteractiveStep
  // can constrain it to the viewport. The PPV readout and sliders are both
  // rendered and are descendants of the same outer widget container.
  it('uses fit-layout in interactive mode: ppv and sliders present in flex-column container', () => {
    render(
      <ScreeningClinic
        props={{ prevalence: 0.001, sensitivity: 0.99, falsePositive: 0.05 }}
        interactive
      />,
    )
    const container = screen.getByTestId('screening-clinic')
    // The container must carry the flex h-full class names for the fit layout.
    expect(container.className).toContain('flex')
    expect(container.className).toContain('h-full')
    // Both the visual readout and the controls must be present.
    expect(screen.getByTestId('ppv')).toBeInTheDocument()
    expect(screen.getByTestId('slider-prevalence')).toBeInTheDocument()
    expect(screen.getByTestId('slider-sensitivity')).toBeInTheDocument()
    expect(screen.getByTestId('slider-false-positive')).toBeInTheDocument()
  })

  // Edge: non-interactive mode — visual renders, no sliders, no fit-layout required.
  it('renders the PPV readout in non-interactive mode without crashing', () => {
    render(
      <ScreeningClinic
        props={{ prevalence: 0.001, sensitivity: 0.99, falsePositive: 0.05 }}
        interactive={false}
      />,
    )
    expect(screen.getByTestId('ppv')).toBeInTheDocument()
    expect(screen.queryByTestId('slider-prevalence')).not.toBeInTheDocument()
  })
})
