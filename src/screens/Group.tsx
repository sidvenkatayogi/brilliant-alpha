import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCohort } from '../cohort/CohortContext'
import { lessonsById } from '../content/loadLessons'
import { computeOverlap, suggestBestSlot } from '../cohort/overlap'
import { generateSlots, labelSlot } from '../cohort/slots'
import { avatarColor, avatarInitial } from '../cohort/avatar'
import AvailabilityGrid from '../widgets/AvailabilityGrid'
import type { AiOutline } from '../cohort/types'

export default function Group() {
  const { user } = useAuth()
  const {
    cohort,
    members,
    meeting,
    availabilities,
    loading,
    assigning,
    ensureCohort,
    setMyAvailability,
    proposeSlot,
    approveProposal,
    unapproveProposal,
    changeTime,
    setMeetingLink,
    generateOutline,
  } = useCohort()

  // Lazily assign + load on first open (PRD2 D3).
  useEffect(() => {
    void ensureCohort()
    // ensureCohort is stable per cohortId; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Section UI state lives here (not in the nested section components) so it
  // survives Group re-renders — those re-render/remount the inner sections.
  const [view, setView] = useState<'edit' | 'overlap'>('edit')
  const [picking, setPicking] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [outlineBusy, setOutlineBusy] = useState(false)
  const [outlineError, setOutlineError] = useState<string | null>(null)
  const [outline, setOutline] = useState<AiOutline | null>(null)
  useEffect(() => {
    setOutline(meeting?.aiOutline ?? null)
  }, [meeting?.aiOutline])
  const runOutline = useCallback(
    async (force: boolean) => {
      setOutlineBusy(true)
      setOutlineError(null)
      try {
        setOutline(await generateOutline(force))
      } catch (e) {
        setOutlineError(e instanceof Error ? e.message : 'Could not generate the outline.')
      } finally {
        setOutlineBusy(false)
      }
    },
    [generateOutline],
  )

  if (loading && !cohort) {
    return (
      <Shell>
        <div className="grid min-h-[40vh] place-items-center text-slate-400">
          {assigning ? 'Finding your group…' : 'Loading…'}
        </div>
      </Shell>
    )
  }

  if (!cohort) {
    return (
      <Shell>
        <p className="card mt-6 text-sm text-slate-500">
          We couldn’t load your group. Check back soon.
        </p>
      </Shell>
    )
  }

  const soloCohort = cohort.memberUids.length <= 1

  return (
    <Shell>
      <header className="mt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{cohort.name}</h1>
        <p className="text-sm text-slate-500">Your study cohort</p>
      </header>

      {soloCohort && (
        <p className="card mt-4 text-sm text-slate-500">
          Your group is just forming — invite a friend or check back soon as others
          reach your level. Everything below already works for one.
        </p>
      )}

      <MembersSection />
      <MeetingSection />
      <OutlineSection />
    </Shell>
  )

  // --- Members -------------------------------------------------------------
  function MembersSection() {
    return (
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
          Members
        </h2>
        <ul className="space-y-2">
          {members.length === 0 && (
            <li className="card text-sm text-slate-500">No members loaded yet.</li>
          )}
          {members.map((m) => {
            const lesson = m.currentLessonId ? lessonsById[m.currentLessonId] : undefined
            const position = lesson
              ? `on ${lesson.title}`
              : m.lessonsCompleted.length > 0
                ? 'between lessons'
                : 'just starting'
            return (
              <li key={m.uid} className="card flex items-center gap-3 py-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: avatarColor(m.uid) }}
                >
                  {avatarInitial(m.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">
                    {m.displayName}
                    {m.uid === user?.uid && <span className="text-slate-400"> (you)</span>}
                  </span>
                  <span className="block text-sm text-slate-500">{position}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  // --- This week's meeting -------------------------------------------------
  function MeetingSection() {
    const slots = useMemo(
      () => (meeting ? generateSlots(meeting.slotConfig) : []),
      [],
    )
    const mySlots = useMemo(
      () => availabilities.find((a) => a.uid === user?.uid)?.slots ?? [],
      [],
    )
    const overlap = useMemo(() => computeOverlap(availabilities, slots), [slots])
    const suggested = useMemo(() => suggestBestSlot(availabilities, slots), [slots])

    if (!meeting) return null

    const finalized = meeting.finalizedSlotStart
    const scheduled = meeting.status === 'scheduled' && finalized != null
    const proposals = [...(meeting.proposals ?? [])].sort((a, b) => a.slotStart - b.slotStart)
    const memberUids = cohort?.memberUids ?? []
    const nameOf = (uid: string) =>
      members.find((m) => m.uid === uid)?.displayName ?? 'Member'
    // No proposals yet → go straight to the grid; otherwise show the list.
    const showGrid = picking || proposals.length === 0

    const grid = (
      <div className="card">
        {proposals.length > 0 && (
          <button
            type="button"
            className="mb-3 text-sm text-slate-500 hover:text-ink"
            onClick={() => setPicking(false)}
            data-testid="back-to-proposals"
          >
            ← Back to proposed times
          </button>
        )}
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            className={view === 'edit' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}
            onClick={() => setView('edit')}
          >
            My availability
          </button>
          <button
            type="button"
            className={view === 'overlap' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}
            onClick={() => setView('overlap')}
            data-testid="overlap-toggle"
          >
            Overlap
          </button>
        </div>

        <AvailabilityGrid
          slotConfig={meeting.slotConfig}
          mode={view}
          selected={mySlots}
          overlapCounts={overlap}
          memberCount={Math.max(availabilities.length, 1)}
          suggested={suggested}
          onChange={(s) => void setMyAvailability(s)}
          onConfirm={(s) => {
            void proposeSlot(s)
            setPicking(false) // back to the list with the new proposal added
          }}
        />

        {view === 'edit' && (
          <p className="mt-3 text-xs text-slate-400">
            Drag to mark when you’re free. Switch to “Overlap” to see the best time.
          </p>
        )}
        {view === 'overlap' && (
          <p className="mt-3 text-xs text-slate-400">
            {suggested != null ? (
              <>
                Best slot: <strong>{labelSlot(suggested).day} {labelSlot(suggested).time}</strong>.
                Tap a slot to propose it — the group approves before it’s locked.
              </>
            ) : (
              'No availability yet — be the first to add yours.'
            )}
          </p>
        )}
      </div>
    )

    return (
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
          This week’s meeting
        </h2>

        {scheduled ? (
          <div className="card">
            <p className="text-sm text-slate-500">Confirmed time · approved by the group</p>
            <p className="text-lg font-bold text-ink">
              {labelSlot(finalized).day}, {labelSlot(finalized).time}
            </p>
            {meeting.meetingLink ? (
              <a
                href={meeting.meetingLink}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block break-all text-sm font-medium text-accent hover:underline"
              >
                {meeting.meetingLink}
              </a>
            ) : (
              <div className="mt-3 flex gap-2">
                <input
                  className="min-h-[44px] flex-1 rounded-xl px-3 text-sm ring-1 ring-slate-200"
                  placeholder="Paste a Zoom/Meet link"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  data-testid="meeting-link-input"
                />
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!linkInput.trim()}
                  onClick={() => void setMeetingLink(linkInput.trim())}
                >
                  Save
                </button>
              </div>
            )}
            <div className="mt-3 flex gap-4 text-sm text-slate-400">
              <button
                type="button"
                className="hover:text-ink"
                onClick={() => void changeTime()}
                data-testid="unlock-meeting"
              >
                Change time
              </button>
              <button
                type="button"
                className="hover:text-bad"
                onClick={() => finalized != null && void unapproveProposal(finalized)}
                data-testid="withdraw-approval"
              >
                Withdraw my approval
              </button>
            </div>
          </div>
        ) : showGrid ? (
          grid
        ) : (
          // Proposed times — view them all and approve any.
          <div className="card" data-testid="meeting-proposal">
            <p className="mb-3 text-sm text-slate-500">
              Proposed times · everyone approves before a time is locked
            </p>
            <ul className="space-y-3">
              {proposals.map((p) => {
                const approvedCount = memberUids.filter((u) => p.approvals.includes(u)).length
                const mine = user ? p.approvals.includes(user.uid) : false
                return (
                  <li
                    key={p.slotStart}
                    data-testid={`proposal-${p.slotStart}`}
                    className="rounded-xl p-3 ring-1 ring-slate-100"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {labelSlot(p.slotStart).day}, {labelSlot(p.slotStart).time}
                        </p>
                        <p className="text-xs text-slate-400">
                          proposed by {p.proposedBy === user?.uid ? 'you' : nameOf(p.proposedBy)} ·{' '}
                          {approvedCount} of {memberUids.length} approved
                        </p>
                      </div>
                      {mine ? (
                        <button
                          type="button"
                          data-testid="you-approved"
                          onClick={() => void unapproveProposal(p.slotStart)}
                          className="group/undo shrink-0 text-xs font-semibold text-good hover:text-bad"
                          title="Withdraw your approval"
                        >
                          <span className="group-hover/undo:hidden">✓ You approved</span>
                          <span className="hidden group-hover/undo:inline">✕ Withdraw approval</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary shrink-0 px-3 py-1.5 text-sm"
                          onClick={() => void approveProposal(p.slotStart)}
                          data-testid="approve-time"
                        >
                          Approve
                        </button>
                      )}
                    </div>

                    {/* Per-member approval avatars. */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {memberUids.map((uid) => {
                        const ok = p.approvals.includes(uid)
                        return (
                          <span
                            key={uid}
                            data-testid="approval-chip"
                            data-approved={ok}
                            title={`${nameOf(uid)}${ok ? ' — approved' : ' — pending'}`}
                            className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: avatarColor(uid), opacity: ok ? 1 : 0.3 }}
                          >
                            {avatarInitial(nameOf(uid))}
                          </span>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ul>

            <button
              type="button"
              className="btn-ghost mt-4 w-full"
              onClick={() => setPicking(true)}
              data-testid="propose-another"
            >
              Propose another time
            </button>
          </div>
        )}
      </section>
    )
  }

  // --- AI outline ----------------------------------------------------------
  function OutlineSection() {
    // State lives on Group (see top) so it survives section remounts.
    const current = outline
    const busy = outlineBusy
    const error = outlineError
    const run = runOutline

    return (
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
          Meeting outline
        </h2>
        {!current ? (
          <div className="card">
            <p className="text-sm text-slate-500">
              Get a ready-made discussion agenda for your call, based on the lessons
              your group has finished.
            </p>
            <button
              type="button"
              className="btn-primary mt-3 w-full"
              disabled={busy}
              onClick={() => void run(false)}
              data-testid="generate-outline"
            >
              {busy ? 'Generating…' : 'Generate outline'}
            </button>
            {error && <p className="mt-2 text-sm text-bad">{error}</p>}
          </div>
        ) : (
          <div className="card space-y-4" data-testid="outline">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-accent">Warm-up</p>
              <p className="text-sm text-ink">{current.warmUp}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-accent">Agenda</p>
              <ul className="mt-1 space-y-2">
                {current.agenda.map((a, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-semibold text-ink">{a.title}</span>
                    <span className="text-slate-400"> · {a.minutes} min</span>
                    <span className="block text-slate-500">{a.facilitatorNote}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-accent">
                Discussion questions
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
                {current.discussionQuestions.map((q, i) => (
                  <li key={i}>{q.question}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-accent">
                Peer-teaching
              </p>
              <p className="text-sm text-ink">{current.peerTeachingActivity}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-accent">Wrap-up</p>
              <p className="text-sm text-ink">{current.wrapUp}</p>
            </div>
            <button
              type="button"
              className="text-sm text-slate-400 hover:text-ink disabled:opacity-40"
              disabled={busy}
              onClick={() => void run(true)}
              data-testid="regenerate-outline"
            >
              {busy ? 'Regenerating…' : 'Regenerate'}
            </button>
            {error && <p className="text-sm text-bad">{error}</p>}
          </div>
        )}
      </section>
    )
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <nav className="flex items-center justify-between text-sm">
        <Link to="/" className="font-medium text-slate-500 hover:text-ink">
          ← Course
        </Link>
        <Link to="/profile" className="font-medium text-slate-500 hover:text-ink">
          Profile
        </Link>
      </nav>
      {children}
    </div>
  )
}
