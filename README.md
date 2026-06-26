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
  screens/      Dashboard · LessonRoute · CompletionScreen · Profile
  lib/          firebase.ts (init + emulator wiring)
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

## Tech stack

Vite + React 18 + TypeScript · Tailwind (mobile-first) · React Router · Firebase Auth (email/password + Google) ·
Cloud Firestore · Firebase Hosting · Vitest + React Testing Library · Playwright · Firebase Emulator Suite.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in your Firebase web config (see below)
npm run dev                  # http://localhost:5173
```

### Firebase project (one-time)

1. Create a project at <https://console.firebase.google.com> and register a **Web app**; copy its config into `.env.local`
   (the `VITE_FIREBASE_*` keys). These are safe to ship in client builds — data is protected by Firestore rules, not by
   hiding them.
2. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
3. `firebase login` (once) before deploying.

### Run against the local emulators (no live project needed)

```bash
npm run emulators            # Auth + Firestore on :9099 / :8080, UI on :4000
# in another shell, with VITE_USE_EMULATORS=true in .env.local:
npm run dev
```

## Testing

```bash
npm test            # Vitest — engine, feedback, mastery, streaks, content, widgets, components
npm run test:e2e    # Playwright — the MVP scenarios + extras (auto-starts emulators + dev server)
```

- **Unit/component:** answer-checking (MC + numeric tolerance), feedback selection (incl. per-option), mastery + unlock
  rule, streak transitions (mocked dates), step-renderer dispatch, widget logic, and a content guard that structurally
  enforces the Definition of Done across all five lessons.
- **Integration (emulator):** security rules block cross-user access; progress round-trips.
- **E2E (Playwright):** complete-and-recover, live widget manipulation, leave-and-resume, next-step recommendation, the
  full flow on a phone-sized touch viewport, plus the revisit nudge and a lesson-redo-improves-mastery flow.

## Deploy (Firebase Hosting)

```bash
npm run deploy               # vite build + firebase deploy (hosting + Firestore rules)
```

## Performance targets

Feedback < 100ms (purely local checks) · interactive visuals at 60fps · first interaction < 2s · touch-friendly on
mobile · scales to many concurrent learners (content is static/client-side; Firestore scales).
