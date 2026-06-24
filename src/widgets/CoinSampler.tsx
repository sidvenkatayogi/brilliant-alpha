import { useEffect, useMemo, useRef, useState } from 'react'
import type { WidgetProps } from './registry'

// L1 — Chance & the Long Run.
// A slider drives the number of trials; live bars show the empirical frequency
// of each face converging toward the true 1/sides probability as trials grow.
// The underlying random sequence is generated ONCE and simply extended as the
// slider moves, so increasing trials is literally "running the experiment
// longer" — the bars settle rather than jump, which is the whole lesson.

function makeRolls(count: number, sides: number): number[] {
  const rolls = new Array<number>(count)
  for (let i = 0; i < count; i++) {
    rolls[i] = Math.floor(Math.random() * sides)
  }
  return rolls
}

export function CoinSampler({ props, interactive = true, onParamChange }: WidgetProps) {
  const sides = (props?.sides as number) ?? 6
  const minTrials = (props?.minTrials as number) ?? 10
  const maxTrials = (props?.maxTrials as number) ?? 10_000

  const [trials, setTrials] = useState(minTrials)
  // Stable random sequence for the whole session of this widget instance.
  const [seq, setSeq] = useState(() => makeRolls(maxTrials, sides))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Animated bar heights (eased toward the true counts for a live feel).
  const displayed = useRef<number[]>(new Array(sides).fill(1 / sides))
  const rafRef = useRef<number>()

  // Empirical proportion of each face over the first `trials` rolls.
  const counts = useMemo(() => {
    const c = new Array<number>(sides).fill(0)
    for (let i = 0; i < trials; i++) c[seq[i]]++
    return c
  }, [trials, seq, sides])

  const trueP = 1 / sides

  useEffect(() => {
    onParamChange?.('trials', trials)
  }, [trials, onParamChange])

  // Canvas render loop — eases displayed bars toward target proportions at 60fps.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const cssW = canvas.clientWidth
      const cssH = canvas.clientHeight
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr
        canvas.height = cssH * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)

      const target = counts.map((c) => (trials > 0 ? c / trials : 0))
      // Ease current heights toward targets.
      let moving = false
      for (let i = 0; i < sides; i++) {
        const d = target[i] - displayed.current[i]
        if (Math.abs(d) > 0.0005) moving = true
        displayed.current[i] += d * 0.18
      }

      const padL = 8
      const padR = 8
      const padB = 24
      const padT = 8
      const plotW = cssW - padL - padR
      const plotH = cssH - padT - padB
      // Scale so the true-probability line sits at ~55% height with headroom.
      const yMax = Math.max(trueP * 2.2, ...displayed.current, 0.0001)
      const barW = (plotW / sides) * 0.7
      const gap = (plotW / sides) * 0.3

      // True-probability reference line.
      const yTrue = padT + plotH - (trueP / yMax) * plotH
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 5])
      ctx.beginPath()
      ctx.moveTo(padL, yTrue)
      ctx.lineTo(cssW - padR, yTrue)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#64748b'
      ctx.font = '11px ui-sans-serif, system-ui'
      ctx.fillText(`true ${(trueP * 100).toFixed(1)}%`, padL, yTrue - 5)

      // Bars.
      for (let i = 0; i < sides; i++) {
        const h = (displayed.current[i] / yMax) * plotH
        const x = padL + i * (barW + gap) + gap / 2
        const y = padT + plotH - h
        const off = Math.abs(displayed.current[i] - trueP) / trueP
        // Closer to true probability → greener; far off → indigo.
        ctx.fillStyle = off < 0.15 ? '#10b981' : '#6366f1'
        ctx.beginPath()
        ctx.roundRect(x, y, barW, h, 4)
        ctx.fill()

        ctx.fillStyle = '#475569'
        ctx.font = '11px ui-sans-serif, system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), x + barW / 2, cssH - 8)
        ctx.textAlign = 'left'
      }

      if (moving) {
        rafRef.current = requestAnimationFrame(draw)
      }
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [counts, trials, sides, trueP])

  const reset = () => {
    setSeq(makeRolls(maxTrials, sides))
    setTrials(minTrials)
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className="h-48 w-full rounded-xl bg-slate-50 ring-1 ring-slate-100"
        aria-label={`Frequency of each of ${sides} faces over ${trials} trials`}
      />
      <div className="flex items-center justify-between text-sm font-medium text-slate-600">
        <span>Trials</span>
        <span className="tabular-nums font-semibold text-ink" data-testid="trial-count">
          {trials.toLocaleString()}
        </span>
      </div>
      {interactive && (
        <>
          <input
            type="range"
            className="range"
            min={minTrials}
            max={maxTrials}
            // Log-ish feel: linear is fine but step large for performance.
            step={Math.max(1, Math.round(maxTrials / 1000))}
            value={trials}
            onChange={(e) => setTrials(Number(e.target.value))}
            aria-label="Number of trials"
            data-testid="trials-slider"
          />
          <div className="flex justify-between">
            <button className="btn-ghost text-sm" onClick={reset} type="button">
              New experiment
            </button>
            <button
              className="btn-ghost text-sm"
              onClick={() => setTrials(maxTrials)}
              type="button"
            >
              Run to {maxTrials.toLocaleString()}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
