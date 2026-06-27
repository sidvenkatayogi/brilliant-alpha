// Static lesson metadata, copied from src/content/lessons/*.json. The API needs
// titles / conceptSummary / realWorldHook as the substrate for the AI outline,
// without importing the whole client content bundle. Keep in sync with the
// lesson JSON (ids + the three text fields below).

import type { LessonMetaLite } from './types'

export const LESSON_META: LessonMetaLite[] = [
  {
    id: 'long-run',
    title: 'Chance & the Long Run',
    conceptSummary:
      'Probability is long-run relative frequency: unpredictable one at a time, predictable in bulk.',
    realWorldHook:
      "An insurance company has no idea whether you'll crash your car this year — but across two million drivers, the crash rate barely moves.",
  },
  {
    id: 'combining-events',
    title: 'Combining Events',
    conceptSummary:
      'Independent chances multiply for AND; overlapping chances must avoid double-counting for OR.',
    realWorldHook:
      "A jet's three hydraulic systems each fail on 1 in 1,000 flights — yet all three failing at once is about 1 in a billion.",
  },
  {
    id: 'conditioning',
    title: 'Conditioning',
    conceptSummary:
      'Conditioning on B shrinks the world to B, then recounts how often A happens inside it.',
    realWorldHook:
      "Every spam filter and every 'customers who bought this also bought…' runs on conditioning — updating a probability once you know something.",
  },
  {
    id: 'bayes-base-rates',
    title: 'Bayes & Base Rates',
    conceptSummary:
      'With a rare condition, the few true positives are swamped by false positives from the huge healthy group.',
    realWorldHook:
      "A '99% accurate' test for a rare disease comes back positive. Most people — including many doctors — think you almost certainly have it. They're wrong, often badly.",
  },
  {
    id: 'expected-value',
    title: 'Expected Value & Why the House Wins',
    conceptSummary:
      'Expected value = Σ(outcome × probability). A negative-EV game can feel winnable and still drain you.',
    realWorldHook:
      'A roulette bet pays 35-to-1 and feels like a jackpot waiting to happen. Over time it bleeds you at a steady, mathematically guaranteed rate.',
  },
]

export const LESSON_META_BY_ID: Record<string, LessonMetaLite> = Object.fromEntries(
  LESSON_META.map((l) => [l.id, l]),
)
