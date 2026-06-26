// A proposed time locks only when every cohort member has approved it. Pure so
// it's unit-testable independently of the Firestore/UI wiring.

export function allApproved(memberUids: string[], approvals: string[]): boolean {
  return memberUids.length > 0 && memberUids.every((u) => approvals.includes(u))
}
