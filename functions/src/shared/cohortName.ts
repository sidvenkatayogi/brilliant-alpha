// DUPLICATE of src/cohort/cohortName.ts — keep in sync.

const ADJECTIVES = [
  'Lucky', 'Likely', 'Bold', 'Curious', 'Steady', 'Random', 'Fair', 'Clever',
  'Rolling', 'Long-Run', 'Sure', 'Surprising',
]

const NOUNS = [
  'Priors', 'Outcomes', 'Trials', 'Samples', 'Events', 'Odds', 'Distributions',
  'Frequencies', 'Estimators', 'Gamblers', 'Bayesians', 'Variables',
]

function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function cohortName(seed: string): string {
  const h = hash(seed)
  const adj = ADJECTIVES[h % ADJECTIVES.length]
  const noun = NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length]
  return `The ${adj} ${noun}`
}
