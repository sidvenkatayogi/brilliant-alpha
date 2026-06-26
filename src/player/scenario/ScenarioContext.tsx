import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// PRD §3 — the one engine-adjacent addition. A lightweight per-lesson context
// that holds the mutable "living world" for the active lesson, seeded from
// `lesson.scenario.initialState`. It is EPHEMERAL: it never touches Firestore,
// and re-seeds from the initial state when the lesson resets/restarts (the
// provider is re-mounted via a `key` for that). Widgets read/write it through
// props (threaded by WidgetHost); concept/predict/question steps can reflect
// the same world so the story and the toy are visibly one object.

export type ScenarioState = Record<string, unknown>

export type ScenarioPatch = Partial<ScenarioState> | ((prev: ScenarioState) => ScenarioState)

interface ScenarioContextValue {
  scenario: ScenarioState
  setScenario: (patch: ScenarioPatch) => void
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null)

export function ScenarioProvider({
  initialState,
  children,
}: {
  initialState?: ScenarioState
  children: ReactNode
}) {
  // Snapshot the seed once for this mounted lesson run.
  const seed = useMemo(() => ({ ...(initialState ?? {}) }), [initialState])
  const [scenario, setState] = useState<ScenarioState>(seed)

  const setScenario = useCallback((patch: ScenarioPatch) => {
    setState((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }))
  }, [])

  const value = useMemo(() => ({ scenario, setScenario }), [scenario, setScenario])

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>
}

/**
 * Read the active lesson's shared world. Returns `null` when there's no
 * provider (a non-scenario lesson, or a widget rendered standalone in a test),
 * so widgets must treat scenario access as optional.
 */
export function useScenario(): ScenarioContextValue | null {
  return useContext(ScenarioContext)
}
