// Calendar invites for a confirmed cohort meeting. We support two paths from the
// app (no new dependencies): a downloadable .ics file (works with Apple, Google,
// and Outlook) and a one-click Google Calendar "add event" URL. Both embed the
// full AI meeting outline — agenda, discussion questions, and the quiz questions
// (without answers) — in the event description so the group has everything in
// the invite itself.

import type { AiOutline } from './types'

const MEETING_MINUTES = 60

/** Format a UTC ms-epoch instant as an iCalendar UTC timestamp. */
function icsStamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  )
}

/** Human-readable, multi-line summary of the outline (no quiz answers). */
export function outlineToText(outline: AiOutline | null): string {
  if (!outline) return 'A peer study-group meeting.'
  const lines: string[] = []
  lines.push(`Warm-up: ${outline.warmUp}`, '')
  lines.push('Agenda:')
  for (const a of outline.agenda) lines.push(`  • ${a.title} (${a.minutes} min) — ${a.facilitatorNote}`)
  lines.push('')
  lines.push('Discussion questions:')
  for (const q of outline.discussionQuestions) lines.push(`  • ${q.question}`)
  if (outline.quiz && outline.quiz.length > 0) {
    lines.push('', `Group quiz (${outline.quiz.length} questions — answer key unlocks at meeting time):`)
    outline.quiz.forEach((q, i) => {
      lines.push(`  ${i + 1}. ${q.question}`)
      q.options.forEach((o, j) => lines.push(`     ${String.fromCharCode(65 + j)}. ${o}`))
    })
  }
  lines.push('', `Peer-teaching: ${outline.peerTeachingActivity}`)
  lines.push('', `Wrap-up: ${outline.wrapUp}`)
  return lines.join('\n')
}

// iCalendar requires CRLF line endings and escaping of , ; \ and newlines.
function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

// Long lines should be folded at 75 octets; a simple char-based fold is enough
// for the content we emit here.
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let rest = line
  chunks.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 0) {
    chunks.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  return chunks.join('\r\n')
}

export interface CalendarEvent {
  title: string
  /** UTC ms epoch. */
  start: number
  outline: AiOutline | null
  location?: string | null
}

/** Build a complete .ics VCALENDAR document for the meeting. */
export function buildIcs(ev: CalendarEvent): string {
  const start = ev.start
  const end = ev.start + MEETING_MINUTES * 60_000
  const description = outlineToText(ev.outline)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Long Run//Cohort Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${start}-cohort@long-run`,
    `DTSTAMP:${icsStamp(start)}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${escapeIcs(ev.title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    ev.location ? `LOCATION:${escapeIcs(ev.location)}` : null,
    ev.location ? `URL:${escapeIcs(ev.location)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null)
  return lines.map(foldLine).join('\r\n')
}

/** A pre-filled Google Calendar "add event" URL for the meeting. */
export function googleCalendarUrl(ev: CalendarEvent): string {
  const end = ev.start + MEETING_MINUTES * 60_000
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${icsStamp(ev.start)}/${icsStamp(end)}`,
    details: outlineToText(ev.outline),
  })
  if (ev.location) params.set('location', ev.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Trigger a client-side download of an .ics file. */
export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
