import { useEffect, useRef, useState } from 'react'
import type { WidgetProps } from './registry'

// L1 — THE INSURANCE DESK. The learner runs a small-town car-insurance company.
// The thing they manipulate IS the business: how many drivers they sign up.
// Each year, every driver crashes at the true rate (~5%); you collect a premium
// from everyone and pay out on each crash. At 10 drivers the bank account is a
// roller-coaster — one bad year of crashes can wipe you out even though every
// premium is profitable on average. Grow to thousands and the same math goes
// near-flat and reliably profitable. That FELT gap is the law of large numbers.

const TRAJECTORY_YEARS = 20
// Cap simultaneous crash bursts so a 5,000-driver year stays at 60fps. Crashes
// beyond this are still counted in the ledger — we just flash a representative
// sample of rooftops.
const MAX_BURSTS = 200

// Canvas literals — kept in sync with the Tailwind palette.
const ROOF = '#94a3b8'
const WALL = '#e2e8f0'
const DOOR = '#64748b'
const WHEEL = '#334155'
const CRASH = '#f43f5e'
const GOOD = '#10b981'
const ACCENT = '#6366f1'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Count how many of `n` drivers crash this year at the given true rate. */
function sampleCrashes(n: number, rate: number): number {
  let crashes = 0
  for (let i = 0; i < n; i++) if (Math.random() < rate) crashes++
  return crashes
}

/** Pick `k` distinct cell indices in [0, total) — representative crash sample. */
function sampleIndices(total: number, k: number): number[] {
  if (k >= total) return Array.from({ length: total }, (_, i) => i)
  const picks = new Set<number>()
  let guard = 0
  while (picks.size < k && guard < k * 12 + 50) {
    picks.add(Math.floor(Math.random() * total))
    guard++
  }
  return [...picks]
}

const money = (v: number) =>
  `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString()}`

// Always-signed money (e.g. "+$200", "-$400") for per-driver figures where the
// direction of the swing is the whole story.
const signed = (v: number) => `${v >= 0 ? '+' : ''}${money(v)}`

interface YearResult {
  year: number
  crashes: number
  net: number
  bankroll: number
}

// A scale-free summary of a 20-year fast-forward. The per-driver result is the
// star: it swings violently at small N and clings to the long-run average at
// large N — that contrast is the whole point of the lesson.
interface Run20 {
  perDriver: number[] // net ÷ drivers for each of the 20 years
  lossYears: number // how many of the 20 years posted a loss
  best: number // best per-driver year
  worst: number // worst per-driver year
  customers: number // head-count this run was simulated at
}

interface Burst {
  index: number
  t: number // 0 = just crashed, 1 = faded out
}

function roundRectFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
  ctx.fill()
}

type HouseMode = 'detailed' | 'simple' | 'roof' | 'dot'

/** Draw one house glyph into the cell whose top-left is (x, y), side length s. */
function drawHouse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  mode: HouseMode,
) {
  const p = s * 0.14
  const bx = x + p
  const by = y + p
  const w = s - 2 * p
  const h = s - 2 * p

  if (mode === 'dot') {
    ctx.fillStyle = ROOF
    ctx.beginPath()
    ctx.arc(x + s / 2, y + s / 2, Math.max(0.6, w * 0.4), 0, Math.PI * 2)
    ctx.fill()
    return
  }

  if (mode === 'roof') {
    // Just the rooftop chevron — thousands of these read as a dense town.
    ctx.fillStyle = ROOF
    ctx.beginPath()
    ctx.moveTo(bx, by + h * 0.72)
    ctx.lineTo(bx + w / 2, by + h * 0.12)
    ctx.lineTo(bx + w, by + h * 0.72)
    ctx.closePath()
    ctx.fill()
    return
  }

  // simple + detailed share the roof-over-wall silhouette.
  const roofH = mode === 'detailed' ? h * 0.4 : h * 0.5
  const wallH = mode === 'detailed' ? h * 0.4 : h * 0.5
  const wallTop = by + roofH

  ctx.fillStyle = WALL
  ctx.fillRect(bx + w * 0.1, wallTop, w * 0.8, wallH)

  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(bx, wallTop)
  ctx.lineTo(bx + w / 2, by)
  ctx.lineTo(bx + w, wallTop)
  ctx.closePath()
  ctx.fill()

  if (mode === 'detailed') {
    // door
    ctx.fillStyle = ROOF
    ctx.fillRect(bx + w * 0.42, wallTop + wallH * 0.45, w * 0.16, wallH * 0.55)
    // a little car in the driveway
    const carY = wallTop + wallH + h * 0.02
    ctx.fillStyle = DOOR
    roundRectFill(ctx, bx + w * 0.18, carY, w * 0.64, h * 0.13, h * 0.05)
    ctx.fillStyle = WHEEL
    const wheelY = carY + h * 0.13
    ctx.beginPath()
    ctx.arc(bx + w * 0.33, wheelY, h * 0.035, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(bx + w * 0.67, wheelY, h * 0.035, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Draw the whole town: every one of `customers` houses, packed into a tidy grid
 * and shrunk so even 5,000 fit legibly. Guarded so it no-ops when there is no
 * 2d context (jsdom) — no readout ever depends on the canvas.
 */
function drawTown(
  canvas: HTMLCanvasElement | null,
  customers: number,
  bursts: Burst[],
) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth || 320
  const cssH = canvas.clientHeight || 192
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  const n = Math.max(1, customers)

  // Choose a column count that keeps cells roughly square for this aspect ratio.
  const aspect = cssW / cssH
  const cols = Math.max(1, Math.round(Math.sqrt(n * aspect)))
  const rows = Math.ceil(n / cols)
  const cell = Math.min(cssW / cols, cssH / rows)

  // Center the grid in the frame.
  const offX = (cssW - cell * cols) / 2
  const offY = (cssH - cell * rows) / 2

  // Level of detail by cell size (and a hard "looks like a real house" floor at
  // low counts). Big cells → full house+car; tiny cells → rooftop marks / dots.
  const mode: HouseMode =
    cell >= 18 && customers <= 30
      ? 'detailed'
      : cell >= 11
        ? 'simple'
        : cell >= 5
          ? 'roof'
          : 'dot'

  for (let i = 0; i < customers; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    drawHouse(ctx, offX + col * cell, offY + row * cell, cell, mode)
  }

  // Crash bursts on top — expanding rose shockwaves that fade out.
  for (const b of bursts) {
    const col = b.index % cols
    const row = Math.floor(b.index / cols)
    const cx = offX + col * cell + cell / 2
    const cy = offY + row * cell + cell / 2
    const radius = Math.max(1.5, cell * (0.32 + 0.7 * b.t))
    ctx.globalAlpha = Math.max(0, 1 - b.t) * 0.9
    ctx.fillStyle = CRASH
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

export function InsuranceDesk({
  props,
  interactive = true,
  onParamChange,
  scenario,
  setScenario,
}: WidgetProps) {
  // Static knobs — these define the economics and never change mid-lesson.
  const premium = (props?.premium as number) ?? 800
  const trueCrashRate = (props?.trueCrashRate as number) ?? 0.05
  const payout = (props?.payout as number) ?? 12_000

  // The break-even premium is the expected claim per driver: payout × rate.
  // Computed synchronously from props so it is correct on the very first render.
  const breakEven = payout * trueCrashRate
  const expectedMargin = premium - breakEven

  // Seed live state from the shared scenario world when present, else props.
  const seedNum = (key: string, fallback: number) =>
    (scenario?.[key] as number | undefined) ?? (props?.[key] as number | undefined) ?? fallback

  const [customers, setCustomers] = useState(() => seedNum('customers', 10))
  const [bankroll, setBankroll] = useState(() => seedNum('bankroll', 5000))
  const [yearsRun, setYearsRun] = useState(() => seedNum('yearsRun', 0))
  const [history, setHistory] = useState<YearResult[]>([])

  // The bankroll the desk opened with. Captured once so Reset always returns
  // here even after we've published a live bankroll back to the shared scenario
  // (which seedNum would otherwise read as the "starting" value).
  const startBankrollRef = useRef(seedNum('bankroll', 5000))
  const startBankroll = startBankrollRef.current

  const [run20Summary, setRun20Summary] = useState<Run20 | null>(null)
  const [revealYears, setRevealYears] = useState(TRAJECTORY_YEARS)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const townRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>()
  const townRafRef = useRef<number>()

  const lastYear = history[history.length - 1]
  const realizedMargin = lastYear ? lastYear.net / customers : null
  const broke = bankroll < 0

  // Completion gate: the renderer watches this to enable Continue once the
  // learner has grown the business to ≥2,000 drivers.
  useEffect(() => {
    onParamChange?.('customers', customers)
  }, [customers, onParamChange])

  // Publish live numbers back to the shared world so concept/question steps
  // reflect the same business. Reading only happened at seed time, so no loop.
  useEffect(() => {
    setScenario?.({ bankroll, yearsRun, customers })
  }, [bankroll, yearsRun, customers, setScenario])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (townRafRef.current) cancelAnimationFrame(townRafRef.current)
    },
    [],
  )

  // Redraw the static town whenever the head-count changes, on mount, and on
  // resize (so devicePixelRatio crispness survives layout changes).
  useEffect(() => {
    if (townRafRef.current) cancelAnimationFrame(townRafRef.current)
    drawTown(townRef.current, customers, [])
    const onResize = () => drawTown(townRef.current, customers, [])
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [customers])

  // Flash a representative sample of rooftops red, expanding and fading out.
  const runCrashBurst = (crashes: number) => {
    if (townRafRef.current) cancelAnimationFrame(townRafRef.current)
    if (prefersReducedMotion() || crashes <= 0) {
      drawTown(townRef.current, customers, [])
      return
    }
    const cells = sampleIndices(customers, Math.min(crashes, customers, MAX_BURSTS))
    const start = performance.now()
    const DURATION = 800
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      drawTown(
        townRef.current,
        customers,
        cells.map((index) => ({ index, t })),
      )
      if (t < 1) townRafRef.current = requestAnimationFrame(tick)
      else drawTown(townRef.current, customers, [])
    }
    townRafRef.current = requestAnimationFrame(tick)
  }

  const runYear = () => {
    setRun20Summary(null)
    const crashes = sampleCrashes(customers, trueCrashRate)
    const net = premium * customers - payout * crashes
    const newBankroll = bankroll + net
    const year = yearsRun + 1
    runCrashBurst(crashes)
    setBankroll(newBankroll)
    setYearsRun(year)
    setHistory((h) => [...h, { year, crashes, net, bankroll: newBankroll }].slice(-40))
  }

  const run20 = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    let bal = bankroll
    const perDriver: number[] = []
    const newRows: YearResult[] = []
    let lossYears = 0
    let lastCrashes = 0
    for (let y = 0; y < TRAJECTORY_YEARS; y++) {
      const crashes = sampleCrashes(customers, trueCrashRate)
      const net = premium * customers - payout * crashes
      bal += net
      perDriver.push(net / customers)
      if (net < 0) lossYears++
      newRows.push({ year: yearsRun + y + 1, crashes, net, bankroll: bal })
      lastCrashes = crashes
    }
    runCrashBurst(lastCrashes)
    setRun20Summary({
      perDriver,
      lossYears,
      best: Math.max(...perDriver),
      worst: Math.min(...perDriver),
      customers,
    })
    setBankroll(bal)
    setYearsRun((y) => y + TRAJECTORY_YEARS)
    setHistory((h) => [...h, ...newRows].slice(-40))

    if (prefersReducedMotion()) {
      setRevealYears(TRAJECTORY_YEARS) // jump straight to the full line.
      return
    }
    // Animate the multi-year line drawing in.
    setRevealYears(0)
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900)
      setRevealYears(Math.round(t * TRAJECTORY_YEARS))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const reset = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (townRafRef.current) cancelAnimationFrame(townRafRef.current)
    setBankroll(startBankroll)
    setYearsRun(0)
    setHistory([])
    setRun20Summary(null)
    drawTown(townRef.current, customers, [])
  }

  const setCount = (n: number) => {
    setCustomers(n)
    setRun20Summary(null)
  }

  // Draw the 20-year *per-driver* trajectory — the scale-free view. Each point
  // is that year's result divided by the head-count, so the y-axis means the
  // same thing at 10 drivers and at 5,000. The line zig-zags across break-even
  // at small N and flattens onto the +$200 average line at large N. Guarded so
  // it no-ops when there is no 2d context (jsdom) — no readout depends on it.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !run20Summary) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const series = run20Summary.perDriver
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth || 320
    const cssH = canvas.clientHeight || 120
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const pad = 16
    // Always keep break-even (0) and the long-run average in frame so the line's
    // relationship to both is honest across scales.
    let lo = Math.min(0, expectedMargin, ...series)
    let hi = Math.max(0, expectedMargin, ...series)
    if (hi - lo < 1) hi = lo + 1
    const span = hi - lo

    const xOf = (i: number) =>
      pad + (i / (series.length - 1)) * (cssW - 2 * pad)
    const yOf = (v: number) => pad + (1 - (v - lo) / span) * (cssH - 2 * pad)

    ctx.font = '10px ui-sans-serif, system-ui'

    // Break-even line — dip below it and that year lost money.
    ctx.strokeStyle = CRASH
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(pad, yOf(0))
    ctx.lineTo(cssW - pad, yOf(0))
    ctx.stroke()
    ctx.fillStyle = CRASH
    ctx.fillText('break even', pad, yOf(0) - 4)

    // Long-run average line — where every year lands once N is large.
    ctx.strokeStyle = GOOD
    ctx.beginPath()
    ctx.moveTo(pad, yOf(expectedMargin))
    ctx.lineTo(cssW - pad, yOf(expectedMargin))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = GOOD
    ctx.fillText(`avg ${money(expectedMargin)}/driver`, pad, yOf(expectedMargin) - 4)

    // The per-driver path itself, revealed up to revealYears.
    const upto = Math.max(0, Math.min(revealYears, series.length) - 1)
    ctx.lineWidth = 2.5
    ctx.strokeStyle = ACCENT
    ctx.beginPath()
    for (let i = 0; i <= upto; i++) {
      const x = xOf(i)
      const y = yOf(series[i])
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Endpoint dot — green if that year cleared break-even, rose if it lost.
    ctx.fillStyle = series[upto] >= 0 ? GOOD : CRASH
    ctx.beginPath()
    ctx.arc(xOf(upto), yOf(series[upto]), 3.5, 0, Math.PI * 2)
    ctx.fill()
  }, [run20Summary, revealYears, expectedMargin])

  return (
    <div data-testid="insurance-desk" className="space-y-4">
      {/* The living town — every insured driver gets a house, drawn on canvas
          and shrunk as the book of business grows so the scale is felt. */}
      <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>Your town</span>
          <span className="tabular-nums">
            {customers.toLocaleString()} {customers === 1 ? 'driver' : 'drivers'} insured
          </span>
        </div>
        <canvas
          ref={townRef}
          className="h-48 w-full rounded-xl bg-white ring-1 ring-slate-100"
          aria-label={`A town of ${customers.toLocaleString()} insured drivers`}
        />
      </div>

      {/* Vault + ledger readouts. */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Readout
          label="Bankroll"
          value={money(bankroll)}
          testid="bankroll"
          tone={broke ? 'bad' : bankroll >= startBankroll ? 'good' : undefined}
        />
        <Readout label="Break-even premium" value={money(breakEven)} testid="break-even" />
        <Readout label="Years run" value={String(yearsRun)} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <Readout
          label="This year, per driver"
          value={realizedMargin === null ? '—' : signed(realizedMargin)}
          sub={
            realizedMargin === null
              ? `long-run avg ${signed(expectedMargin)}/driver`
              : `vs ${signed(expectedMargin)}/driver avg · ${lastYear?.crashes} crash${lastYear?.crashes === 1 ? '' : 'es'}`
          }
          tone={realizedMargin === null ? undefined : realizedMargin >= 0 ? 'good' : 'bad'}
        />
        <Readout
          label="Charged premium"
          value={money(premium)}
          sub={`margin ${signed(expectedMargin)}/driver (avg)`}
        />
      </div>

      {/* After a 20-year fast-forward: the scale-free per-driver view plus a
          spread summary that tightens as the book of business grows. */}
      {run20Summary && (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            className="h-32 w-full rounded-2xl bg-white ring-1 ring-slate-100"
            aria-label="Per-driver result over 20 simulated years"
          />
          <p className="text-center text-xs text-slate-500">
            20 years at {run20Summary.customers.toLocaleString()} drivers — each point is that
            year's result <span className="font-medium text-ink">per driver</span>. It clings to the
            green +{money(expectedMargin)} average as the business grows.
          </p>

          <div className="grid grid-cols-2 gap-2 text-center">
            <Readout
              label="Loss years"
              value={`${run20Summary.lossYears} of 20`}
              sub="years you lost money"
              tone={run20Summary.lossYears === 0 ? 'good' : 'bad'}
            />
            <Readout
              label="Per-driver range"
              value={money(run20Summary.best - run20Summary.worst)}
              sub={`worst ${signed(run20Summary.worst)} · best ${signed(run20Summary.best)}`}
              tone={run20Summary.best - run20Summary.worst <= 2 * expectedMargin ? 'good' : 'bad'}
            />
          </div>

          <p className="rounded-xl bg-accent/5 px-3 py-2 text-center text-xs text-slate-600">
            More drivers doesn't mean more crashes hurt you — it means each year's result hugs the
            same average more tightly. That tight, boring line is a healthy insurer.
          </p>
        </div>
      )}

      {interactive && (
        <div className="space-y-3">
          {/* Customers = the SCALE of the business — the core control. */}
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Drivers signed up</span>
              <span className="font-semibold tabular-nums text-ink">
                {customers.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              className="range mt-1"
              min={10}
              max={5000}
              step={10}
              value={customers}
              onChange={(e) => setCount(Number(e.target.value))}
              aria-label="Number of drivers signed up"
              data-testid="customers-slider"
            />
          </div>

          {/* Quick-set scales — also the fastest path to the completion gate. */}
          <div className="flex flex-wrap gap-2">
            {[10, 100, 2000, 5000].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                data-testid={`scale-${n}`}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition active:scale-[0.98] ${
                  customers === n
                    ? 'bg-accent text-white ring-accent'
                    : 'bg-white text-ink ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>

          {/* Run the simulation. */}
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className="btn-primary text-sm" onClick={runYear}>
              Run year
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={run20}>
              Run 20 years
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={reset}>
              Reset
            </button>
          </div>

          {broke && (
            <p className="rounded-xl bg-bad/10 px-3 py-2 text-center text-sm font-medium text-bad">
              You went broke. One bad year of crashes can sink a tiny book of business.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Readout({
  label,
  value,
  sub,
  tone,
  testid,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad'
  testid?: string
}) {
  const valueTone =
    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-ink'
  return (
    <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
      <p className="text-[11px] leading-tight text-slate-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${valueTone}`} data-testid={testid}>
        {value}
      </p>
      {sub && <p className="text-[10px] leading-tight text-slate-400">{sub}</p>}
    </div>
  )
}
