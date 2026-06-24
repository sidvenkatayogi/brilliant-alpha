# Long Run — Learn Probability by Doing

**Subject: Probability & Statistics.** A Brilliant-style web app that teaches probability through hands-on
interaction — you predict, manipulate a live visual, sometimes get it wrong, and figure it out. Five lessons
climb from "what does chance even mean" to "why the house always wins."

**Persona — Maya, 29, product manager / curious self-learner.** She learns in ~10-minute phone sessions,
bounces off symbol-heavy textbooks, and loves counterintuitive "wait, *what?*" moments. Every design call is
resolved for her: shorter, more visual, more real-world, less notation. **No AI anywhere** — every check and
every line of feedback is hand-authored and runs client-side.

## The five lessons

1. **Chance & the Long Run** — probability as long-run frequency; a die/coin sampler that converges as trials grow.
2. **Combining Events** — AND/OR/independence on a live 6×6 dice grid.
3. **Conditioning** — P(A | B) as a collapsing sample space.
4. **Bayes & Base Rates ⭐** — a 1,000-person icon array showing why a "99% accurate" positive can still mean you're fine.
5. **Expected Value** — a betting sim where variance flatters you while negative EV bleeds you.

## Architecture

Content is **data, not code**. A lesson is metadata + an ordered list of **typed steps**
(`concept | predict | interactive | question`). Two registries do the dispatch:

- **Step renderer** (`src/player/StepRenderer.tsx`) maps `step.type` → a step component.
- **Widget registry** (`src/widgets/registry.tsx`) maps `widget.type` → a React component.

Adding a lesson is a JSON file in `src/content/lessons/` (+ registering one widget only if it needs a brand-new
interaction). The renderer never special-cases a lesson — this is what makes Phase 2 (AI-generated content) drop in
later without an engine rewrite.

```
src/
  content/      types.ts (the model) · loadLessons.ts · lessons/*.json
  engine/       checkAnswer · selectFeedback · mastery · streak   (pure, synchronous, no network)
  widgets/      registry · CoinSampler · DiceGrid · ConditionFilter · BayesIconArray · EvBettingGame
  player/       LessonPlayer · StepRenderer · steps/* · FeedbackPanel · WidgetHost
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
- Canvas widgets (`CoinSampler`, `EvBettingGame`, `BayesIconArray`) use `requestAnimationFrame` and `devicePixelRatio`
  for crisp 60fps animation; structured visuals (`DiceGrid`, `ConditionFilter`) use SVG/DOM.

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
npm run test:e2e    # Playwright — the 5 MVP scenarios (auto-starts emulators + dev server)
```

- **Unit/component:** answer-checking (MC + numeric tolerance), feedback selection (incl. per-option), mastery + unlock
  rule, streak transitions (mocked dates), step-renderer dispatch, widget logic, and a content guard that structurally
  enforces the Definition of Done across all five lessons.
- **Integration (emulator):** security rules block cross-user access; progress round-trips.
- **E2E (Playwright):** complete-and-recover, live widget manipulation, leave-and-resume, next-step recommendation, and
  the full flow on a phone-sized touch viewport.

## Deploy (Firebase Hosting)

```bash
npm run deploy               # vite build + firebase deploy (hosting + Firestore rules)
```

## Performance targets

Feedback < 100ms (purely local checks) · interactive visuals at 60fps · first interaction < 2s · touch-friendly on
mobile · scales to many concurrent learners (content is static/client-side; Firestore scales).
