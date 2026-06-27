import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WidgetProps } from './registry'

// L4 - THE SCREENING CLINIC. 1,000 people take a test that's "99% accurate".
// They settle into ONE tidy grid, sorted by test result: the few who are truly
// sick AND flagged (true positives, rose) sit first, then the much larger pile
// of healthy people the test false-flagged (false positives, amber), then
// everyone who tested negative (slate). A live readout answers the worried
// patient's question - "of everyone who tested positive, how many are actually
// sick?" - and with a rare disease the rose is buried under the amber.

const POP = 1000
const COLS = 40
const ROWS = 25 // COLS * ROWS === POP
const ASPECT = ROWS / COLS // square cells -> canvas height / width

// Literal colours for the canvas grid.
const C_TRUE_POS = '#f43f5e' // sick AND flagged - the real ones (rose)
const C_FALSE_POS = '#f59e0b' // healthy but flagged - the false alarms (amber)
const C_NEG = '#e2e8f0' // everyone who tested negative (slate)

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Counts {
  sick: number
  tp: number
  fn: number
  healthy: number
  fp: number
  tn: number
  positives: number
  ppv: number
}

function computeCounts(prevalence: number, sensitivity: number, falsePositive: number): Counts {
  const sick = Math.round(POP * prevalence)
  const tp = Math.round(sick * sensitivity)
  const fn = sick - tp
  const healthy = POP - sick
  const fp = Math.round(healthy * falsePositive)
  const tn = healthy - fp
  const positives = tp + fp
  const ppv = positives > 0 ? tp / positives : 0
  return { sick, tp, fn, healthy, fp, tn, positives, ppv }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

// Blend two hex colours (#rrggbb) by t in [0,1].
function mix(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16)
  const bh = parseInt(b.slice(1), 16)
  const ar = (ah >> 16) & 255
  const ag = (ah >> 8) & 255
  const ab = ah & 255
  const br = (bh >> 16) & 255
  const bg = (bh >> 8) & 255
  const bb = bh & 255
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `rgb(${r},${g},${bl})`
}

export function ScreeningClinic({
  props,
  interactive = true,
  onParamChange,
  scenario,
  setScenario,
}: WidgetProps) {
  // Seed from the shared scenario world when present, else from authored props.
  const seed = (key: string, fallback: number) =>
    (scenario?.[key] as number) ?? (props?.[key] as number) ?? fallback

  const [prevalence, setPrevalence] = useState(() => seed('prevalence', 0.001))
  const [sensitivity, setSensitivity] = useState(() => seed('sensitivity', 0.99))
  const [falsePositive, setFalsePositive] = useState(() => seed('falsePositive', 0.05))

  const counts = useMemo(
    () => computeCounts(prevalence, sensitivity, falsePositive),
    [prevalence, sensitivity, falsePositive],
  )
  const pct = Math.round(counts.ppv * 100)

  // Publish live headline numbers back to the shared world so the story steps
  // reflect the same clinic. Guarded so standalone (test) renders never crash.
  useEffect(() => {
    if (!setScenario) return
    setScenario({
      prevalence,
      sensitivity,
      falsePositive,
      ppv: counts.ppv,
      tp: counts.tp,
      fp: counts.fp,
      positives: counts.positives,
    })
  }, [setScenario, prevalence, sensitivity, falsePositive, counts.ppv, counts.tp, counts.fp, counts.positives])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>()
  const startRef = useRef(0)
  // Start "animating" in interactive mode so the idle redraw doesn't paint the
  // final grid for one frame before the entrance flood plays.
  const animatingRef = useRef(interactive)
  const ranRef = useRef(false)
  const drawRef = useRef<(appearT: number, revealT: number) => void>(() => {})

  // Draw the single grid at a given appear progress (0..1, dots flood/settle in
  // sorted order) and reveal progress (0..1, true positives turn amber->rose).
  // No-ops cleanly when there's no canvas/context (jsdom in tests).
  const drawScene = useCallback(
    (appearT: number, revealT: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const cssW = canvas.clientWidth
      if (!cssW) return
      // In fit layout the canvas has an explicit container height; use it.
      // Fall back to the aspect-ratio derivation when clientHeight is zero (jsdom).
      const cssH = canvas.clientHeight > 0 ? canvas.clientHeight : cssW * ASPECT

      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
        canvas.style.height = `${cssH}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)

      const padX = cssW * 0.012
      const padY = cssH * 0.02
      const cellW = (cssW - padX * 2) / COLS
      const cellH = (cssH - padY * 2) / ROWS
      const cell = Math.min(cellW, cellH)
      const dot = cell * 0.7
      const corner = dot * 0.32

      const { tp, fp } = counts
      const stagger = 0.55 // share of the flood spent staggering dots in

      for (let i = 0; i < POP; i++) {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const cx = padX + (col + 0.5) * cellW
        const cy = padY + (row + 0.5) * cellH

        // Stagger by sort order: rose, then amber, then slate flood in.
        const offset = i / POP
        const local = Math.max(0, Math.min(1, appearT * (1 + stagger) - offset * stagger))
        if (local <= 0) continue
        const s = easeInOut(local)
        const size = dot * s

        let color: string
        if (i < tp)
          color = mix(C_FALSE_POS, C_TRUE_POS, revealT) // flagged amber, reveal turns it rose
        else if (i < tp + fp) color = C_FALSE_POS
        else color = C_NEG

        ctx.globalAlpha = local
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(cx - size / 2, cy - size / 2, size, size, corner * s)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
    [counts],
  )

  useEffect(() => {
    drawRef.current = drawScene
  }, [drawScene])

  const stopAnim = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    animatingRef.current = false
  }, [])

  // Idle redraw: the settled grid, recolouring live as sliders move. Skipped
  // while the entrance animation owns the canvas.
  useEffect(() => {
    if (animatingRef.current) return
    drawScene(1, 1)
  }, [drawScene])

  // Play the tasteful entrance: the pile floods in amber, then the few real
  // cases reveal as rose. Reduced motion jumps straight to the final grid.
  const play = useCallback(() => {
    if (prefersReducedMotion()) {
      stopAnim()
      drawRef.current(1, 1)
      return
    }

    const SETTLE_MS = 1100
    const HOLD_MS = 300
    const REVEAL_MS = 900
    const TOTAL = SETTLE_MS + HOLD_MS + REVEAL_MS

    stopAnim()
    animatingRef.current = true
    startRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()

    const frame = (now: number) => {
      const elapsed = now - startRef.current
      let appearT: number
      let revealT: number
      if (elapsed < SETTLE_MS) {
        appearT = elapsed / SETTLE_MS
        revealT = 0
      } else if (elapsed < SETTLE_MS + HOLD_MS) {
        appearT = 1
        revealT = 0
      } else if (elapsed < TOTAL) {
        appearT = 1
        revealT = easeInOut((elapsed - SETTLE_MS - HOLD_MS) / REVEAL_MS)
      } else {
        appearT = 1
        revealT = 1
      }
      drawRef.current(appearT, revealT)
      if (elapsed >= TOTAL) {
        stopAnim()
        return
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
  }, [stopAnim])

  // Play the entrance once on mount (interactive only). Static previews just
  // paint the final grid via the idle redraw.
  useEffect(() => {
    if (!interactive) {
      animatingRef.current = false
      drawRef.current(1, 1)
      return
    }
    play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the scene crisp on resize.
  useEffect(() => {
    const onResize = () => {
      if (!animatingRef.current) drawRef.current(1, 1)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => () => stopAnim(), [stopAnim])

  // Completion fires on the learner's first slider interaction, so there's no
  // separate "run" step (or replay control) to satisfy.
  const fireRan = useCallback(() => {
    if (ranRef.current) return
    ranRef.current = true
    onParamChange?.('ran', 1)
  }, [onParamChange])

  const onSlider = useCallback(
    (set: (v: number) => void) => (v: number) => {
      set(v)
      fireRan()
    },
    [fireRan],
  )

  return (
    <div data-testid="screening-clinic" className="flex h-full min-h-0 flex-col gap-2">
      {/* header band - shrink-0 */}
      <div className="shrink-0 flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold">
        <span className="text-slate-600">1,000 people screened</span>
        <span className="text-slate-400">sorted by test result</span>
      </div>

      {/* canvas area - flex-1 min-h-0, canvas fills it */}
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="h-full w-full rounded-2xl bg-slate-50 ring-1 ring-slate-100"
          aria-label="A grid of 1,000 people sorted by test result: true positives in rose, false positives in amber, negatives in slate"
        />
      </div>

      {/* PPV callout - shrink-0, compact version */}
      <div className="shrink-0 rounded-2xl bg-accent/10 px-4 py-2 text-center ring-1 ring-accent/30">
        <p className="text-xs text-slate-600">Of everyone who tested positive...</p>
        <p className="text-3xl font-extrabold text-ink" data-testid="ppv">
          {pct}%
        </p>
        <p className="text-xs text-slate-600">actually have the disease</p>
        <p className="mt-1 text-xs tabular-nums text-slate-500">
          <span className="text-rose-500">&#x25CF;</span> {counts.tp} true positive
          {counts.tp === 1 ? '' : 's'}
          <span className="mx-1.5 text-slate-300">&#xB7;</span>
          <span className="text-amber-500">&#x25CF;</span> {counts.fp} false positive
          {counts.fp === 1 ? '' : 's'}
        </p>
      </div>

      {interactive && (
        <div className="shrink-0 space-y-2">
          <p className="text-xs text-slate-500">Drag the sliders to set the scenario.</p>
          <Slider
            label="How rare is the disease?"
            value={prevalence}
            min={0.001}
            max={0.5}
            step={0.001}
            display={`${(prevalence * 100).toFixed(1)}%`}
            onChange={onSlider(setPrevalence)}
            testid="prevalence"
          />
          <Slider
            label="How good is the test at catching it?"
            value={sensitivity}
            min={0.5}
            max={1}
            step={0.01}
            display={`${Math.round(sensitivity * 100)}%`}
            onChange={onSlider(setSensitivity)}
            testid="sensitivity"
          />
          <Slider
            label="How often does it false-alarm?"
            value={falsePositive}
            min={0}
            max={0.2}
            step={0.005}
            display={`${(falsePositive * 100).toFixed(1)}%`}
            onChange={onSlider(setFalsePositive)}
            testid="false-positive"
          />
        </div>
      )}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  testid,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
  testid: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{display}</span>
      </div>
      <input
        type="range"
        className="range mt-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={`slider-${testid}`}
        aria-label={label}
      />
    </div>
  )
}
