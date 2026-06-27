/**
 * StickyVisual — pins the reflective visual of an interactive widget in view
 * while the learner scrolls down to and drags the controls beneath it.
 *
 * Mechanic: `position: sticky; top: var(--sticky-visual-top, 56px)` keeps the
 * wrapper just below the lesson header (LessonPlayer's sticky header is ~44px
 * tall at py-3 + content; 56px / top-14 gives a comfortable 12px gap and is
 * easy to tune via the CSS variable or by changing the Tailwind class).
 *
 * Background: `bg-slate-50` matches the page background (src/styles/index.css)
 * so the wrapper is OPAQUE and cleanly masks controls that scroll up behind the
 * pinned visual. When content is short and nothing underlaps, slate-50 == page
 * bg so the wrapper is visually invisible. `pb-3` gives a clean seam so the
 * first control below doesn't kiss the visual's edge.
 *
 * Constraints met:
 *   - No nested scroll region — the page remains the single scroll axis.
 *   - Degrades gracefully when content is short (sticky has no effect until
 *     the element would scroll past its top anchor; no gap or clipping occurs).
 *   - 375px width: the wrapper is full-width with no min-width.
 *   - overscroll-behavior-y: contain on <body> is unaffected (no new scroller).
 *   - useReducedMotion is respected by each widget; this component is layout-only.
 *
 * Usage:
 *   <StickyVisual>
 *     <canvas … />
 *     <div>…live readout…</div>
 *   </StickyVisual>
 *   {interactive && <div>…sliders / buttons…</div>}
 */
export function StickyVisual({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sticky z-[5] bg-slate-50 pb-3"
      style={{ top: 'var(--sticky-visual-top, 56px)' }}
      data-sticky-visual
    >
      {children}
    </div>
  )
}
