import { useCallback, useEffect, useRef, useState } from 'react'
import type { WidgetProps } from './registry'

// L2 — The Redundancy Bay. Two distinct experiences, picked by props.mode:
//
//   mode "compare" (default, the DEMO) — a FIXED side-by-side comparison the
//   learner just OBSERVES. The SAME ~1,000 flights fly through both designs:
//     LEFT  "Triple backup"   — 3 independent systems, each fails 1 in 10.
//                               P(all 3 fail) = 0.1^3 = 1/1,000  (catastrophe).
//     RIGHT "One tough system" — 1 system that fails 1 in 100.
//                               P(fail) = 1/100  (catastrophe).
//   Three mediocre independent backups land ~10x SAFER than one better single
//   system — redundancy MULTIPLIES, and the two grids make it visible.
//
//   mode "sandbox" (the EXPERIMENT) — the learner drives. They start with a
//   SINGLE plane and NO comparison, then drag sliders for the number of systems
//   (1–4) and the per-system failure rate, watching P(all fail) and P(at least
//   one fails) update live. A "Compare" toggle (off by default) reveals the
//   reference 1-in-100 plane beside their design.
//
// Both modes fly fleets as legible Canvas grids of plane glyphs at 60fps with
// devicePixelRatio, no-op when there's no 2D context (jsdom), honor
// prefers-reduced-motion, and report completion via flightsFlown = 1,000.

const FLEET = 1000
// Reveal the fleet over ~1s at 60fps; large enough step to stay brisk.
const REVEAL_STEP = 24

// The two fixed designs in the DEMO. Nothing here is user-adjustable.
const TRIPLE = { systems: 3, failureRate: 0.1 }
const SINGLE = { systems: 1, failureRate: 0.01 }

// Discrete per-system failure rates the SANDBOX slider snaps to, as "1 in N".
// Keeps the readout clean ("1 in 10") and the slider from landing on ugly odds.
const DENOMS = [2, 3, 5, 10, 20, 50, 100, 200, 500, 1000] as const

const C = {
  safe: '#10b981', // good — flight landed fine
  maint: '#f59e0b', // amber — diverted to maintenance (>=1 failed, not all)
  crash: '#f43f5e', // bad — every system failed
  smoke: '#64748b',
  skyTop: '#eef2f7',
  skyBottom: '#f8fafc',
  indigo: '#6366f1',
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Outcome per flight: 0 = safe, 1 = needed maintenance (>=1 failed, not all),
// 2 = crash (every system failed). Independent Bernoulli draw per system.
function flyFleet(n: number, systems: number, failureRate: number): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    let failed = 0
    for (let s = 0; s < systems; s++) if (Math.random() < failureRate) failed++
    out[i] = failed === systems ? 2 : failed > 0 ? 1 : 0
  }
  return out
}

// Percent formatter: keeps tiny catastrophe odds legible (0.001 -> "0.1%")
// while staying clean for the bigger OR numbers (0.271 -> "27.1%").
function fmtPct(p: number): string {
  const pct = p * 100
  if (pct <= 0) return '0%'
  if (pct >= 0.1) return `${pct.toFixed(1)}%`
  if (pct >= 0.001) return `${pct.toPrecision(2)}%`
  return `${pct.toExponential(1)}%`
}

// "1 in N" flavour for the rare catastrophe odds.
function oneIn(p: number): string {
  if (p <= 0) return '—'
  const n = Math.round(1 / p)
  return n >= 1000 ? `1 in ${n.toLocaleString()}` : `1 in ${n}`
}

// Count crashes (outcome === 2) among the first `flown` flights.
function countCrashes(outcomes: Uint8Array | null, flown: number): number {
  if (!outcomes) return 0
  let c = 0
  const upTo = Math.min(flown, outcomes.length)
  for (let i = 0; i < upTo; i++) if (outcomes[i] === 2) c++
  return c
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

// Snap an authored failure rate to the closest "1 in N" slider stop.
function nearestRateIndex(rate: number): number {
  const target = rate > 0 ? 1 / rate : 10
  let best = 0
  let bestDiff = Infinity
  DENOMS.forEach((d, i) => {
    const diff = Math.abs(d - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  })
  return best
}

// Shared fleet-reveal animation. Owns the single `flown` counter that drives
// every panel in lock-step, plus the `flying` flag. Honors reduced-motion by
// jumping straight to the full fleet. Guarded raf cleanup on unmount.
function useFleetReveal() {
  const [flown, setFlown] = useState(0)
  const [flying, setFlying] = useState(false)
  const rafRef = useRef<number>()

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    setFlying(false)
  }, [])

  useEffect(() => () => stop(), [stop])

  const reveal = useCallback(() => {
    if (prefersReducedMotion()) {
      setFlown(FLEET)
      setFlying(false)
      return
    }
    setFlown(0)
    setFlying(true)
    const tick = () => {
      setFlown((f) => {
        if (f >= FLEET) {
          stop()
          return FLEET
        }
        const next = Math.min(FLEET, f + REVEAL_STEP)
        if (next >= FLEET) stop()
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stop])

  return { flown, flying, reveal, setFlown }
}

export function RedundancyBay(props: WidgetProps) {
  const mode = props.props?.mode === 'sandbox' ? 'sandbox' : 'compare'
  return (
    <div data-testid="redundancy-bay" className="space-y-4">
      {mode === 'sandbox' ? <SandboxMode {...props} /> : <CompareMode {...props} />}
    </div>
  )
}

// ── mode "compare" — the fixed DEMO ────────────────────────────────────────
function CompareMode({ interactive = true, onParamChange, setScenario }: WidgetProps) {
  // Headline probabilities — computed synchronously from the fixed designs so
  // concept/test renders are correct on the very first frame (no canvas).
  const tripleCatastrophe = Math.pow(TRIPLE.failureRate, TRIPLE.systems)
  const singleCatastrophe = Math.pow(SINGLE.failureRate, SINGLE.systems)
  const safetyFactor = tripleCatastrophe > 0 ? singleCatastrophe / tripleCatastrophe : 0

  const [tripleOutcomes, setTripleOutcomes] = useState<Uint8Array | null>(null)
  const [singleOutcomes, setSingleOutcomes] = useState<Uint8Array | null>(null)
  const { flown, flying, reveal, setFlown } = useFleetReveal()

  // Static preview: when not interactive (e.g. the concept hook), render a
  // representative ALREADY-FLOWN final state instead of "Awaiting takeoff".
  useEffect(() => {
    if (interactive) return
    setTripleOutcomes(flyFleet(FLEET, TRIPLE.systems, TRIPLE.failureRate))
    setSingleOutcomes(flyFleet(FLEET, SINGLE.systems, SINGLE.failureRate))
    setFlown(FLEET)
  }, [interactive, setFlown])

  const tripleCrashes = countCrashes(tripleOutcomes, flown)
  const singleCrashes = countCrashes(singleOutcomes, flown)
  const flownComplete = !!(tripleOutcomes || singleOutcomes) && flown >= FLEET

  // Report completion the moment the whole fleet has flown (interactive only —
  // a static preview must never satisfy a gate it can't be driven by).
  useEffect(() => {
    if (interactive && flownComplete) onParamChange?.('flightsFlown', FLEET)
  }, [interactive, flownComplete, onParamChange])

  useEffect(() => {
    setScenario?.({ tripleCrashes, singleCrashes, flightsFlown: flown })
  }, [setScenario, tripleCrashes, singleCrashes, flown])

  const flyTheFleet = () => {
    if (flying) return
    setTripleOutcomes(flyFleet(FLEET, TRIPLE.systems, TRIPLE.failureRate))
    setSingleOutcomes(flyFleet(FLEET, SINGLE.systems, SINGLE.failureRate))
    reveal()
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Panel
          title="Triple backup"
          accent={C.safe}
          blurb={`${TRIPLE.systems} independent systems · each fails ${oneIn(TRIPLE.failureRate)}`}
          catastrophe={tripleCatastrophe}
          catastropheTestId="triple-catastrophe"
          outcomes={tripleOutcomes}
          flown={flown}
          crashes={tripleCrashes}
        />
        <Panel
          title="One tough system"
          accent={C.indigo}
          blurb={`${SINGLE.systems} system · fails ${oneIn(SINGLE.failureRate)}`}
          catastrophe={singleCatastrophe}
          catastropheTestId="single-catastrophe"
          outcomes={singleOutcomes}
          flown={flown}
          crashes={singleCrashes}
        />
      </div>

      {flownComplete && (
        <p className="text-center text-sm text-slate-600" aria-live="polite">
          Same {FLEET.toLocaleString()} flights, two designs:{' '}
          <span className="font-semibold text-emerald-600">{tripleCrashes}</span> crashed with the
          triple backup vs{' '}
          <span className="font-semibold" style={{ color: C.indigo }}>
            {singleCrashes}
          </span>{' '}
          with the single system. Three weak backups beat one strong one (~
          <span className="font-semibold text-ink">{Math.max(1, Math.round(safetyFactor))}×</span>{' '}
          safer).
        </p>
      )}

      {interactive && (
        <button type="button" onClick={flyTheFleet} disabled={flying} className="btn-primary w-full">
          {flying
            ? `Flying… ${flown.toLocaleString()} / ${FLEET.toLocaleString()}`
            : 'Fly the fleet'}
        </button>
      )}
    </>
  )
}

// ── mode "sandbox" — the EXPERIMENT ────────────────────────────────────────
function SandboxMode({ props, interactive = true, onParamChange, setScenario }: WidgetProps) {
  // Seed from authored props if present, else start with a SINGLE plane @ 1-in-10.
  const initSystems = clampInt(Number(props?.systems ?? 1), 1, 4)
  const initRateIdx = nearestRateIndex(Number(props?.failureRate ?? 0.1))

  const [systems, setSystems] = useState(initSystems)
  const [rateIdx, setRateIdx] = useState(initRateIdx)
  const [compare, setCompare] = useState(false)

  const [expOutcomes, setExpOutcomes] = useState<Uint8Array | null>(null)
  const [refOutcomes, setRefOutcomes] = useState<Uint8Array | null>(null)
  const { flown, flying, reveal, setFlown } = useFleetReveal()

  const rate = 1 / DENOMS[rateIdx]
  // Live readout — computed synchronously, never read back from the canvas.
  const catastrophe = Math.pow(rate, systems) // P(all fail)

  const refCatastrophe = Math.pow(SINGLE.failureRate, SINGLE.systems)

  const expCrashes = countCrashes(expOutcomes, flown)
  const refCrashes = countCrashes(refOutcomes, flown)
  const flownComplete = !!expOutcomes && flown >= FLEET

  useEffect(() => {
    if (interactive && flownComplete) onParamChange?.('flightsFlown', FLEET)
  }, [interactive, flownComplete, onParamChange])

  useEffect(() => {
    setScenario?.({ flightsFlown: flown, sandboxSystems: systems, sandboxCrashes: expCrashes })
  }, [setScenario, flown, systems, expCrashes])

  // Any knob change invalidates the displayed fleet — clear it back to the pad.
  const resetFleet = useCallback(() => {
    setExpOutcomes(null)
    setRefOutcomes(null)
    setFlown(0)
  }, [setFlown])

  const onSystems = (n: number) => {
    setSystems(clampInt(n, 1, 4))
    resetFleet()
  }
  const onRate = (i: number) => {
    setRateIdx(clampInt(i, 0, DENOMS.length - 1))
    resetFleet()
  }
  const onToggleCompare = () => {
    setCompare((c) => !c)
    resetFleet()
  }

  const flyTheFleet = () => {
    if (flying) return
    setExpOutcomes(flyFleet(FLEET, systems, rate))
    setRefOutcomes(compare ? flyFleet(FLEET, SINGLE.systems, SINGLE.failureRate) : null)
    reveal()
  }

  return (
    <>
      <div className={`grid grid-cols-1 gap-3 ${compare ? 'sm:grid-cols-2' : ''}`}>
        <Panel
          title="Your design"
          accent={C.indigo}
          blurb={`${systems} ${systems === 1 ? 'system' : 'systems'} · each fails ${oneIn(rate)}`}
          catastrophe={catastrophe}
          catastropheTestId="catastrophe-prob"
          outcomes={expOutcomes}
          flown={flown}
          crashes={expCrashes}
        />
        {compare && (
          <Panel
            title="One tough system"
            accent={C.safe}
            blurb={`${SINGLE.systems} system · fails ${oneIn(SINGLE.failureRate)}`}
            catastrophe={refCatastrophe}
            catastropheTestId="ref-catastrophe"
            outcomes={refOutcomes}
            flown={flown}
            crashes={refCrashes}
          />
        )}
      </div>

      {interactive && (
        <div className="space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
          {/* Number of independent systems. */}
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Backup systems</span>
              <span className="font-semibold tabular-nums text-ink">{systems}</span>
            </div>
            <input
              type="range"
              className="range mt-1"
              min={1}
              max={4}
              step={1}
              value={systems}
              onChange={(e) => onSystems(Number(e.target.value))}
              aria-label="Number of independent backup systems"
              data-testid="systems-slider"
            />
          </div>

          {/* Per-system failure rate, snapped to clean "1 in N" stops. */}
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Each system fails</span>
              <span className="font-semibold tabular-nums text-ink">{oneIn(rate)}</span>
            </div>
            <input
              type="range"
              className="range mt-1"
              min={0}
              max={DENOMS.length - 1}
              step={1}
              value={rateIdx}
              onChange={(e) => onRate(Number(e.target.value))}
              aria-label="Per-system failure rate"
              data-testid="rate-slider"
            />
            <div className="mt-0.5 flex justify-between text-[10px] text-slate-400">
              <span>1 in 2 (often)</span>
              <span>1 in 1,000 (rare)</span>
            </div>
          </div>

          {/* Compare toggle — OFF by default. */}
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">Compare against one 1-in-100 system</span>
            <button
              type="button"
              role="switch"
              aria-checked={compare}
              onClick={onToggleCompare}
              data-testid="compare-toggle"
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                compare ? 'bg-accent' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  compare ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </label>

          <button
            type="button"
            onClick={flyTheFleet}
            disabled={flying}
            className="btn-primary w-full"
          >
            {flying
              ? `Flying… ${flown.toLocaleString()} / ${FLEET.toLocaleString()}`
              : 'Fly the fleet'}
          </button>
        </div>
      )}
    </>
  )
}

function Panel({
  title,
  accent,
  blurb,
  catastrophe,
  catastropheTestId,
  outcomes,
  flown,
  crashes,
}: {
  title: string
  accent: string
  blurb: string
  catastrophe: number
  catastropheTestId: string
  outcomes: Uint8Array | null
  flown: number
  crashes: number
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="text-2xl font-bold tabular-nums text-rose-600">{crashes}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{blurb}</p>

      <FleetGrid outcomes={outcomes} flown={flown} accent={accent} />

      <dl className="mt-2 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">P(all systems fail) — crash</dt>
          <dd className="font-semibold text-rose-600" data-testid={catastropheTestId}>
            {fmtPct(catastrophe)}
          </dd>
        </div>
      </dl>
    </div>
  )
}

// Canvas fleet: each flight is a small rounded cell laid out in a neat,
// near-square grid that fills in as the fleet flies. safe = green,
// maintenance = amber, crash = red. Guarded so it no-ops when there's no 2D
// context (jsdom). Honors prefers-reduced-motion via the parent jumping
// `flown` straight to FLEET (no per-frame work here).
function FleetGrid({
  outcomes,
  flown,
  accent,
}: {
  outcomes: Uint8Array | null
  flown: number
  accent: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return // jsdom / unsupported — no-op

    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth || 280
    const cssH = canvas.clientHeight || 300
    canvas.width = Math.max(1, Math.round(cssW * dpr))
    canvas.height = Math.max(1, Math.round(cssH * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Sky backdrop.
    const grad = ctx.createLinearGradient(0, 0, 0, cssH)
    grad.addColorStop(0, C.skyTop)
    grad.addColorStop(1, C.skyBottom)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, cssW, cssH)

    if (!outcomes || flown === 0) {
      ctx.fillStyle = accent
      ctx.globalAlpha = 0.5
      ctx.font = '11px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Awaiting takeoff', cssW / 2, cssH / 2)
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'
      return
    }

    // Near-square grid that fills the box: pick the column count that best
    // matches the canvas aspect ratio so cells stay roughly square.
    const pad = 6
    const innerW = cssW - 2 * pad
    const innerH = cssH - 2 * pad
    const ratio = innerW / Math.max(1, innerH)
    const cols = Math.max(1, Math.round(Math.sqrt(FLEET * ratio)))
    const rows = Math.ceil(FLEET / cols)
    const cw = innerW / cols
    const ch = innerH / rows
    // Filled cell with a small gap so the grid reads as discrete squares.
    const cell = Math.min(cw, ch)
    const size = Math.max(1, cell - Math.max(0.5, cell * 0.18))
    const r = Math.min(size * 0.28, 2)

    const upTo = Math.min(flown, FLEET)
    for (let i = 0; i < upTo; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = pad + col * cw + (cw - size) / 2
      const y = pad + row * ch + (ch - size) / 2
      const o = outcomes[i]
      ctx.fillStyle = o === 2 ? C.crash : o === 1 ? C.maint : C.safe
      roundRect(ctx, x, y, size, size, r)
      ctx.fill()
    }
  }, [outcomes, flown, accent])

  return (
    <canvas
      ref={ref}
      className="mt-2 h-72 w-full rounded-xl ring-1 ring-slate-200"
      aria-label="A fleet of flights as a grid; green landed safely, amber diverted to maintenance, red crashed"
    />
  )
}

// Rounded-rectangle path helper (roundRect isn't available in all canvases).
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
