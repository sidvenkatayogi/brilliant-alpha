// Profile-icon colours. Deterministic per seed (uid) so a person keeps the same
// colour everywhere, but spread pseudo-randomly across a bright palette. Letters
// are always rendered white by the components that use these.

const PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#10b981', // emerald
  '#14b8a6', // teal
  '#0ea5e9', // sky
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#d946ef', // fuchsia
]

function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A stable background colour (hex) for a person's profile icon. */
export function avatarColor(seed: string): string {
  return PALETTE[hash(seed) % PALETTE.length]
}

/** First letter of a display name, uppercased. */
export function avatarInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase()
}
