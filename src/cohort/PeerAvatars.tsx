import { avatarColor, avatarInitial } from './avatar'
import type { MemberProgress } from './types'

interface PeerAvatarsProps {
  lessonId: string
  members: MemberProgress[]
}

/**
 * Cohort presence overlaid on a lesson card (bottom-right corner):
 *  - once someone has COMPLETED the lesson, a stack of profile icons (completed +
 *    started) with a hover tooltip listing who;
 *  - until then, a "be the first to complete this lesson!" nudge.
 * Presence only — no scores, attempts, or mastery (the projection lacks them).
 * Renders nothing when the learner isn't in a (loaded) cohort.
 */
export default function PeerAvatars({ lessonId, members }: PeerAvatarsProps) {
  if (members.length === 0) return null

  const completed = members.filter((m) => m.lessonsCompleted.includes(lessonId))
  const started = members.filter(
    (m) => m.lessonsStarted.includes(lessonId) && !m.lessonsCompleted.includes(lessonId),
  )

  // Nobody has finished this lesson yet — nudge instead of icons.
  if (completed.length === 0) {
    return (
      <span
        data-testid={`peer-be-first-${lessonId}`}
        className="absolute bottom-2 right-2 z-10 whitespace-nowrap rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent"
      >
        Be the first one to complete this lesson!
      </span>
    )
  }

  const present = [...completed, ...started]
  const MAX = 3
  const shown = present.slice(0, MAX)
  const extra = present.length - shown.length
  const names = (list: MemberProgress[]) => list.map((m) => m.displayName).join(', ')

  return (
    <div
      data-testid={`peer-avatars-${lessonId}`}
      className="group/peers absolute bottom-2 right-2 z-10"
    >
      <div className="flex -space-x-2">
        {shown.map((m) => (
          <span
            key={m.uid}
            data-testid="peer-avatar"
            title={m.displayName}
            className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-white"
            style={{ backgroundColor: avatarColor(m.uid) }}
          >
            {avatarInitial(m.displayName)}
          </span>
        ))}
        {extra > 0 && (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-400 text-xs font-bold text-white ring-2 ring-white">
            +{extra}
          </span>
        )}
      </div>

      {/* Hover tooltip — kept in the DOM (opacity) so it's available to a11y + tests. */}
      <div
        data-testid={`peer-tooltip-${lessonId}`}
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-[16rem] rounded-xl bg-ink px-3 py-2 text-left text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/peers:opacity-100"
      >
        {completed.length > 0 && (
          <p>
            <span className="text-slate-300">Completed by</span> {names(completed)}
          </p>
        )}
        {started.length > 0 && (
          <p>
            <span className="text-slate-300">Started by</span> {names(started)}
          </p>
        )}
      </div>
    </div>
  )
}
