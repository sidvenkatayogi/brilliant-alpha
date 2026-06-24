import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkdownText } from '../../src/player/MarkdownText'

describe('MarkdownText', () => {
  it('renders **bold** as strong and *italic* as em, with no stray asterisks', () => {
    const { container } = render(<MarkdownText text="An **AND** and an *or*." />)
    expect(screen.getByText('AND').tagName).toBe('STRONG')
    expect(screen.getByText('or').tagName).toBe('EM')
    expect(container.textContent).toBe('An AND and an or.')
    expect(container.textContent).not.toContain('*')
  })

  it('preserves plain text and line breaks', () => {
    const { container } = render(<MarkdownText text={'line one\nline two'} />)
    expect(container.querySelectorAll('br')).toHaveLength(1)
    expect(container.textContent).toBe('line oneline two')
  })
})

describe('MarkdownText — explainable terms', () => {
  const text = 'A die has a [[1 in 6|Six equal faces, so each is **one sixth**.]] chance.'

  it('renders the term as a button and hides the explanation until hovered', () => {
    render(<MarkdownText text={text} />)
    screen.getByRole('button', { name: '1 in 6' })
    expect(screen.queryByTestId('term-explanation')).toBeNull()
    // The token markup itself never leaks into the visible text.
    expect(screen.queryByText(/\[\[|\]\]/)).toBeNull()
  })

  it('reveals the explanation on hover and hides it when the pointer leaves', async () => {
    const user = userEvent.setup()
    render(<MarkdownText text={text} />)
    const term = screen.getByRole('button', { name: '1 in 6' })

    await user.hover(term)
    const note = screen.getByTestId('term-explanation')
    expect(note).toHaveTextContent('Six equal faces, so each is one sixth.')
    expect(note.querySelector('strong')).not.toBeNull() // explanation markdown renders
    expect(term).toHaveAttribute('aria-describedby', note.id)

    await user.unhover(term)
    expect(screen.queryByTestId('term-explanation')).toBeNull()
  })

  it('also reveals on keyboard focus (accessible without a pointer)', async () => {
    const user = userEvent.setup()
    render(<MarkdownText text={text} />)
    await user.tab()
    expect(screen.getByRole('button', { name: '1 in 6' })).toHaveFocus()
    expect(screen.getByTestId('term-explanation')).toHaveTextContent('one sixth')
  })

  it('swaps to a second term without leaving the first open', async () => {
    const user = userEvent.setup()
    render(<MarkdownText text={'[[A|first explain]] and [[B|second explain]]'} />)
    await user.hover(screen.getByRole('button', { name: 'A' }))
    expect(screen.getByTestId('term-explanation')).toHaveTextContent('first explain')
    await user.hover(screen.getByRole('button', { name: 'B' }))
    const note = screen.getByTestId('term-explanation')
    expect(note).toHaveTextContent('second explain')
    expect(note).not.toHaveTextContent('first explain')
  })
})
