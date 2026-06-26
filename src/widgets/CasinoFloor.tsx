import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { WidgetProps } from './registry'

// L5 — THE CASINO FLOOR. You walk on with $100 and bet a single number on an
// American roulette wheel: 35-to-1, but it only lands 1 spin in 38. A single
// spin rides the variance (a win flashes green and grows the chip stack). Then
// fast-forward 1,000 spins and watch the negative EV drain the stack along a
// Canvas trajectory. Flip "Be the house" and the exact same engine — opposite
// sign — turns that bleed into steady profit. Same long-run math as L1's insurer.

const FF_SPINS = 1000
const CHIP_VALUE = 5 // each rendered chip in the stack represents $5
const MAX_CHIPS = 24 // cap the visible stack so a hot streak doesn't overflow

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

// Signed currency for the EV readout: player is negative ("-$0.26"), the house
// flips positive ("+$0.26"). Always carries an explicit sign.
const fmtSigned = (n: number): string => {
  const sign = n < 0 ? '-' : '+'
  return `${sign}$${Math.abs(n).toFixed(2)}`
}

export function CasinoFloor({
  props,
  interactive = true,
  onParamChange,
  scenario,
  setScenario,
}: WidgetProps) {
  // Seed from the shared scenario when present, else the authored props, else
  // sensible defaults. Snapshot once so the toy and the story start aligned.
  const startingBankroll = num(scenario?.startingBankroll ?? props?.startingBankroll, 100)
  const payout = num(scenario?.payout ?? props?.payout, 35)
  const winProbability = num(scenario?.winProbability ?? props?.winProbability, 1 / 38)
  const p = winProbability

  const [wager, setWager] = useState(() => num(scenario?.wager ?? props?.wager, 5))
  const [isHouse, setIsHouse] = useState(() => bool(scenario?.isHouse ?? props?.isHouse, false))
  const [bankroll, setBankroll] = useState(startingBankroll)
  const [playsRun, setPlaysRun] = useState(() => num(scenario?.playsRun, 0))

  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [flash, setFlash] = useState<'win' | 'loss' | null>(null)
  // The bankroll history the trajectory canvas draws. `revealed` is how much of
  // it is currently shown (lets the fast-forward race the line ahead).
  const [path, setPath] = useState<number[]>([startingBankroll])
  const [revealed, setRevealed] = useState(1)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>()
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const reduced = useReducedMotion()

  // EV per play computed synchronously from props/state. Player on a 35-to-1,
  // p=1/38 bet: wager × (payout·p − (1−p)) ≈ −0.0526 × wager (negative). The
  // house plays the same game with the sign flipped → positive.
  const playerEvPerPlay = wager * (payout * p - (1 - p))
  const evPerPlay = isHouse ? -playerEvPerPlay : playerEvPerPlay

  const canAfford = isHouse || bankroll >= wager

  // Publish live numbers back to the shared world so concept/predict/question
  // steps reflect the same casino. No-op when rendered standalone (tests).
  useEffect(() => {
    setScenario?.({ bankroll: Math.round(bankroll), playsRun, isHouse, wager })
  }, [bankroll, playsRun, isHouse, wager, setScenario])

  // Report the completion param. The lesson gates Continue on playsRun >= 1000.
  useEffect(() => {
    onParamChange?.('playsRun', playsRun)
  }, [playsRun, onParamChange])

  const stopRaf = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
  }, [])

  useEffect(
    () => () => {
      stopRaf()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [stopRaf],
  )

  // One spin's bankroll change from the active actor's point of view. The number
  // hits with probability p. Player: win +payout·wager, lose −wager. House: the
  // exact opposite — it pays out on a hit and collects the wager otherwise.
  const spinDelta = useCallback(
    (house: boolean): { hit: boolean; delta: number } => {
      const hit = Math.random() < p
      const delta = house
        ? hit
          ? -payout * wager
          : wager
        : hit
          ? payout * wager
          : -wager
      return { hit, delta }
    },
    [p, payout, wager],
  )

  const applyResult = useCallback(
    (hit: boolean, delta: number) => {
      setBankroll((b) => Math.max(0, b + delta))
      setPath((prev) => {
        const nextBal = Math.max(0, prev[prev.length - 1] + delta)
        const next = [...prev, nextBal]
        setRevealed(next.length)
        return next
      })
      setPlaysRun((n) => n + 1)
      // A hit is good for the player but bad for the house, and vice versa.
      setFlash(hit !== isHouse ? 'win' : 'loss')
      timeoutRef.current = setTimeout(() => setFlash(null), 650)
    },
    [isHouse],
  )

  // Ride the variance: a single animated spin.
  const spin = useCallback(() => {
    if (spinning || !canAfford) return
    const { hit, delta } = spinDelta(isHouse)
    if (reduced) {
      applyResult(hit, delta)
      return
    }
    setSpinning(true)
    setRotation((r) => r + 360 * 5 + Math.random() * 360)
    timeoutRef.current = setTimeout(() => {
      applyResult(hit, delta)
      setSpinning(false)
    }, 900)
  }, [spinning, canAfford, spinDelta, isHouse, reduced, applyResult])

  // Fast-forward 1,000 spins: precompute the path, then race the trajectory line
  // ahead while the chip stack/bankroll track the leak (or the climb). Always
  // pushes playsRun past the 1,000 completion gate.
  const fastForward = useCallback(() => {
    if (spinning || !canAfford) return
    stopRaf()
    let bal = bankroll
    const added: number[] = []
    for (let i = 0; i < FF_SPINS; i++) {
      // A busted player can't keep betting; the line flatlines at the floor.
      if (!isHouse && bal < wager) {
        added.push(bal)
        continue
      }
      const { delta } = spinDelta(isHouse)
      bal = Math.max(0, bal + delta)
      added.push(bal)
    }
    const fullPath = [...path, ...added]
    const startLen = path.length
    const newPlays = playsRun + FF_SPINS
    setPath(fullPath)

    const finish = () => {
      setBankroll(bal)
      setRevealed(fullPath.length)
      setPlaysRun(newPlays)
    }

    if (reduced) {
      finish()
      return
    }

    setSpinning(true)
    const total = fullPath.length
    const tick = () => {
      setRevealed((r) => {
        const next = Math.min(total, Math.max(r, startLen) + Math.ceil(FF_SPINS / 60))
        setBankroll(fullPath[next - 1])
        if (next >= total) {
          stopRaf()
          setSpinning(false)
          setPlaysRun(newPlays)
          return total
        }
        rafRef.current = requestAnimationFrame(tick)
        return next
      })
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [spinning, canAfford, stopRaf, bankroll, isHouse, wager, spinDelta, path, playsRun, reduced])

  const toggleHouse = useCallback(() => {
    if (spinning) return
    stopRaf()
    setIsHouse((h) => !h)
    setBankroll(startingBankroll)
    setPath([startingBankroll])
    setRevealed(1)
    setFlash(null)
  }, [spinning, stopRaf, startingBankroll])

  // Reset to a clean run: bankroll back to its starting value, spins played
  // cleared to 0 (the completion param follows via the effect above), and the
  // trajectory wiped. The house/player mode is preserved.
  const reset = useCallback(() => {
    if (spinning) return
    stopRaf()
    setBankroll(startingBankroll)
    setPlaysRun(0)
    setPath([startingBankroll])
    setRevealed(1)
    setFlash(null)
  }, [spinning, stopRaf, startingBankroll])

  // Draw the bankroll trajectory. Guarded so it no-ops without a 2d context.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    const cssW = canvas.clientWidth || 320
    const cssH = canvas.clientHeight || 120
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, cssW, cssH)

    const shown = path.slice(0, Math.max(2, revealed))
    const pad = 10
    let lo = Math.min(startingBankroll, ...shown)
    let hi = Math.max(startingBankroll, ...shown)
    if (hi - lo < 1) {
      lo -= 1
      hi += 1
    }
    const range = hi - lo
    const n = shown.length
    const xOf = (i: number) => pad + (i / Math.max(1, n - 1)) * (cssW - 2 * pad)
    const yOf = (v: number) => pad + (1 - (v - lo) / range) * (cssH - 2 * pad)

    // Break-even baseline at the starting stake.
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(pad, yOf(startingBankroll))
    ctx.lineTo(cssW - pad, yOf(startingBankroll))
    ctx.stroke()
    ctx.setLineDash([])

    // The trajectory itself — green when ahead of the stake, rose when behind.
    const end = shown[shown.length - 1]
    const ahead = end >= startingBankroll
    const line = ahead ? '#10b981' : '#f43f5e'
    ctx.strokeStyle = line
    ctx.lineWidth = 2
    ctx.beginPath()
    shown.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v))))
    ctx.stroke()

    // A dot at the live end of the line.
    ctx.fillStyle = line
    ctx.beginPath()
    ctx.arc(xOf(n - 1), yOf(end), 3, 0, Math.PI * 2)
    ctx.fill()
  }, [path, revealed, startingBankroll])

  const chipCount = Math.min(MAX_CHIPS, Math.max(0, Math.round(bankroll / CHIP_VALUE)))
  const chips = Array.from({ length: chipCount })
  const busted = !isHouse && bankroll < wager

  return (
    <div data-testid="casino-floor" className="space-y-4">
      {/* The stage: roulette wheel front and center, with the chip stack that IS
          the bankroll arranged beneath it. */}
      <div className="relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl bg-white p-6 ring-1 ring-slate-100">
        <Wheel rotation={rotation} spinning={spinning} reduced={!!reduced} />

        <div className="flex flex-col items-center gap-3">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {isHouse ? 'The vault' : 'Your bankroll'}
            </p>
            <motion.p
              key={Math.round(bankroll)}
              initial={reduced ? false : { scale: flash ? 1.18 : 1 }}
              animate={{ scale: 1 }}
              data-testid="bankroll"
              className={`text-4xl font-extrabold tabular-nums ${
                flash === 'win' ? 'text-emerald-600' : flash === 'loss' ? 'text-rose-600' : 'text-ink'
              }`}
            >
              ${Math.round(bankroll)}
            </motion.p>
          </div>

          {/* Chip stack — grows on a win, shrinks on a loss. */}
          <div className="flex h-12 flex-wrap content-start items-end justify-center gap-0.5">
            {chips.map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-7 rounded-full ${
                  isHouse ? 'bg-emerald-500/80' : 'bg-amber-400/90'
                } ring-1 ring-amber-700/20`}
              />
            ))}
            {chipCount === 0 && <span className="text-xs font-semibold text-rose-500">busted</span>}
          </div>
        </div>
      </div>

      {/* Live numbers: EV per play sits beside the bankroll. */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
          <p className="text-xs text-slate-500">EV per play</p>
          <p
            data-testid="ev-per-play"
            className={`text-base font-bold tabular-nums ${
              evPerPlay < 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {fmtSigned(evPerPlay)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
          <p className="text-xs text-slate-500">Spins played</p>
          <p data-testid="plays-run" className="text-base font-bold tabular-nums text-ink">
            {playsRun}
          </p>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="h-28 w-full rounded-2xl bg-slate-50 ring-1 ring-slate-100"
        aria-label="Bankroll trajectory over the spins played"
      />

      {interactive && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Wager per spin</span>
              <span className="font-semibold tabular-nums text-ink">${wager}</span>
            </div>
            <input
              type="range"
              data-testid="wager"
              className="range mt-1"
              min={1}
              max={25}
              step={1}
              value={wager}
              disabled={spinning}
              onChange={(e) => setWager(Number(e.target.value))}
              aria-label="Wager per spin"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-primary cursor-pointer text-sm disabled:opacity-40"
              onClick={spin}
              type="button"
              disabled={spinning || busted}
            >
              {busted ? 'Out of chips' : 'Spin'}
            </button>
            <button
              className="btn-ghost cursor-pointer text-sm disabled:opacity-40"
              onClick={fastForward}
              type="button"
              data-testid="fast-forward"
              disabled={spinning || busted}
            >
              Fast-forward 1,000 spins
            </button>
          </div>

          {busted && (
            <p className="text-center text-xs font-semibold text-rose-500">
              Out of chips — hit “Reset bankroll” to play again.
            </p>
          )}

          <button
            className={`w-full cursor-pointer rounded-full px-3 py-2 text-sm font-semibold transition-colors duration-200 ${
              isHouse
                ? 'bg-good/15 text-emerald-600 ring-1 ring-good/40'
                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
            }`}
            onClick={toggleHouse}
            type="button"
            data-testid="house-toggle"
            aria-pressed={isHouse}
            disabled={spinning}
          >
            {isHouse ? 'You are the house ✓' : 'Be the house'}
          </button>

          <button
            className="w-full cursor-pointer text-center text-xs text-slate-400 transition-colors duration-200 hover:text-ink"
            onClick={reset}
            type="button"
            disabled={spinning}
          >
            Reset bankroll
          </button>
        </div>
      )}
    </div>
  )
}

function Wheel({
  rotation,
  spinning,
  reduced,
}: {
  rotation: number
  spinning: boolean
  reduced: boolean
}) {
  return (
    <div className="relative h-40 w-40 shrink-0">
      {/* Pointer */}
      <div className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[12px] border-x-transparent border-t-amber-400" />
      <motion.div
        className="h-full w-full rounded-full ring-4 ring-amber-500/70"
        style={{
          background:
            'repeating-conic-gradient(#1e293b 0deg 18deg, #b91c1c 18deg 36deg, #0f172a 36deg 54deg, #15803d 54deg 72deg)',
        }}
        animate={reduced ? undefined : { rotate: rotation }}
        transition={{ duration: spinning ? 0.9 : 0, ease: 'easeOut' }}
      >
        <div className="absolute inset-[34%] rounded-full bg-amber-400 ring-2 ring-amber-600" />
      </motion.div>
    </div>
  )
}
