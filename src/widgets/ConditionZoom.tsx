import { useEffect, useMemo, useRef, useState } from 'react'
import type { WidgetProps } from './registry'
import { DICE_EVENTS, type Outcome } from './diceEvents'

// L3 — Conditioning. The 36 two-dice outcomes live as glowing dots on a dark
// "focus stage". Conditioning on B physically throws away every dot where B
// didn't happen — they fly outward and fade — while the surviving B dots zoom up
// and repack to fill the frame, the matching ones (A∩B) grouped and bright. You
// watch the world shrink and the fraction regrow, denominator and all.

const FACES = [1, 2, 3, 4, 5, 6]

// Outcomes indexed a=1..6 across (column), b=1..6 down (row).
const OUTCOMES: Outcome[] = FACES.flatMap((b) => FACES.map((a) => [a, b] as Outcome))

const COLOR = {
  lit: '#818cf8', // in the target event — bright accent, glows
  dim: '#334155', // present but not in the target — muted slate
}

interface Dot {
  x: number
  y: number
  r: number
  a: number // alpha 0..1
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Eases a number toward a target whenever the target changes (cubic ease-out). */
function useEased(target: number, ms = 650): number {
  const [val, setVal] = useState(target)
  // Mirrors the latest displayed value, so an interrupted animation resumes from
  // exactly where it is. Rapid toggles always settle on the current target
  // instead of getting stuck at an intermediate value.
  const valRef = useRef(target)
  useEffect(() => {
    const from = valRef.current
    if (from === target) return
    if (prefersReducedMotion()) {
      valRef.current = target
      setVal(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - k, 3)
      const next = from + (target - from) * eased // k=1 → exactly target
      valRef.current = next
      setVal(next)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return val
}

export function ConditionZoom({ props, interactive = true, onParamChange }: WidgetProps) {
  const condition = DICE_EVENTS[(props?.condition as string) ?? 'firstDie6'] ?? DICE_EVENTS.firstDie6
  const target = DICE_EVENTS[(props?.target as string) ?? 'sumGte10'] ?? DICE_EVENTS.sumGte10

  const [conditioned, setConditioned] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displayedRef = useRef<Dot[] | null>(null)
  const rafRef = useRef<number>()

  const stats = useMemo(() => {
    let bCount = 0
    let aAndB = 0
    let aCount = 0
    for (const o of OUTCOMES) {
      const inB = condition.test(o)
      const inA = target.test(o)
      if (inA) aCount++
      if (inB) bCount++
      if (inA && inB) aAndB++
    }
    return { aCount, bCount, aAndB, pCond: bCount ? aAndB / bCount : 0 }
  }, [condition, target])

  // Packing order when conditioned: B-dots first, with A∩B grouped at the front
  // so the bright matches cluster together and "3 of 6" is countable at a glance.
  const conditionedOrder = useMemo(() => {
    // Survivors keep their natural outcome order so the line reads as the slice
    // lifted straight out of the grid (e.g. the first-die-6 outcomes, 6,1 … 6,6).
    const bIdx = OUTCOMES.map((o, i) => ({ o, i }))
      .filter(({ o }) => condition.test(o))
      .map(({ i }) => i)
    const slot = new Map<number, number>()
    bIdx.forEach((i, k) => slot.set(i, k))
    return slot
  }, [condition])

  const targetPct = (conditioned ? stats.pCond : stats.aCount / 36) * 100
  const shownPct = useEased(targetPct)
  const numerator = conditioned ? stats.aAndB : stats.aCount
  const denominator = conditioned ? stats.bCount : 36

  useEffect(() => {
    onParamChange?.('conditioned', conditioned ? 1 : 0)
  }, [conditioned, onParamChange])

  // Compute each dot's target {x,y,r,alpha} for the current canvas + state.
  const computeTargets = (cssW: number, cssH: number): Dot[] => {
    const pad = 14
    const plotW = cssW - 2 * pad
    const plotH = cssH - 2 * pad
    const cx = cssW / 2
    const cy = cssH / 2

    // Unconditioned: a centered 6×6 grid.
    const cell = Math.min(plotW, plotH) / 6
    const gridX = cx - (cell * 6) / 2
    const gridY = cy - (cell * 6) / 2

    // Conditioned: lift the survivors into a single zoomed-in horizontal line —
    // the slice of outcomes pulled straight out of the grid (e.g. 6,1 … 6,6).
    const n = Math.max(1, stats.bCount)
    const cellC = Math.min(plotW / n, plotH * 0.7)
    const lineX = cx - (cellC * n) / 2

    return OUTCOMES.map((_o, i) => {
      const col = i % 6
      const row = Math.floor(i / 6)
      const gx = gridX + (col + 0.5) * cell
      const gy = gridY + (row + 0.5) * cell

      if (!conditioned) {
        return { x: gx, y: gy, r: cell * 0.3, a: 1 }
      }

      const slot = conditionedOrder.get(i)
      if (slot === undefined) {
        // Dropped — fly outward from center and fade.
        const dx = gx - cx
        const dy = gy - cy
        const len = Math.hypot(dx, dy) || 1
        return { x: gx + (dx / len) * cssW, y: gy + (dy / len) * cssH, r: 0, a: 0 }
      }
      return {
        x: lineX + (slot + 0.5) * cellC,
        y: cy,
        r: cellC * 0.4,
        a: 1,
      }
    })
  }

  // Canvas render loop — eases dots toward their targets and draws the dark stage.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = prefersReducedMotion()

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

      const targets = computeTargets(cssW, cssH)
      if (!displayedRef.current || displayedRef.current.length !== targets.length) {
        displayedRef.current = targets.map((t) => ({ ...t }))
      }
      const disp = displayedRef.current

      let moving = false
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]
        const d = disp[i]
        const ease = reduced ? 1 : 0.18
        d.x += (t.x - d.x) * ease
        d.y += (t.y - d.y) * ease
        d.r += (t.r - d.r) * ease
        d.a += (t.a - d.a) * ease
        if (
          Math.abs(t.x - d.x) > 0.4 ||
          Math.abs(t.y - d.y) > 0.4 ||
          Math.abs(t.r - d.r) > 0.3 ||
          Math.abs(t.a - d.a) > 0.005
        )
          moving = true
      }

      // Draw dimmer dots first, bright (lit) dots last so glow sits on top.
      const drawDot = (i: number, lit: boolean) => {
        const d = disp[i]
        if (d.a <= 0.01 || d.r <= 0.1) return
        ctx.globalAlpha = Math.max(0, Math.min(1, d.a))
        ctx.fillStyle = lit ? COLOR.lit : COLOR.dim
        ctx.shadowBlur = lit ? 14 : 0
        ctx.shadowColor = lit ? COLOR.lit : 'transparent'
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fill()
      }
      OUTCOMES.forEach((o, i) => {
        if (!target.test(o)) drawDot(i, false)
      })
      OUTCOMES.forEach((o, i) => {
        if (target.test(o)) drawDot(i, true)
      })
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0

      if (moving && !reduced) rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditioned, condition, target, stats.bCount])

  return (
    <div className="space-y-4">
      <canvas
        ref={canvasRef}
        className="h-64 w-full rounded-2xl bg-ink ring-1 ring-slate-800"
        aria-label={`36 dice outcomes; ${
          conditioned ? `conditioned on ${condition.label}` : 'all outcomes shown'
        }`}
      />

      {interactive && (
        <button
          type="button"
          onClick={() => setConditioned((v) => !v)}
          data-testid="condition-toggle"
          className={`w-full cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold ring-1 transition-colors duration-200 ${
            conditioned ? 'bg-accent text-white ring-accent' : 'bg-white text-ink ring-slate-200'
          }`}
        >
          {conditioned
            ? `Conditioned on "${condition.label}" ✓ — tap to undo`
            : `Condition on: ${condition.label}`}
        </button>
      )}

      {/* Animated probability meter — the fraction grows as the world shrinks. */}
      <div className="rounded-2xl bg-accent/5 p-4 text-center ring-1 ring-accent/20">
        <p className="text-xs font-medium text-slate-500">
          {conditioned ? `P(${target.label} | ${condition.label})` : `P(${target.label})`}
        </p>
        <p className="text-4xl font-extrabold tabular-nums text-ink" data-testid="conditional-prob">
          {Math.round(shownPct)}%
        </p>
        <div className="mx-auto mt-2 h-3 max-w-xs overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-accent" style={{ width: `${shownPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500" data-testid="cond-fraction">
          <b className="text-ink">{numerator}</b> of <b className="text-ink">{denominator}</b> rolls
          {conditioned && (
            <span className="text-accent"> · the world shrank from 36 to {stats.bCount}</span>
          )}
        </p>
      </div>
    </div>
  )
}
