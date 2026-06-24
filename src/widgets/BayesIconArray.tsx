import { useEffect, useMemo, useRef, useState } from 'react'
import type { WidgetProps } from './registry'

// L4 ⭐ — Bayes & base rates. 1,000 people on a canvas grid + three sliders.
// People are grouped so the tiny block of true positives sits beside the much
// larger block of false positives — making "most positives are false" visible.
// The headline recomputes live: of everyone who tests positive, how many are real.

const POP = 1000
const COLS = 40
const ROWS = POP / COLS

const COLOR = {
  truePos: '#f43f5e', // sick AND flagged — the real ones
  falsePos: '#f59e0b', // healthy but flagged — the false alarms
  negative: '#e2e8f0', // everyone who tested negative
}

interface Counts {
  tp: number
  fp: number
  fn: number
  tn: number
}

function computeCounts(prevalence: number, sensitivity: number, falsePositive: number): Counts {
  const sick = Math.round(POP * prevalence)
  const tp = Math.round(sick * sensitivity)
  const fn = sick - tp
  const healthy = POP - sick
  const fp = Math.round(healthy * falsePositive)
  const tn = healthy - fp
  return { tp, fp, fn, tn }
}

export function BayesIconArray({ props, interactive = true }: WidgetProps) {
  const [prevalence, setPrevalence] = useState((props?.prevalence as number) ?? 0.001)
  const [sensitivity, setSensitivity] = useState((props?.sensitivity as number) ?? 0.99)
  const [falsePositive, setFalsePositive] = useState((props?.falsePositive as number) ?? 0.05)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const counts = useMemo(
    () => computeCounts(prevalence, sensitivity, falsePositive),
    [prevalence, sensitivity, falsePositive],
  )
  const positives = counts.tp + counts.fp
  const ppv = positives > 0 ? counts.tp / positives : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = (cssW / COLS) * ROWS
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    canvas.style.height = `${cssH}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const cell = cssW / COLS
    const r = cell * 0.34

    // Group order: true positives, then false positives, then everyone negative.
    // This packs the two "flagged" groups together so they're directly comparable.
    const order: string[] = [
      ...Array(counts.tp).fill('truePos'),
      ...Array(counts.fp).fill('falsePos'),
      ...Array(counts.fn + counts.tn).fill('negative'),
    ]

    for (let i = 0; i < POP; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const cx = col * cell + cell / 2
      const cy = row * cell + cell / 2
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = COLOR[order[i] as keyof typeof COLOR]
      ctx.fill()
    }
  }, [counts])

  return (
    <div className="space-y-4">
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100"
        aria-label="1,000 people colored by test result"
      />

      {/* Headline: the number that surprises people. */}
      <div className="rounded-xl bg-accent/10 p-4 text-center ring-1 ring-accent/30">
        <p className="text-sm text-slate-600">Of everyone who tests positive…</p>
        <p className="text-3xl font-extrabold text-ink" data-testid="ppv">
          {Math.round(ppv * 100)}%
        </p>
        <p className="text-sm text-slate-600">actually have the disease</p>
        <p className="mt-2 text-xs tabular-nums text-slate-500">
          <span className="text-rose-500">●</span> {counts.tp} true positive
          {counts.tp === 1 ? '' : 's'} &nbsp;·&nbsp;
          <span className="text-amber-500">●</span> {counts.fp} false positive
          {counts.fp === 1 ? '' : 's'}
        </p>
      </div>

      {interactive && (
        <div className="space-y-3">
          <Slider
            label="How common the disease is"
            value={prevalence}
            min={0.001}
            max={0.5}
            step={0.001}
            display={`${(prevalence * 100).toFixed(1)}%`}
            onChange={setPrevalence}
            testid="prevalence"
          />
          <Slider
            label="Test sensitivity (catches real cases)"
            value={sensitivity}
            min={0.5}
            max={1}
            step={0.01}
            display={`${Math.round(sensitivity * 100)}%`}
            onChange={setSensitivity}
            testid="sensitivity"
          />
          <Slider
            label="False-positive rate"
            value={falsePositive}
            min={0}
            max={0.2}
            step={0.005}
            display={`${(falsePositive * 100).toFixed(1)}%`}
            onChange={setFalsePositive}
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
