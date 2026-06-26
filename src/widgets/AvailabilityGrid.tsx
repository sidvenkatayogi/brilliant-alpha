import { useEffect, useMemo, useRef, useState } from 'react'
import type { SlotConfig } from '../cohort/types'
import { generateSlots, labelSlot } from '../cohort/slots'

interface AvailabilityGridProps {
  slotConfig: SlotConfig
  /** Edit mode: the caller's own free slots (UTC ms). */
  selected?: number[]
  /** Overlap mode: free-count per slot + total members for heatmap intensity. */
  overlapCounts?: Record<number, number>
  memberCount?: number
  /** Suggested best slot (overlap mode), highlighted. */
  suggested?: number | null
  /** The locked/confirmed slot, if any. */
  finalized?: number | null
  mode: 'edit' | 'overlap'
  /** Edit mode — committed (debounced) on pointer release. */
  onChange?: (slots: number[]) => void
  /** Overlap mode — tap a slot to confirm it. */
  onConfirm?: (slot: number) => void
}

/**
 * Touch-first availability picker (LettuceMeet/when2meet style, PRD2 §11).
 * Day columns × time-block rows in the viewer's LOCAL timezone (slots are stored
 * as absolute UTC instants). Drag to paint/clear in edit mode; tap to confirm in
 * overlap mode. DOM + pointer events kept smooth with `touch-action: none` so a
 * drag paints instead of scrolling.
 */
export default function AvailabilityGrid({
  slotConfig,
  selected = [],
  overlapCounts = {},
  memberCount = 0,
  suggested = null,
  finalized = null,
  mode,
  onChange,
  onConfirm,
}: AvailabilityGridProps) {
  const slots = useMemo(() => generateSlots(slotConfig), [slotConfig])
  const nHours = Math.round((slotConfig.endHour - slotConfig.startHour) / (slotConfig.blockMinutes / 60))

  // Local working selection for edit mode.
  const [working, setWorking] = useState<Set<number>>(new Set(selected))
  useEffect(() => {
    setWorking(new Set(selected))
    // Only resync when the incoming selection identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join(',')])

  const dragging = useRef(false)
  const paintAdd = useRef(true)

  // Commit on pointer release anywhere.
  useEffect(() => {
    if (mode !== 'edit') return
    const up = () => {
      if (dragging.current) {
        dragging.current = false
        onChange?.([...working])
      }
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [mode, working, onChange])

  const applyPaint = (slot: number) => {
    setWorking((prev) => {
      const next = new Set(prev)
      if (paintAdd.current) next.add(slot)
      else next.delete(slot)
      return next
    })
  }

  // Column day labels (one per day) + row time labels.
  const dayLabels = slotConfig.days.map((_, dayIdx) => {
    const slot = slots[dayIdx * nHours]
    return labelSlot(slot).day
  })
  const timeLabels = Array.from({ length: nHours }, (_, hourIdx) =>
    labelSlot(slots[hourIdx]).time,
  )

  const cellColor = (slot: number): string => {
    if (mode === 'edit') {
      return working.has(slot) ? 'bg-accent' : 'bg-slate-100'
    }
    // Overlap heatmap.
    const count = overlapCounts[slot] ?? 0
    if (count === 0) return 'bg-slate-100'
    const intensity = memberCount > 0 ? count / memberCount : 0
    if (intensity >= 1) return 'bg-good'
    if (intensity >= 0.66) return 'bg-accent'
    if (intensity >= 0.33) return 'bg-accent-soft'
    return 'bg-accent/30'
  }

  return (
    <div className="select-none">
      <div className="flex gap-1">
        {/* Time gutter */}
        <div className="flex shrink-0 flex-col gap-1 pt-6">
          {timeLabels.map((t) => (
            <div key={t} className="flex h-7 items-center pr-1 text-[10px] text-slate-400">
              {t}
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${slotConfig.days.length}, minmax(0, 1fr))` }}>
          {slotConfig.days.map((day, dayIdx) => (
            <div key={day} className="flex flex-col gap-1">
              <div className="h-6 text-center text-[10px] font-medium text-slate-500">
                {dayLabels[dayIdx]}
              </div>
              {Array.from({ length: nHours }, (_, hourIdx) => {
                const slot = slots[dayIdx * nHours + hourIdx]
                const isSuggested = mode === 'overlap' && suggested === slot
                const isFinal = finalized === slot
                const count = overlapCounts[slot] ?? 0
                return (
                  <button
                    key={slot}
                    type="button"
                    data-testid={`slot-${slot}`}
                    data-selected={mode === 'edit' ? working.has(slot) : undefined}
                    data-count={mode === 'overlap' ? count : undefined}
                    style={{ touchAction: 'none' }}
                    className={`h-7 rounded ${cellColor(slot)} ${
                      isFinal ? 'ring-2 ring-good' : isSuggested ? 'ring-2 ring-accent' : ''
                    }`}
                    onPointerDown={(e) => {
                      if (mode === 'edit') {
                        e.preventDefault()
                        dragging.current = true
                        paintAdd.current = !working.has(slot)
                        applyPaint(slot)
                      }
                    }}
                    onPointerEnter={() => {
                      if (mode === 'edit' && dragging.current) applyPaint(slot)
                    }}
                    onClick={() => {
                      if (mode === 'overlap') onConfirm?.(slot)
                    }}
                    aria-label={`${dayLabels[dayIdx]} ${timeLabels[hourIdx]}${
                      mode === 'overlap' ? `, ${count} free` : ''
                    }`}
                    title={
                      mode === 'overlap'
                        ? `${labelSlot(slot).day} ${labelSlot(slot).time} — ${count} free`
                        : `${labelSlot(slot).day} ${labelSlot(slot).time}`
                    }
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
