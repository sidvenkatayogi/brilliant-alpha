# Long Run — Learn Probability by Doing

**Subject: Probability & Statistics.** A Brilliant-style web app that teaches probability through hands-on
interaction. Each lesson is a **playable scenario** — *the thing you manipulate IS the real-world situation*,
not an abstract chart standing in for it. You predict, run the situation, sometimes get it wrong, and feel the
math bite. Five lessons climb from "what does chance even mean" to "why the house always wins."

**The design rule (v2): the scenario is the mechanic.** You don't read about insurance and then drag an abstract
slider — you *are* the insurer, and the "slider" is how many drivers you've signed up. The aha isn't "watch the
bars settle"; it's "watch your business survive (or not)." Every lesson runs one **predict → act → surprise**
beat through a single living world that persists across its concept, predict, interactive, and question steps.

**Persona — Maya, 29, product manager / curious self-learner.** She learns in ~10-minute phone sessions,
bounces off symbol-heavy textbooks, and loves counterintuitive "wait, *what?*" moments. Every design call is
resolved for her: shorter, more visual, more real-world, less notation. **No AI anywhere** — every check and
every line of feedback is hand-authored and runs client-side.

## The five lessons (scenario games)

1. **The Insurance Desk** — *long-run frequency.* You run a small-town car-insurer. Sign up drivers, run years,
   and watch a positive-margin business still go broke at 10 customers — then steady out at 5,000. (`insuranceDesk`)
2. **The Redundancy Bay** — *AND / OR / independence.* You're an aircraft safety engineer. Bolt on backup hydraulic
   systems and fly a fleet: catastrophes (AND) collapse multiplicatively while maintenance flags (OR) climb. (`redundancyBay`)
3. **The Spam Inbox** — *conditioning.* You tune a spam filter. Toggle clues and the inbox physically collapses to the
   matching slice — P(spam) leaps from ~10% to ~80% because conditioning recounts inside the restricted world. (`spamInbox`)
4. **The Screening Clinic ⭐** — *Bayes / base rates.* 1,000 people stream through a "99% accurate" test; the
   positive bin splits and false positives flood the true ones, so a positive is <10% real. Companion `bayesFormula`
   reveals the equation only after the intuition lands. (`screeningClinic`)
5. **The Casino Floor** — *expected value.* You play roulette with \$100: variance flatters you early, the
   fast-forward reveals the bleed, then **"be the house"** flips the same math into steady profit — closing the loop
   back to the insurer in Lesson 1. (`casinoFloor`)

Every interaction is the situation itself: houses + cars, planes + systems, envelopes, people, chips + a wheel —
flat illustrated SVG for the recognizable scene elements, HTML5 Canvas for the high-count sims (the 1,000-person
clinic, the fleet, the 1,000-spin fast-forward, the multi-year insurance runs). One shared semantic palette
(favorable/true = teal-green, unfavorable/false = rose/amber, accent = indigo) means color means the same thing
everywhere, and state changes are **animated transitions, never instant recolors**.

## Architecture

Content is **data, not code**. A lesson is metadata + an ordered list of **typed steps**
(`concept | predict | interactive | question`). Two registries do the dispatch:

- **Step renderer** (`src/player/StepRenderer.tsx`) maps `step.type` → a step component.
- **Widget registry** (`src/widgets/registry.tsx`) maps `widget.type` → a React component.

Adding a lesson is a JSON file in `src/content/lessons/` (+ registering one widget only if it needs a brand-new
interaction). The renderer never special-cases a lesson — this is what makes Phase 2 (AI-generated content) drop in
later without an engine rewrite.

**Shared scenario state (`src/player/scenario/`).** A lesson JSON may declare an optional `scenario` block
(`role` + `initialState`). A lightweight `ScenarioProvider`, scoped inside `LessonPlayer`, threads that living world
through every step so the story and the toy are one object — widgets read seed values and publish live numbers back,
and concept/predict/question steps reflect the same world. It is **ephemeral**: never persisted to Firestore, and it
re-seeds from `initialState` on resume/restart, so the schema is untouched. Lessons without a `scenario` block behave
exactly as before (independent steps).

```
src/
  content/      types.ts (the model, incl. Scenario) · loadLessons.ts · lessons/*.json
  engine/       checkAnswer · selectFeedback · mastery · streak   (pure, synchronous, no network)
  widgets/      registry · InsuranceDesk · RedundancyBay · SpamInbox · ScreeningClinic · BayesFormula · CasinoFloor
  player/       LessonPlayer · StepRenderer · steps/* · FeedbackPanel · WidgetHost · scenario/ScenarioContext
  auth/         AuthContext · AuthForm · ProtectedRoute
  progress/     ProgressContext · firestore.ts · types.ts
  cohort/       CohortContext · firestore.ts · types · levelBand · weekId · slots · overlap · peerProgress · outline · cohortName · scheduling · avatar · PeerAvatars   (Phase 2)
  screens/      Dashboard · LessonRoute · CompletionScreen · Profile · Group
  lib/          firebase.ts (init + emulator wiring)
functions/      Cloud Functions (TypeScript): assignCohort · generateMeetingOutline   (Phase 2)
```

**Key guarantees**
- Answer-checking + feedback are pure functions over the content model — no network in the answer path, so feedback
  renders in well under 100ms.
- Firestore holds **only per-user state** (progress, streak, milestones); lesson content ships in the bundle.
- All progress/streak writes are **fire-and-forget** and never block feedback or interaction.
- The high-count live sims (`InsuranceDesk`, `RedundancyBay`, `ScreeningClinic`, `CasinoFloor`) render on HTML5 Canvas
  with `requestAnimationFrame` and `devicePixelRatio` for crisp 60fps animation; `SpamInbox` uses SVG + Framer Motion
  for its slide/repack transitions and `BayesFormula` is plain DOM/markup. Every widget honors `prefers-reduced-motion`
  (jump to final states, skip the particle flourishes) and is touch-first.

## Phase 2 — Cohorts, weekly meetings & AI facilitation

Phase 2 turns the solo learner into a small **book-club cohort** and adds the app's **first and only AI feature**.
The Phase 1 learning path is unchanged: lessons still teach with zero model calls, and feedback is hand-authored.
AI touches the **social layer only** — it structures a human discussion, it never teaches probability.

All under a **Group** tab (`/group`), reached from the **View your group / Join a group** CTA on the dashboard:

- **Cohorts** — on first join a learner is matched into a small same-level group (4–6) by a transactional Cloud
  Function, or a new cohort is created. Permanent.
- **Weekly scheduler** — a LettuceMeet-style availability grid (`src/widgets/AvailabilityGrid.tsx`). Slots are stored
  as **absolute UTC instants**, rendered in each member's local timezone. Overlap + suggested slot compute client-side.
  Times are **proposed → approved by the whole group → locked** (no member decides unilaterally); all proposed times
  stay viewable, you can withdraw an approval, and a meeting link can be pasted.
- **AI meeting outline** — `generateMeetingOutline` calls `claude-sonnet-4-6` (key in a Functions secret), grounded in
  the lessons the cohort has completed; strict JSON, parsed defensively, cached on the meeting, with a static fallback.
- **Peer progress on the course path** — each lesson card shows cohort-mates who started/completed it (randomized
  avatar colors), or "be the first one to complete this lesson!" until someone does. Presence, never rankings/scores.

**Backend** (first for this codebase): two callable Cloud Functions in `functions/` — `assignCohort` (transactional)
and `generateMeetingOutline` (holds the Anthropic key). Everything else stays client + security rules. The Anthropic
call is **stubbed under the emulator**, so tests and local runs never hit the real API.

## Tech stack

Vite + React 18 + TypeScript · Tailwind (mobile-first) · React Router · Firebase Auth (email/password + Google) ·
Cloud Firestore · **Cloud Functions + Anthropic SDK (Phase 2, functions package only)** · Firebase Hosting ·
Vitest + React Testing Library · Playwright · Firebase Emulator Suite.

## Setup

```bash
npm install
npm --prefix functions install   # Cloud Functions deps (Phase 2)
cp .env.example .env.local        # then fill in your Firebase web config (see below)
npm run dev                       # http://localhost:5173
```

### Firebase project (one-time)

1. Create a project at <https://console.firebase.google.com> and register a **Web app**; copy its config into `.env.local`
   (the `VITE_FIREBASE_*` keys). These are safe to ship in client builds — data is protected by Firestore rules, not by
   hiding them.
2. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
3. `firebase login` (once) before deploying.
4. **Phase 2 — Cloud Functions** require the **Blaze (pay-as-you-go)** plan + the Anthropic key as a Functions
   **secret** (never committed): `firebase functions:secrets:set ANTHROPIC_API_KEY`. The model is a one-line constant
   in `functions/src/anthropic.ts` (`claude-sonnet-4-6`).

### Run against the local emulators (no live project needed)

```bash
# Phase 2 — build functions, then start Auth + Firestore + Functions on a demo
# project (no real credentials, no Anthropic key needed — the outline is stubbed).
npm run emulators:all        # UI :4000 · functions :5001
npm run dev:test             # in another shell → http://localhost:5173 (uses .env.test)

# Optional: seed a ready-made demo cohort (log in as demo@longrun.app / demo1234)
npm run seed:demo            # after the emulators are up; re-run any time to reset

# (Phase 1 only: `npm run emulators` starts just Auth + Firestore.)
```

## Testing

```bash
npm test                     # Vitest — engine, feedback, mastery, streaks, content, widgets, cohort logic
npm run test:integration     # Firestore rules (emulator) — Phase 1 + cohort privacy boundary
npm --prefix functions test  # Cloud Functions — cohort matching, prompt building, AI outline (Anthropic mocked)
npm run test:e2e             # Playwright — MVP + Group scenarios (auto-starts emulators incl. functions)
```

- **Unit/component:** answer-checking, feedback selection, mastery + unlock rule, streak transitions, step-renderer
  dispatch, widget logic, a content guard across the lessons, and (Phase 2) `levelBand`, overlap math incl. a
  **two-timezone** test, peer-progress state machine, outline parse/fallback, cohort-name generator, and `allApproved`.
- **Integration (emulator):** Phase 1 cross-user rules + the Phase 2 cohort privacy boundary (non-members blocked, no
  cross-member writes, no client `memberUids` write, projection has no forbidden fields).
- **Functions (Anthropic mocked — CI never calls the real API):** `assignCohort` matching, prompt construction, and
  outline cache / malformed-JSON / API-error fallback paths.
- **E2E (Playwright):** Phase 1 flows **plus** Phase 2 — join via the CTA, propose → approve → lock + link, outline
  cached for a second member, and peer presence (be-the-first → peer icon) on the course path; mobile included.

## Deploy (Firebase Hosting + Functions)

```bash
npm run deploy               # vite build + firebase deploy (hosting + Firestore rules + Functions)
```

Phase 2 deploy prerequisites: the project is on **Blaze** and `ANTHROPIC_API_KEY` is set as a Functions secret (see
Setup). A few pure helpers (`levelBand`, `cohortName`, outline parse/fallback) are duplicated in
`functions/src/shared/` because the functions package builds independently — keep the copies in sync.

## Performance targets

Feedback < 100ms (purely local checks) · interactive visuals at 60fps · first interaction < 2s · touch-friendly on
mobile · scales to many concurrent learners (content is static/client-side; Firestore scales).
