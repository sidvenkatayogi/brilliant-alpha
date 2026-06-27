import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { WidgetProps } from './registry'

// L3 — Conditioning, as a spam filter you tune. The "living world" is an inbox
// of 100 envelopes. Toggling a clue chip CONDITIONS the world: emails that don't
// carry the clue slide out and fade, the survivors rise and repack, and the live
// P(spam) recomputes over the smaller slice. Overall ~10% of the inbox is spam,
// but among the FREE + ALL CAPS emails spam dominates (~80%) — conditioning,
// felt: P(spam | clue) is a different question from P(spam).

type ClueKey = 'free' | 'caps' | 'link' | 'contact'

interface Email {
  id: number
  spam: boolean
  free: boolean
  caps: boolean
  link: boolean
  contact: boolean
}

// DETERMINISTIC dataset — no Math.random, so counts are stable and testable.
// 100 emails, exactly 10 spam (10% base rate). Spam disproportionately carries
// the loud clues (FREE, ALL CAPS, a link) and is almost never from a known
// contact; real mail rarely shouts FREE/CAPS and is usually from a contact.
// Among FREE + ALL CAPS emails: 8 spam + 2 real = 80% spam.
function buildInbox(): Email[] {
  const emails: Email[] = []
  let id = 0

  // 8 spam: the screaming clickbait — FREE + ALL CAPS, mostly with a link.
  for (let i = 0; i < 8; i++) {
    emails.push({ id: id++, spam: true, free: true, caps: true, link: i % 4 !== 0, contact: false })
  }
  // 2 spam that carry only one loud clue (so FREE alone, or CAPS alone, still
  // skews spammy without being the full FREE+CAPS slice).
  emails.push({ id: id++, spam: true, free: true, caps: false, link: true, contact: false })
  emails.push({ id: id++, spam: true, free: false, caps: true, link: true, contact: false })

  // 2 real emails that happen to be FREE + ALL CAPS — the unavoidable false
  // alarms that keep P(spam | FREE+CAPS) at ~80% rather than 100%.
  emails.push({ id: id++, spam: false, free: true, caps: true, link: true, contact: false })
  emails.push({ id: id++, spam: false, free: true, caps: true, link: false, contact: true })

  // 88 ordinary real emails: a few have a single loud clue, most are from known
  // contacts, and none combine FREE + ALL CAPS (caps requires !free below).
  for (let i = 0; i < 88; i++) {
    const free = i % 11 === 0 && i % 2 === 0
    const caps = i % 7 === 0 && !free
    const link = i % 3 === 0
    const contact = i % 5 !== 0
    emails.push({ id: id++, spam: false, free, caps, link, contact })
  }

  return emails
}

const INBOX = buildInbox()

const CLUES: { key: ClueKey; testid: string; label: string }[] = [
  { key: 'free', testid: 'clue-free', label: 'Says "FREE"' },
  { key: 'caps', testid: 'clue-caps', label: 'ALL CAPS' },
  { key: 'link', testid: 'clue-link', label: 'Has a link' },
  { key: 'contact', testid: 'clue-contact', label: 'Known contact' },
]

function Envelope({ spam }: { spam: boolean }) {
  // Spam carries a subtle red marker; real mail is calm slate. Color-reveal.
  const body = spam ? '#fecdd3' : '#e2e8f0'
  const stroke = spam ? '#f43f5e' : '#94a3b8'
  return (
    <svg viewBox="0 0 28 20" className="h-full w-full" aria-hidden="true">
      <rect x="1" y="1" width="26" height="18" rx="3" fill={body} stroke={stroke} strokeWidth="1.5" />
      <path
        d="M2.5 3.5 L14 12 L25.5 3.5"
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SpamInbox({
  props,
  interactive = true,
  onParamChange,
  scenario,
  setScenario,
}: WidgetProps) {
  const reduced = useReducedMotion()

  // Optional read-only static frame may pre-activate clues from props (e.g. a
  // concept step that shows the filtered slice). Otherwise start unfiltered.
  const initialClues = useMemo<Record<ClueKey, boolean>>(() => {
    const seed = (props?.clues as Partial<Record<ClueKey, boolean>> | undefined) ?? {}
    return {
      free: Boolean(seed.free),
      caps: Boolean(seed.caps),
      link: Boolean(seed.link),
      contact: Boolean(seed.contact),
    }
    // props is authored config — snapshot once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [active, setActive] = useState<Record<ClueKey, boolean>>(initialClues)

  const activeKeys = useMemo(
    () => CLUES.map((c) => c.key).filter((k) => active[k]),
    [active],
  )

  // The surviving slice: emails matching EVERY active clue. P(spam | clues) is
  // computed synchronously from the deterministic dataset, so the readout is
  // correct the instant a chip toggles (Framer's exit/repack animation only
  // affects when envelopes leave the DOM, never the number).
  const { visible, denominator, spamCount, pSpam } = useMemo(() => {
    const visible = INBOX.filter((e) => activeKeys.every((k) => e[k]))
    const denominator = visible.length
    const spamCount = visible.reduce((n, e) => n + (e.spam ? 1 : 0), 0)
    const pSpam = denominator ? Math.round((spamCount / denominator) * 100) : 0
    return { visible, denominator, spamCount, pSpam }
  }, [activeKeys])

  const conditionsApplied = activeKeys.length

  // Completion gating: Continue unlocks once at least one clue is applied.
  useEffect(() => {
    onParamChange?.('conditionsApplied', conditionsApplied)
  }, [conditionsApplied, onParamChange])

  // Publish live numbers back to the shared world so concept/predict/question
  // steps can reflect the same inbox. Seeds fall back to props when no scenario.
  useEffect(() => {
    if (!setScenario) return
    setScenario({
      total: (scenario?.total as number) ?? (props?.total as number) ?? INBOX.length,
      pSpam,
      denominator,
      spam: spamCount,
      conditionsApplied,
    })
    // scenario.total is a seed read once via fallback; avoid re-running on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pSpam, denominator, spamCount, conditionsApplied, setScenario])

  const toggle = (key: ClueKey) => setActive((prev) => ({ ...prev, [key]: !prev[key] }))

  const conditionLabel =
    activeKeys.length === 0
      ? 'the whole inbox'
      : CLUES.filter((c) => active[c.key])
          .map((c) => c.label)
          .join(' + ')

  const layoutTransition = reduced
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 500, damping: 38, mass: 0.6 }

  return (
    <div data-testid="spam-inbox" className="flex h-full min-h-0 flex-col gap-3">
      {/* Live readout — P(spam) in the current view + the shrinking denominator. */}
      <div className="shrink-0 rounded-2xl bg-accent/5 px-4 py-3 text-center ring-1 ring-accent/20">
        <p className="text-xs font-medium text-slate-500">
          {activeKeys.length === 0 ? 'P(spam) across all email' : `P(spam | ${conditionLabel})`}
        </p>
        <p
          data-testid="p-spam"
          className="text-4xl font-extrabold tabular-nums text-ink"
        >
          {pSpam}%
        </p>
        <div className="mx-auto mt-1 h-2 max-w-xs overflow-hidden rounded-full bg-slate-200">
          <motion.div
            className="h-full rounded-full bg-bad"
            animate={{ width: `${pSpam}%` }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 30 }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          <b className="text-bad">{spamCount}</b> spam in <b data-testid="denominator">{denominator}</b>{' '}
          {denominator === 1 ? 'email' : 'emails'}
        </p>
      </div>

      {/* Clue chips — large, touch-first toggles. Hidden in the static frame. */}
      {interactive && (
        <div className="shrink-0 flex flex-wrap justify-center gap-2">
          {CLUES.map((c) => {
            const on = active[c.key]
            return (
              <button
                key={c.key}
                type="button"
                data-testid={c.testid}
                aria-pressed={on}
                onClick={() => toggle(c.key)}
                className={`min-h-[44px] cursor-pointer rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors duration-150 ${
                  on
                    ? 'bg-accent text-white ring-accent'
                    : 'bg-white text-ink ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}

      {/* The inbox: ~100 envelopes. Non-matching ones fade/slide out, survivors
          repack via Framer layout. Reduced motion → jump straight to the slice. */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-slate-100">
        <motion.div layout={!reduced} className="flex h-full flex-wrap content-start justify-center gap-1 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((email) => (
              <motion.div
                key={email.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: 16 }}
                transition={layoutTransition}
                className="h-5 w-7"
                title={email.spam ? 'spam' : 'real'}
              >
                <Envelope spam={email.spam} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Legend so the color-reveal reads at a glance. */}
      <div className="shrink-0 flex items-center justify-center gap-5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm bg-[#fecdd3] ring-1 ring-bad" /> spam
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm bg-slate-200 ring-1 ring-slate-400" /> real
        </span>
      </div>
    </div>
  )
}
