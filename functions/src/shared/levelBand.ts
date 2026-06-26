// DUPLICATE of src/cohort/levelBand.ts — keep in sync. (functions is a separate
// package with its own tsconfig; we copy the few pure helpers it needs rather
// than set up cross-package builds this week.)
//   band 0 = 0 done · band 1 = 1–2 · band 2 = 3–4 · band 3 = 5 / done

export function levelBand(totalLessonsCompleted: number): number {
  const n = Math.max(0, Math.floor(totalLessonsCompleted))
  if (n === 0) return 0
  if (n <= 2) return 1
  if (n <= 4) return 2
  return 3
}
