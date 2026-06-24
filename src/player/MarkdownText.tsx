import { Fragment, useState, type ReactNode } from 'react'

// Minimal inline markdown for authored lesson copy: **bold**, *italic*, newlines,
// and "explainable terms" written as [[term | deeper explanation]]. Hovering a
// term (or focusing it with the keyboard / tapping it on touch) pops a small
// tooltip with a hand-authored explanation anchored to the word. Deliberately
// tiny — no markdown dependency in the bundle.

// term: [[label|explanation]]  ·  then bold, then italic.
const TOKEN = /\[\[([^|\]]+)\|([^\]]+)\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*/g

/** Render bold/italic only (used inside an explanation — no nested terms). */
function renderBasic(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) nodes.push(<strong key={key++} className="font-semibold">{m[1]}</strong>)
    else nodes.push(<em key={key++}>{m[2]}</em>)
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  // The term currently revealed by hover/focus (one at a time), plus whether the
  // tooltip should drop below — when there isn't room above it, so it never
  // clips off the top of the page.
  const [active, setActive] = useState<{ id: number; below: boolean } | null>(null)
  let termCount = 0

  const show = (id: number, el: HTMLElement) =>
    setActive({ id, below: el.getBoundingClientRect().top < 140 })
  const hide = (id: number) => setActive((cur) => (cur?.id === id ? null : cur))

  const lines = text.split('\n')

  const renderLine = (line: string): ReactNode[] => {
    const nodes: ReactNode[] = []
    let last = 0
    let key = 0
    let m: RegExpExecArray | null
    TOKEN.lastIndex = 0
    while ((m = TOKEN.exec(line))) {
      if (m.index > last) nodes.push(line.slice(last, m.index))
      if (m[1] !== undefined) {
        // Explainable term — reveals its tooltip on hover/focus.
        const id = termCount++
        const label = m[1].trim()
        const explanation = m[2].trim()
        const isActive = active?.id === id
        const below = isActive && active.below
        nodes.push(
          <span key={`t${key++}`} className="relative inline-block">
            <button
              type="button"
              aria-describedby={isActive ? `term-note-${id}` : undefined}
              onMouseEnter={(e) => show(id, e.currentTarget)}
              onMouseLeave={() => hide(id)}
              onFocus={(e) => show(id, e.currentTarget)}
              onBlur={() => hide(id)}
              className="cursor-help font-medium text-accent underline decoration-dotted decoration-accent/60 underline-offset-2"
            >
              {label}
            </button>
            {isActive && (
              <span
                role="note"
                id={`term-note-${id}`}
                data-testid="term-explanation"
                className={`absolute left-1/2 z-20 w-56 -translate-x-1/2 animate-[fadeIn_0.15s_ease] rounded-xl bg-ink p-2.5 text-left text-xs font-normal leading-relaxed text-white shadow-lg ring-1 ring-white/10 ${
                  below ? 'top-full mt-2' : 'bottom-full mb-2'
                }`}
              >
                <span className="font-semibold">{label}</span>
                <span className="mx-1.5 text-white/40">·</span>
                {renderBasic(explanation)}
                <span
                  className={`absolute left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-x-transparent ${
                    below
                      ? 'bottom-full border-b-4 border-b-ink'
                      : 'top-full border-t-4 border-t-ink'
                  }`}
                />
              </span>
            )}
          </span>,
        )
      } else if (m[3] !== undefined) {
        nodes.push(<strong key={`b${key++}`} className="font-semibold text-ink">{m[3]}</strong>)
      } else {
        nodes.push(<em key={`i${key++}`}>{m[4]}</em>)
      }
      last = TOKEN.lastIndex
    }
    if (last < line.length) nodes.push(line.slice(last))
    return nodes
  }

  const rendered = lines.map((line, i) => (
    <Fragment key={i}>
      {renderLine(line)}
      {i < lines.length - 1 && <br />}
    </Fragment>
  ))

  return (
    <p className={className}>{rendered}</p>
  )
}
