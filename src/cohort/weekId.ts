// ISO week identifiers ("YYYY-Www") so each cohort gets exactly one meeting poll
// per week (PRD2 D5). A new poll naturally appears each Monday because the id
// changes. Uses the standard ISO-8601 week-numbering rules (weeks start Monday;
// week 1 is the week containing the first Thursday of the year).

/** ISO week id for a given date, computed in the viewer's local time. */
export function currentWeekId(date: Date = new Date()): string {
  // Work on a copy at local noon to dodge DST edges.
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  // ISO weekday: Mon=1 … Sun=7.
  const isoDay = d.getDay() === 0 ? 7 : d.getDay()
  // Shift to the Thursday of this week — its year owns the week number.
  d.setDate(d.getDate() + 4 - isoDay)
  const isoYear = d.getFullYear()
  const yearStart = new Date(isoYear, 0, 1, 12)
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/** Monday (local, 00:00) of the week containing `date`. */
export function startOfIsoWeek(date: Date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const isoDay = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (isoDay - 1))
  return d
}
