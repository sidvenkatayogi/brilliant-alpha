import type { WidgetProps } from './registry'

// L4 companion — the equation behind the icon array. Two forms shown with the
// numbers already plugged in: first the plain count (true positives over all
// positives), then the same thing as Bayes' theorem. Colours match the array —
// rose = true positives (real), amber = false positives (false alarms) — so the
// formula reads as the dots, just written down.

const ROSE = 'text-rose-500'
const AMBER = 'text-amber-600'

/** A stacked numerator-over-denominator fraction with a rule between. */
function Frac({ num, den }: { num: React.ReactNode; den: React.ReactNode }) {
  return (
    <span className="mx-1.5 inline-flex flex-col items-center align-middle">
      <span className="px-2 pb-1">{num}</span>
      <span className="h-px w-full bg-slate-400" />
      <span className="px-2 pt-1">{den}</span>
    </span>
  )
}

const trimNum = (n: number) =>
  n
    .toFixed(5)
    .replace(/0+$/, '')
    .replace(/\.$/, '')

export function BayesFormula({ props }: WidgetProps) {
  const population = (props?.population as number) ?? 1000
  const prevalence = (props?.prevalence as number) ?? 0.001
  const sensitivity = (props?.sensitivity as number) ?? 0.99
  const falsePositive = (props?.falsePositive as number) ?? 0.05

  const sick = Math.round(population * prevalence)
  const tp = Math.round(sick * sensitivity)
  const healthy = population - sick
  const fp = Math.round(healthy * falsePositive)
  const ppv = tp + fp > 0 ? tp / (tp + fp) : 0
  const pct = Math.round(ppv * 100)

  // Probability form of the same ratio.
  const numP = sensitivity * prevalence
  const fpTerm = falsePositive * (1 - prevalence)

  return (
    <div className="space-y-3">
      {/* Form 1 — the plain count, matching the dots. */}
      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
        <p className="mb-2 text-xs font-medium text-slate-500">
          Of every positive, the share that's real is just true positives over all positives:
        </p>
        <div className="flex flex-col items-center gap-1 text-xs text-ink sm:text-sm">
          <span className="text-slate-500">P(sick&nbsp;|&nbsp;+) =</span>
          <Frac
            num={<span className={ROSE}>true positives</span>}
            den={
              <span>
                <span className={ROSE}>true</span>
                <span className="text-slate-400"> + </span>
                <span className={AMBER}>false positives</span>
              </span>
            }
          />
          <div className="flex items-center">
            <span className="mr-1 text-slate-400">=</span>
            <Frac
              num={<span className={`${ROSE} font-bold tabular-nums`}>{tp}</span>}
              den={
                <span className="tabular-nums">
                  <span className={`${ROSE} font-bold`}>{tp}</span>
                  <span className="text-slate-400"> + </span>
                  <span className={`${AMBER} font-bold`}>{fp}</span>
                </span>
              }
            />
            <span className="ml-2 mr-1 text-slate-400">≈</span>
            <span className="rounded-lg bg-accent/10 px-2 py-1 font-extrabold text-ink ring-1 ring-accent/30">
              {pct}%
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          ~{tp} real case is buried under ~{fp} false alarms from the {healthy.toLocaleString()}{' '}
          healthy people.
        </p>
      </div>

      {/* Form 2 — the same ratio as Bayes' theorem, numbers plugged in. */}
      <div className="rounded-2xl bg-ink p-4 text-white ring-1 ring-slate-800">
        <p className="mb-3 text-xs font-medium text-white/60">
          Those counts are exactly Bayes' theorem — each positive group is its rate × how many
          people it applies to:
        </p>
        <div className="flex flex-col items-center gap-1 text-xs sm:text-sm">
          <span className="text-white/70">P(sick&nbsp;|&nbsp;+) =</span>
          <Frac
            num={<span className="text-rose-300">0.99 × 0.001</span>}
            den={
              <span>
                <span className="text-rose-300">0.99 × 0.001</span>
                <span className="text-white/40"> + </span>
                <span className="text-amber-300">0.05 × 0.999</span>
              </span>
            }
          />
          <div className="flex items-center">
            <span className="mr-1 text-white/40">=</span>
            <Frac
              num={<span className="text-rose-300 tabular-nums">{trimNum(numP)}</span>}
              den={
                <span className="tabular-nums">
                  <span className="text-rose-300">{trimNum(numP)}</span>
                  <span className="text-white/40"> + </span>
                  <span className="text-amber-300">{trimNum(fpTerm)}</span>
                </span>
              }
            />
            <span className="ml-2 mr-1 text-white/40">≈</span>
            <span className="rounded-lg bg-white/10 px-2 py-1 font-extrabold text-white ring-1 ring-white/20">
              {pct}%
            </span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/70">
          <p>
            <span className="text-rose-300">Rose</span> = catch rate × how rare it is (the real
            cases).
          </p>
          <p>
            <span className="text-amber-300">Amber</span> = error rate × the huge healthy group (the
            false alarms).
          </p>
        </div>
        <p className="mt-2 text-[11px] text-white/60">
          The healthy term (×&nbsp;0.999) dwarfs the sick term (×&nbsp;0.001), so it dominates the
          bottom — and the answer stays tiny.
        </p>
      </div>
    </div>
  )
}
