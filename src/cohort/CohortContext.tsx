import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/AuthContext'
import { useProgress } from '../progress/ProgressContext'
import {
  assignCohort as assignCohortFn,
  fetchAvailabilities,
  fetchCohort,
  fetchMemberProgress,
  ensureMeeting,
  generateMeetingOutline,
  saveAvailability,
  setMeetingLink as setMeetingLinkFn,
  setMeetingScheduling,
} from './firestore'
import { buildSlotConfig } from './slots'
import { currentWeekId } from './weekId'
import { allApproved } from './scheduling'
import type {
  AiOutline,
  Availability,
  Cohort,
  MemberProgress,
  Meeting,
  MeetingProposal,
} from './types'

interface CohortContextValue {
  cohort: Cohort | null
  members: MemberProgress[]
  meeting: Meeting | null
  availabilities: Availability[]
  weekId: string
  loading: boolean
  assigning: boolean
  /** Lazily assign + load the cohort and this week's meeting (PRD2 D3). */
  ensureCohort: () => Promise<void>
  /** Load the cohort only if already assigned — never creates one. */
  loadIfAssigned: () => Promise<void>
  /** Reload members / meeting / availabilities. */
  refresh: () => Promise<void>
  setMyAvailability: (slots: number[]) => Promise<void>
  /** Add a time to the list of proposals (locks immediately if you're solo). */
  proposeSlot: (slotStart: number) => Promise<void>
  /** Approve a specific proposed time; locks once everyone has approved it. */
  approveProposal: (slotStart: number) => Promise<void>
  /** Withdraw your approval of a proposed time (unlocks it if it was locked). */
  unapproveProposal: (slotStart: number) => Promise<void>
  /** Unlock a confirmed time (keeps the proposals so they're still viewable). */
  changeTime: () => Promise<void>
  setMeetingLink: (link: string) => Promise<void>
  generateOutline: (force?: boolean) => Promise<AiOutline>
}

const CohortContext = createContext<CohortContextValue | null>(null)

export function CohortProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { userDoc, setCohortId } = useProgress()
  const [cohort, setCohort] = useState<Cohort | null>(null)
  const [members, setMembers] = useState<MemberProgress[]>([])
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [availabilities, setAvailabilities] = useState<Availability[]>([])
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const weekId = currentWeekId()

  /** Load everything for a known cohort id. */
  const loadCohort = useCallback(
    async (cohortId: string) => {
      const [c, mems] = await Promise.all([
        fetchCohort(cohortId),
        fetchMemberProgress(cohortId),
      ])
      setCohort(c)
      setMembers(mems)
      // Ensure this week's meeting exists (race-safe), then load availability.
      const m = await ensureMeeting(cohortId, weekId, buildSlotConfig())
      setMeeting(m)
      setAvailabilities(await fetchAvailabilities(cohortId, weekId))
    },
    [weekId],
  )

  const ensureCohort = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let cohortId = userDoc?.cohortId ?? null
      if (!cohortId) {
        setAssigning(true)
        cohortId = await assignCohortFn()
        setCohortId(cohortId) // reflect locally so the peer projection starts syncing
        setAssigning(false)
      }
      await loadCohort(cohortId)
    } finally {
      setAssigning(false)
      setLoading(false)
    }
  }, [user, userDoc?.cohortId, loadCohort, setCohortId])

  const loadIfAssigned = useCallback(async () => {
    const cohortId = userDoc?.cohortId
    if (!user || !cohortId) return
    setLoading(true)
    try {
      await loadCohort(cohortId)
    } finally {
      setLoading(false)
    }
  }, [user, userDoc?.cohortId, loadCohort])

  const refresh = useCallback(async () => {
    if (cohort) await loadCohort(cohort.id)
  }, [cohort, loadCohort])

  const setMyAvailability = useCallback(
    async (slots: number[]) => {
      if (!cohort || !user) return
      const mine: Availability = {
        uid: user.uid,
        displayName: userDoc?.displayName ?? user.displayName ?? 'Learner',
        slots,
        updatedAt: Date.now(),
      }
      // Optimistic local update so the overlap view is instant.
      setAvailabilities((prev) => [...prev.filter((a) => a.uid !== user.uid), mine])
      await saveAvailability(cohort.id, weekId, mine)
    },
    [cohort, user, userDoc?.displayName, weekId],
  )

  const allApprove = useCallback(
    (approvals: string[]) => allApproved(cohort?.memberUids ?? [], approvals),
    [cohort],
  )

  const proposeSlot = useCallback(
    async (slotStart: number) => {
      if (!cohort || !user || !meeting) return
      const existing = meeting.proposals ?? []
      // Re-tapping an already-proposed time just approves it.
      if (existing.some((p) => p.slotStart === slotStart)) {
        const proposals = existing.map((p) =>
          p.slotStart === slotStart
            ? { ...p, approvals: Array.from(new Set([...p.approvals, user.uid])) }
            : p,
        )
        const target = proposals.find((p) => p.slotStart === slotStart)!
        const finalize = allApprove(target.approvals)
        const patch = {
          proposals,
          status: (finalize ? 'scheduled' : 'proposed') as Meeting['status'],
          finalizedSlotStart: finalize ? slotStart : null,
          confirmedBy: finalize ? user.uid : null,
        }
        await setMeetingScheduling(cohort.id, weekId, patch)
        setMeeting((prev) => (prev ? { ...prev, ...patch } : prev))
        return
      }
      const fresh: MeetingProposal = { slotStart, proposedBy: user.uid, approvals: [user.uid] }
      const proposals = [...existing, fresh]
      const finalize = allApprove(fresh.approvals) // true only in a solo cohort
      const patch = {
        proposals,
        status: (finalize ? 'scheduled' : 'proposed') as Meeting['status'],
        finalizedSlotStart: finalize ? slotStart : null,
        confirmedBy: finalize ? user.uid : null,
      }
      await setMeetingScheduling(cohort.id, weekId, patch)
      setMeeting((prev) => (prev ? { ...prev, ...patch } : prev))
    },
    [cohort, user, meeting, weekId, allApprove],
  )

  const approveProposal = useCallback(
    async (slotStart: number) => {
      if (!cohort || !user || !meeting) return
      const proposals = (meeting.proposals ?? []).map((p) =>
        p.slotStart === slotStart
          ? { ...p, approvals: Array.from(new Set([...p.approvals, user.uid])) }
          : p,
      )
      const target = proposals.find((p) => p.slotStart === slotStart)
      if (!target) return
      const finalize = allApprove(target.approvals)
      const patch = {
        proposals,
        status: (finalize ? 'scheduled' : 'proposed') as Meeting['status'],
        finalizedSlotStart: finalize ? slotStart : null,
        confirmedBy: finalize ? user.uid : null,
      }
      await setMeetingScheduling(cohort.id, weekId, patch)
      setMeeting((prev) => (prev ? { ...prev, ...patch } : prev))
    },
    [cohort, user, meeting, weekId, allApprove],
  )

  const unapproveProposal = useCallback(
    async (slotStart: number) => {
      if (!cohort || !user || !meeting) return
      const proposals = (meeting.proposals ?? [])
        .map((p) =>
          p.slotStart === slotStart
            ? { ...p, approvals: p.approvals.filter((u) => u !== user.uid) }
            : p,
        )
        // A time nobody approves is dropped (e.g. the proposer withdraws and it
        // falls to zero approvals).
        .filter((p) => p.approvals.length > 0)
      // Withdrawing an approval can't leave a time fully approved, so it unlocks.
      const patch = {
        proposals,
        status: (proposals.length > 0 ? 'proposed' : 'scheduling') as Meeting['status'],
        finalizedSlotStart: null,
        confirmedBy: null,
      }
      await setMeetingScheduling(cohort.id, weekId, patch)
      setMeeting((prev) => (prev ? { ...prev, ...patch } : prev))
    },
    [cohort, user, meeting, weekId],
  )

  const changeTime = useCallback(async () => {
    if (!cohort || !meeting) return
    // Unlock but keep the proposals so the group can still see/pick among them.
    const proposals = meeting.proposals ?? []
    const patch = {
      proposals,
      status: (proposals.length > 0 ? 'proposed' : 'scheduling') as Meeting['status'],
      finalizedSlotStart: null,
      confirmedBy: null,
    }
    await setMeetingScheduling(cohort.id, weekId, patch)
    setMeeting((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [cohort, meeting, weekId])

  const setMeetingLink = useCallback(
    async (link: string) => {
      if (!cohort) return
      await setMeetingLinkFn(cohort.id, weekId, link)
      setMeeting((prev) => (prev ? { ...prev, meetingLink: link } : prev))
    },
    [cohort, weekId],
  )

  const generateOutline = useCallback(
    async (force = false) => {
      if (!cohort) throw new Error('No cohort')
      const { outline } = await generateMeetingOutline(cohort.id, weekId, force)
      setMeeting((prev) => (prev ? { ...prev, aiOutline: outline } : prev))
      return outline
    },
    [cohort, weekId],
  )

  return (
    <CohortContext.Provider
      value={{
        cohort,
        members,
        meeting,
        availabilities,
        weekId,
        loading,
        assigning,
        ensureCohort,
        loadIfAssigned,
        refresh,
        setMyAvailability,
        proposeSlot,
        approveProposal,
        unapproveProposal,
        changeTime,
        setMeetingLink,
        generateOutline,
      }}
    >
      {children}
    </CohortContext.Provider>
  )
}

export function useCohort(): CohortContextValue {
  const ctx = useContext(CohortContext)
  if (!ctx) throw new Error('useCohort must be used within CohortProvider')
  return ctx
}
