import { useEffect, useMemo, useRef, useState } from 'react'
import type { WidgetProps } from './registry'

// L5 — Expected value, felt at scale. Hundreds of gamblers play the same
// negative-EV bet at once. Their bankrolls fan out on a dark stage (variance):
// a lucky few spike up, most bleed. One bold line — the average — marches down
// the EV slope. As the round advances, every player's bankroll drops into a live
// histogram: a tall "lost it" bar and a long lucky tail, with the mean sitting
// below the break-even line. A payout slider flips the wheel fair to show the
// distribution recenter on the starting stake.

const PLAYERS = 300
// Enough rounds that variance spreads the crowd, the negative-EV drift bites,
// and unlucky players actually bust (impossible in fewer than ~100 rounds when
// each $1 loss can only chip the bankroll down one dollar at a time).
const ROUNDS = 220
const REVEAL_STEP = 2 // rounds revealed per animation frame (keeps the run brisk)
const WAGER = 1

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function simulate(
  players: number,
  rounds: number,
  p: number,
  payout: number,
  start: number,
): number[][] {
  const paths: number[][] = []
  for (let i = 0; i < players; i++) {
    const path = new Array<number>(rounds + 1)
    path[0] = start
    let bal = start
    for (let r = 1; r <= rounds; r++) {
      if (bal > 0) {
        bal += Math.random() < p ? payout * WAGER : -WAGER
        if (bal < 0) bal = 0
      }
      path[r] = bal
    }
    paths.push(path)
  }
  return paths
}

export function EvBettingGame({ props, interactive = true, onParamChange }: WidgetProps) {
  const start = (props?.startingBankroll as number) ?? 100
  const winProbability = (props?.winProbability as number) ?? 1 / 38
  const players = (props?.players as number) ?? PLAYERS
  const p = winProbability
  const fairPayout = Math.round((1 - p) / p) // EV = 0 when payout = (1-p)/p

  const [payout, setPayout] = useState((props?.payout as number) ?? 35)
  const [seed, setSeed] = useState(0)
  const [revealed, setRevealed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const fanRef = useRef<HTMLCanvasElement>(null)
  const histRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>()

  const evPerPlay = WAGER * (payout * p - (1 - p))
  const evEnd = start + evPerPlay * ROUNDS

  // Whole simulation precomputed; the animation just reveals more rounds.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paths = useMemo(() => simulate(players, ROUNDS, p, payout, start), [players, p, payout, start, seed])

  const meanByRound = useMemo(() => {
    const m = new Array<number>(ROUNDS + 1).fill(0)
    for (const path of paths) for (let r = 0; r <= ROUNDS; r++) m[r] += path[r]
    return m.map((s) => s / paths.length)
  }, [paths])

  // Stable y-axis; clamp lucky outliers so the crowd doesn't get squashed flat.
  const yMax = useMemo(() => {
    let mx = start
    for (const path of paths) for (const v of path) if (v > mx) mx = v
    return Math.min(mx * 1.05, start * 4)
  }, [paths, start])

  const meanNow = meanByRound[revealed]
  const busted = paths.filter((path) => path[revealed] <= 0).length
  const winners = paths.filter((path) => path[revealed] > start).length

  useEffect(() => {
    onParamChange?.('plays', revealed)
  }, [revealed, onParamChange])

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    setPlaying(false)
  }
  useEffect(() => () => stop(), [])

  const run = () => {
    if (playing) return
    // A full replay deals a fresh random crowd so the same odds don't replay the
    // exact same outcome; a paused run simply resumes the crowd in progress.
    if (revealed >= ROUNDS) {
      setSeed((s) => s + 1)
      setRevealed(0)
    }
    if (prefersReducedMotion()) {
      setRevealed(ROUNDS)
      return
    }
    setPlaying(true)
    const tick = () => {
      setRevealed((r) => {
        if (r >= ROUNDS) {
          stop()
          return ROUNDS
        }
        return Math.min(ROUNDS, r + REVEAL_STEP)
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const reset = () => {
    stop()
    setRevealed(0)
    setSeed((s) => s + 1)
  }

  // Draw the fan of trajectories + average + EV trend.
  useEffect(() => {
    const canvas = fanRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, cssW, cssH)

    const pad = 10
    const xOf = (r: number) => pad + (r / ROUNDS) * (cssW - 2 * pad)
    const yOf = (v: number) => pad + (1 - Math.min(v, yMax) / yMax) * (cssH - 2 * pad)

    // Break-even baseline.
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(pad, yOf(start))
    ctx.lineTo(cssW - pad, yOf(start))
    ctx.stroke()
    ctx.setLineDash([])

    // Each player's path up to the revealed round — faint, tinted by fortune.
    for (const path of paths) {
      const v = path[revealed]
      ctx.strokeStyle =
        v <= 0 ? 'rgba(244,63,94,0.16)' : v > start ? 'rgba(16,185,129,0.18)' : 'rgba(129,140,248,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let r = 0; r <= revealed; r++) {
        const x = xOf(r)
        const y = yOf(path[r])
        r === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // EV trend — where the average is truly headed (dashed "forecast").
    ctx.strokeStyle = '#f43f5e'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(xOf(0), yOf(start))
    ctx.lineTo(xOf(ROUNDS), yOf(evEnd))
    ctx.stroke()
    ctx.setLineDash([])

    // The average bankroll — bold, glowing.
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 3
    ctx.shadowBlur = 10
    ctx.shadowColor = '#818cf8'
    ctx.beginPath()
    for (let r = 0; r <= revealed; r++) {
      const x = xOf(r)
      const y = yOf(meanByRound[r])
      r === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }, [revealed, paths, meanByRound, yMax, start, evEnd])

  // Draw the live histogram of current bankrolls + mean & break-even markers.
  useEffect(() => {
    const canvas = histRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, cssW, cssH)

    const pad = 8
    const BINS = 28
    const bins = new Array<number>(BINS).fill(0)
    for (const path of paths) {
      const v = Math.min(path[revealed], yMax)
      const bi = Math.min(BINS - 1, Math.floor((v / yMax) * BINS))
      bins[bi]++
    }
    const maxBin = Math.max(1, ...bins)
    const xOf = (v: number) => pad + (Math.min(v, yMax) / yMax) * (cssW - 2 * pad)
    const bw = (cssW - 2 * pad) / BINS

    bins.forEach((count, i) => {
      const h = (count / maxBin) * (cssH - 2 * pad)
      const binMid = ((i + 0.5) / BINS) * yMax
      ctx.fillStyle = binMid > start ? '#10b981' : binMid <= 0.01 * yMax ? '#f43f5e' : '#6366f1'
      ctx.globalAlpha = 0.8
      ctx.fillRect(pad + i * bw + 0.5, cssH - pad - h, bw - 1, h)
    })
    ctx.globalAlpha = 1

    // Break-even marker.
    ctx.strokeStyle = '#64748b'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(xOf(start), pad)
    ctx.lineTo(xOf(start), cssH - pad)
    ctx.stroke()
    ctx.setLineDash([])

    // Mean marker.
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(xOf(meanNow), pad)
    ctx.lineTo(xOf(meanNow), cssH - pad)
    ctx.stroke()
    ctx.fillStyle = '#a5b4fc'
    ctx.font = '10px ui-sans-serif, system-ui'
    ctx.fillText(`mean $${meanNow.toFixed(0)}`, Math.min(xOf(meanNow) + 4, cssW - 60), pad + 10)
  }, [revealed, paths, yMax, start, meanNow])

  return (
    <div className="space-y-4">
      <canvas
        ref={fanRef}
        className="h-44 w-full rounded-2xl bg-ink ring-1 ring-slate-800"
        aria-label="Hundreds of bankrolls over time with the average tracking the expected-value trend"
      />
      <canvas
        ref={histRef}
        className="h-24 w-full rounded-2xl bg-ink ring-1 ring-slate-800"
        aria-label="Distribution of current bankrolls with mean and break-even markers"
      />

      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <Tile label="Mean" value={`$${meanNow.toFixed(0)}`} testid="mean-bankroll" tone={meanNow < start ? 'bad' : undefined} />
        <Tile label="Winners" value={`${winners}`} tone="good" />
        <Tile label="Busted" value={`${busted}`} tone="bad" />
        <Tile label="EV / play" value={`$${evPerPlay.toFixed(2)}`} tone={evPerPlay < 0 ? 'bad' : 'good'} />
      </div>

      {interactive && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                Payout (single-number win) · {payout} to 1
                {payout >= fairPayout ? ' — fair' : ''}
              </span>
              <span className="font-semibold tabular-nums text-ink">{payout}:1</span>
            </div>
            <input
              type="range"
              className="range mt-1"
              min={33}
              max={fairPayout}
              step={1}
              value={payout}
              disabled={playing}
              onChange={(e) => {
                setPayout(Number(e.target.value))
                setRevealed(0)
              }}
              aria-label="House payout"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {playing ? (
              <button className="btn-ghost cursor-pointer text-sm" onClick={stop} type="button">
                Pause
              </button>
            ) : (
              <button
                className="btn-ghost cursor-pointer text-sm"
                onClick={run}
                type="button"
                data-testid="run"
              >
                {revealed >= ROUNDS ? 'Replay' : revealed > 0 ? 'Resume' : `Run ${players} gamblers`}
              </button>
            )}
            <button
              className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-slate-400 transition-colors duration-200 hover:text-ink"
              onClick={reset}
              type="button"
              data-testid="reset"
            >
              Reset
            </button>
          </div>
          <p className="text-center text-xs text-slate-400">
            Round {revealed} of {ROUNDS} · {players} players
          </p>
        </div>
      )}
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
  testid,
}: {
  label: string
  value: string
  tone?: 'bad' | 'good'
  testid?: string
}) {
  const toneCls =
    tone === 'bad'
      ? 'bg-bad/10 ring-bad/30 text-rose-600'
      : tone === 'good'
        ? 'bg-good/10 ring-good/30 text-emerald-600'
        : 'bg-slate-50 ring-slate-100 text-ink'
  return (
    <div className={`rounded-xl p-2 ring-1 ${tone ? toneCls.split(' ').slice(0, 2).join(' ') : 'bg-slate-50 ring-slate-100'}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-base font-bold tabular-nums ${
          tone === 'bad' ? 'text-rose-600' : tone === 'good' ? 'text-emerald-600' : 'text-ink'
        }`}
        data-testid={testid}
      >
        {value}
      </p>
    </div>
  )
}
