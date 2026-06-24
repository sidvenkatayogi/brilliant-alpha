import { useEffect, useRef, useState } from 'react'
import type { WidgetProps } from './registry'

// L2 — Combining events as AREA. The dark square is all outcomes (area = 1).
// Event A is a vertical band of width P(A); event B a horizontal band of height
// P(B). Drag the corner to resize both.
//   mode 'and' → the intersection rectangle IS P(A)·P(B): AND = multiply, as a shape.
//   mode 'or'  → the union L-shape is P(A)+P(B) minus the overlap you'd double-count.
// "Rain" drops random points and the live tally converges to the true area —
// the long-run idea from Lesson 1, reused here.

type Mode = 'and' | 'or'

// Four disjoint regions tile the square, each a clearly distinct hue so A, B,
// and the overlap never blur together: A = indigo, B = emerald, both = amber.
const COLOR = {
  aOnly: 'rgba(99,102,241,0.50)', // A only — indigo
  bOnly: 'rgba(16,185,129,0.50)', // B only — emerald
  bothAnd: 'rgba(245,158,11,0.78)', // overlap, emphasized in AND mode
  bothOr: 'rgba(245,158,11,0.55)', // overlap in OR mode (the slice to subtract)
  neither: 'rgba(30,41,59,0.55)', // neither — muted slate
  aText: '#c7d2fe',
  bText: '#6ee7b7',
  bothText: '#fcd34d',
  dotBoth: '#fde047', // vivid amber-yellow on the amber overlap
  dotA: '#c4b5fd', // vivid violet on the indigo band
  dotB: '#34d399', // vivid emerald on the green band
  dotNeither: '#e2e8f0', // bright slate on the dark "neither" region
  dotStroke: 'rgba(2,6,23,0.55)',
  handle: '#f59e0b',
}

const clamp = (v: number) => Math.max(0.05, Math.min(0.95, v))
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Draws a small rounded label chip with centered text, clamped onto the canvas. */
function chip(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
  cssW: number,
  cssH: number,
) {
  ctx.font = '600 12px ui-sans-serif, system-ui'
  const w = ctx.measureText(text).width + 14
  const h = 20
  const x = clampN(cx, w / 2 + 2, cssW - w / 2 - 2) - w / 2
  const y = clampN(cy, h / 2 + 2, cssH - h / 2 - 2) - h / 2
  ctx.fillStyle = 'rgba(15,23,42,0.82)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 6)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + h / 2 + 0.5)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

interface Drop {
  x: number
  y: number
}

export function ProbabilityArea({ props, interactive = true, onParamChange }: WidgetProps) {
  const mode = ((props?.mode as Mode) ?? 'and') as Mode
  const [pA, setPA] = useState((props?.pA as number) ?? 0.5)
  const [pB, setPB] = useState((props?.pB as number) ?? 0.4)
  const [drops, setDrops] = useState<Drop[]>([])
  const [raining, setRaining] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const rainRef = useRef<number>()

  const pAnd = pA * pB
  const pOr = pA + pB - pAnd

  // Empirical tally from the rain (the long-run check).
  const total = drops.length
  const inBoth = drops.filter((d) => d.x < pA && d.y < pB).length
  const inUnion = drops.filter((d) => d.x < pA || d.y < pB).length
  const empirical = total === 0 ? null : (mode === 'and' ? inBoth : inUnion) / total

  useEffect(() => {
    onParamChange?.('rainDrops', total)
  }, [total, onParamChange])

  // Draw the stage whenever geometry, mode, or the rain changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const ax = pA * cssW
    const by = pB * cssH

    // Base square (the "neither" region underneath everything).
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, cssW, cssH)
    ctx.fillStyle = COLOR.neither
    ctx.fillRect(0, 0, cssW, cssH)

    // Four disjoint regions — solid and distinctly coloured, no muddy blend.
    ctx.fillStyle = COLOR.aOnly // A only: left column, below the overlap
    ctx.fillRect(0, by, ax, cssH - by)
    ctx.fillStyle = COLOR.bOnly // B only: top row, right of the overlap
    ctx.fillRect(ax, 0, cssW - ax, by)

    // The overlap (top-left) — the teaching shape.
    ctx.save()
    if (mode === 'and') {
      ctx.shadowBlur = 18
      ctx.shadowColor = '#f59e0b'
    }
    ctx.fillStyle = mode === 'and' ? COLOR.bothAnd : COLOR.bothOr
    ctx.fillRect(0, 0, ax, by)
    ctx.restore()

    if (mode === 'or') {
      // Mark the overlap as the slice that gets double-counted (subtract once).
      // Clip to the overlap rectangle so the diagonals stay inside A∩B.
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, ax, by)
      ctx.clip()
      ctx.strokeStyle = 'rgba(15,23,42,0.55)'
      ctx.lineWidth = 1
      for (let x = -by; x < ax; x += 8) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + by, by)
        ctx.stroke()
      }
      ctx.restore()
      ctx.strokeStyle = '#fcd34d'
      ctx.lineWidth = 2
      ctx.strokeRect(0.5, 0.5, ax, by)
      // Union outline so "at least one" reads as a single L-shape.
      ctx.strokeStyle = 'rgba(226,232,240,0.65)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, cssH)
      ctx.lineTo(0, 0)
      ctx.lineTo(cssW, 0)
      ctx.lineTo(cssW, by)
      ctx.lineTo(ax, by)
      ctx.lineTo(ax, cssH)
      ctx.closePath()
      ctx.stroke()
    } else {
      ctx.strokeStyle = '#fcd34d'
      ctx.lineWidth = 2
      ctx.strokeRect(0.5, 0.5, ax, by)
    }

    // Rain dots — drawn before the labels so the chips stay readable on top.
    ctx.lineWidth = 0.6
    ctx.strokeStyle = COLOR.dotStroke
    for (const d of drops) {
      const inA = d.x < pA
      const inB = d.y < pB
      ctx.fillStyle =
        inA && inB ? COLOR.dotBoth : inA ? COLOR.dotA : inB ? COLOR.dotB : COLOR.dotNeither
      ctx.globalAlpha = 0.95
      ctx.beginPath()
      ctx.arc(d.x * cssW, d.y * cssH, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Region labels (on top of the dots) so you can always tell which band is which.
    if (cssH - by > 24) chip(ctx, `A · ${Math.round(pA * 100)}%`, ax / 2, by + (cssH - by) / 2, COLOR.aText, cssW, cssH)
    if (cssW - ax > 46) chip(ctx, `B · ${Math.round(pB * 100)}%`, ax + (cssW - ax) / 2, by / 2, COLOR.bText, cssW, cssH)
    if (ax > 60 && by > 26)
      chip(ctx, `A and B · ${Math.round(pAnd * 100)}%`, ax / 2, by / 2, COLOR.bothText, cssW, cssH)

    // Corner drag handle at (P(A), P(B)).
    ctx.fillStyle = '#ffffff'
    ctx.shadowBlur = 10
    ctx.shadowColor = COLOR.handle
    ctx.beginPath()
    ctx.arc(ax, by, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = COLOR.handle
    ctx.beginPath()
    ctx.arc(ax, by, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }, [pA, pB, mode, drops])

  const setFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPA(clamp((e.clientX - rect.left) / rect.width))
    setPB(clamp((e.clientY - rect.top) / rect.height))
  }

  const startRain = () => {
    if (raining) return
    setDrops([])
    setRaining(true)
    const N = 600
    const reduced = prefersReducedMotion()
    if (reduced) {
      const all = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random() }))
      setDrops(all)
      setRaining(false)
      return
    }
    const step = () => {
      setDrops((prev) => {
        if (prev.length >= N) {
          setRaining(false)
          return prev
        }
        const batch = Array.from({ length: 12 }, () => ({ x: Math.random(), y: Math.random() }))
        return [...prev, ...batch]
      })
      rainRef.current = requestAnimationFrame(step)
    }
    rainRef.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    return () => {
      if (rainRef.current) cancelAnimationFrame(rainRef.current)
    }
  }, [])

  // Stop the rAF loop once we've reached the cap.
  useEffect(() => {
    if (drops.length >= 600 && rainRef.current) {
      cancelAnimationFrame(rainRef.current)
      setRaining(false)
    }
  }, [drops.length])

  const clearRain = () => {
    if (rainRef.current) cancelAnimationFrame(rainRef.current)
    setRaining(false)
    setDrops([])
  }

  const isAnd = mode === 'and'

  return (
    <div className="space-y-4">
      <canvas
        ref={canvasRef}
        onPointerDown={
          interactive
            ? (e) => {
                dragging.current = true
                e.currentTarget.setPointerCapture(e.pointerId)
                setFromPointer(e)
              }
            : undefined
        }
        onPointerMove={
          interactive
            ? (e) => {
                if (dragging.current) setFromPointer(e)
              }
            : undefined
        }
        onPointerUp={interactive ? () => (dragging.current = false) : undefined}
        className={`mx-auto aspect-square w-full max-w-xs rounded-2xl bg-ink ring-1 ring-slate-800 ${
          interactive ? 'cursor-pointer touch-none' : ''
        }`}
        aria-label={
          isAnd
            ? 'Probability as area: the intersection rectangle is P(A) times P(B)'
            : 'Probability as area: the union L-shape is P(A) plus P(B) minus the overlap'
        }
      />

      {/* Legend tying each region colour to its meaning. */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <LegendSwatch color="bg-accent" label="A only" />
        <LegendSwatch color="bg-good" label="B only" />
        <LegendSwatch color="bg-amber-400" label="A and B" />
      </div>

      {/* The headline equation for the active mode. */}
      <div className="rounded-xl bg-slate-50 p-3 text-center text-sm ring-1 ring-slate-100">
        {isAnd ? (
          <p>
            <span className="text-slate-500">P(A and B) = </span>
            <b className="text-accent" data-testid="p-a">
              {Math.round(pA * 100)}%
            </b>
            <span className="text-slate-400"> × </span>
            <b className="text-good" data-testid="p-b">
              {Math.round(pB * 100)}%
            </b>
            <span className="text-slate-400"> = </span>
            <b className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700" data-testid="p-and">
              {Math.round(pAnd * 100)}%
            </b>
          </p>
        ) : (
          <p>
            <span className="text-slate-500">P(A or B) = </span>
            <b className="text-accent" data-testid="p-a">
              {Math.round(pA * 100)}%
            </b>
            <span className="text-slate-400"> + </span>
            <b className="text-good" data-testid="p-b">
              {Math.round(pB * 100)}%
            </b>
            <span className="text-slate-400"> − </span>
            <b className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700" data-testid="p-and">
              {Math.round(pAnd * 100)}%
            </b>
            <span className="text-slate-400"> = </span>
            <b className="text-ink" data-testid="p-or">
              {Math.round(pOr * 100)}%
            </b>
          </p>
        )}
        {empirical !== null && (
          <p className="mt-1 text-xs text-slate-500" data-testid="rain-tally">
            Rain so far: <b className="text-ink">{Math.round(empirical * 100)}%</b> of {total} dots
            landed in the {isAnd ? 'overlap' : 'union'} — converging on{' '}
            {Math.round((isAnd ? pAnd : pOr) * 100)}%.
          </p>
        )}
      </div>

      {interactive && (
        <div className="space-y-3">
          <Slider label="P(A) — width of the blue band" value={pA} onChange={setPA} testid="pa" />
          <Slider label="P(B) — height of the green band" value={pB} onChange={setPB} testid="pb" />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost flex-1 cursor-pointer text-sm"
              onClick={startRain}
              disabled={raining}
              data-testid="rain"
            >
              {raining ? 'Raining…' : 'Rain 600 outcomes'}
            </button>
            <button
              type="button"
              className="flex-1 cursor-pointer rounded-full px-3 py-1.5 text-sm text-slate-400 transition-colors duration-200 hover:text-ink"
              onClick={clearRain}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  )
}

function Slider({
  label,
  value,
  onChange,
  testid,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  testid: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        className="range mt-1"
        min={0.05}
        max={0.95}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={`slider-${testid}`}
        aria-label={label}
      />
    </div>
  )
}
