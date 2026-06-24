// Named predicates over the 36 two-dice outcomes, shared by the diceGrid and
// conditionFilter widgets. Each outcome is [first die, second die].

export type Outcome = [number, number]

export const ALL_OUTCOMES: Outcome[] = (() => {
  const out: Outcome[] = []
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) out.push([a, b])
  return out
})()

export interface DiceEvent {
  key: string
  label: string
  test: (o: Outcome) => boolean
}

export const DICE_EVENTS: Record<string, DiceEvent> = {
  sum7: { key: 'sum7', label: 'Sum = 7', test: ([a, b]) => a + b === 7 },
  firstEven: { key: 'firstEven', label: 'First die even', test: ([a]) => a % 2 === 0 },
  firstDie3: { key: 'firstDie3', label: 'First die = 3', test: ([a]) => a === 3 },
  firstDie6: { key: 'firstDie6', label: 'First die = 6', test: ([a]) => a === 6 },
  sumGte10: { key: 'sumGte10', label: 'Sum ≥ 10', test: ([a, b]) => a + b >= 10 },
  sumEven: { key: 'sumEven', label: 'Sum is even', test: ([a, b]) => (a + b) % 2 === 0 },
  productEven: { key: 'productEven', label: 'Product is even', test: ([a, b]) => (a * b) % 2 === 0 },
  doubles: { key: 'doubles', label: 'Doubles', test: ([a, b]) => a === b },
}

export function probability(test: (o: Outcome) => boolean): number {
  return ALL_OUTCOMES.filter(test).length / ALL_OUTCOMES.length
}
