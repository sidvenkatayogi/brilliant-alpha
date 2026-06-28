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
interaction). The renderer never special-cases a lesson.

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
  cohort/       CohortContext · firestore.ts · types · levelBand · weekId · slots · overlap · peerProgress · outline · calendar · cohortName · scheduling · avatar · PeerAvatars
  screens/      Dashboard · LessonRoute · CompletionScreen · Profile · Group
  lib/          firebase.ts (Auth + Firestore init) · api.ts (authed fetch to /api)
api/            Vercel serverless functions: cohort.ts (POST /api/cohort — assignCohort | generateOutline | getAnswerKey)
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
- **AI meeting outline + group quiz** — `POST /api/cohort` with `action: generateOutline` calls OpenAI `gpt-4o-mini`,
  grounded in the lessons the **whole cohort** has completed; strict JSON, parsed defensively, cached on the meeting,
  with a static fallback. The outline includes a short (~5 question) multiple-choice quiz everyone takes.
- **Answer-key verification layer** — before the quiz answer key is persisted, every AI-generated item is passed
  through a deterministic, code-side verifier (verify → repair → replace). The verifier matches each `answerIndex`
  against the lesson's authoritative `conceptSummary` and the known misconception `DISTRACTORS` bank. A mis-marked item
  is repaired in place; an item that cannot be confidently verified is replaced with a provably-correct deterministic
  item. No second AI call. Guarantee: every persisted answer is either verified-correct, repaired-correct, or a
  deterministic item — a known misconception can never be the stored "correct" answer.
- **Quiz answer key, time-gated** — quiz questions are public, but the answers live in a server-only subdoc
  (`meetings/{wid}/private/answerKey`, denied to all clients). `POST /api/cohort` with `action: getAnswerKey` releases
  them only once the confirmed meeting time has arrived, and only when the learner presses **Reveal answer key**.
- **Calendar invites** — once a time is locked, members can add the meeting to their calendar via a downloadable `.ics`
  (Apple/Google/Outlook) or a one-click Google Calendar link; both embed the full outline + quiz questions.
- **Peer progress on the course path** — each lesson card shows cohort-mates who started/completed it (randomized
  avatar colors), or "be the first one to complete this lesson!" until someone does. Presence, never rankings/scores.
- **Practice quiz** — a Dashboard CTA ("Practice quiz") links to `/quiz`. On open, varied multiple-choice questions (≤5) are generated on demand via `POST /api/cohort` (`action: generatePracticeQuiz`) using OpenAI `gpt-4o-mini`, grounded in the learner's completed lessons and gated by login. If the AI is unavailable or the request times out, the quiz falls back to a deterministic `conceptSummary`-based set so the quiz always loads. Submitting scores the attempt and nudges `masteryScore` in Firestore.

**Backend**: one **Vercel serverless function** in `api/`:
- `api/cohort.ts` — a single `POST /api/cohort` router with `action: assignCohort | generateOutline | getAnswerKey | generatePracticeQuiz`.
  Handles transactional cohort matching, AI meeting-outline generation (OpenAI), and time-gated answer-key release.
  All helpers are inlined in this one file — the Vercel bundler does not reliably resolve relative imports under this
  repo's ESM setup, so there is no `api/_lib/` tree; pure helpers are exported directly for unit tests.

Each function verifies identity (Firebase ID token or HMAC token) with the Admin SDK; the client calls them with
`fetch` (`src/lib/api.ts`). Firebase Auth + Firestore remain the data backend. The OpenAI call is **stubbed against
the emulator**, so tests and local runs never hit the real API.

## Tech stack

Vite + React 18 + TypeScript · Tailwind (mobile-first) · React Router · Firebase Auth (email/password + Google) ·
Cloud Firestore · **Vercel serverless functions (`api/`) + firebase-admin + OpenAI SDK** · Vercel Hosting ·
Vitest + React Testing Library · Playwright · Firebase Emulator Suite.

## Setup

```bash
npm install
cp .env.example .env.local        # fill in your Firebase web config + (for live /api) the server vars
npm run dev                       # http://localhost:5173 (the dev server also serves /api)
```

### Firebase project (one-time)

1. Create a project at <https://console.firebase.google.com> and register a **Web app**; copy its config into `.env.local`
   (the `VITE_FIREBASE_*` keys). These are safe to ship in client builds — data is protected by Firestore rules, not by
   hiding them.
2. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
3. Push the Firestore security rules (kept in `firestore.rules`): `firebase login` once, then `npm run deploy:rules`.
4. **Service account for `/api`:** Project settings → Service accounts → *Generate new private key*. Put
   `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` + `OPENAI_API_KEY` in Vercel's env (and in
   `.env.local` for local dev against a live backend). Under the emulators none of these are needed.

### Run against the local emulators (no live project needed)

```bash
# Start Auth + Firestore on a demo project (no real credentials, no OpenAI key
# needed — the outline is stubbed). The /api functions run inside the Vite dev
# server (dev:test) and talk to these emulators.
npm run emulators            # UI :4000 · auth :9099 · firestore :8080
npm run dev:test             # in another shell → http://localhost:5173 (uses .env.test)

# Optional: seed a ready-made demo cohort (log in as demo@longrun.app / demo1234)
npm run seed:demo            # after the emulators are up; re-run any time to reset
```

## Testing

```bash
npm test                     # Vitest — engine, feedback, …, cohort + serverless logic (OpenAI mocked)
npm run test:integration     # Firestore rules (emulator) — Phase 1 + cohort privacy boundary
npm run test:e2e             # Playwright — MVP + Group scenarios (auto-starts emulators; /api runs in the dev server)
```

- **Unit/component:** answer-checking, feedback selection, mastery + unlock rule, streak transitions, step-renderer
  dispatch, widget logic, a content guard across the lessons, and (Phase 2) `levelBand`, overlap math incl. a
  **two-timezone** test, peer-progress state machine, outline parse/fallback, cohort-name generator, `allApproved`, and
  the serverless logic in `api/cohort.ts` (cohort matching, prompt construction, outline cache / quiz split / fallback
  paths, and the answer-key verification layer).
- **Integration (emulator):** Phase 1 cross-user rules + the Phase 2 cohort privacy boundary (non-members blocked, no
  cross-member writes, no client `memberUids` write, projection has no forbidden fields, quiz answer key is server-only).
- **E2E (Playwright):** Phase 1 flows **plus** Phase 2 — join via the CTA, propose → approve → lock + link, outline +
  quiz generated and cached for the cohort, answer key locked until meeting time, and peer presence on the course path;
  mobile included.

## Deploy

The app + the `api/` serverless functions deploy to **Vercel**; **Firebase** is used only for Auth + Firestore.

```bash
# Vercel: connect the repo (or `vercel --prod`). Build command `npm run build`,
# output dir `dist`. The api-dev-server Vite plugin is dev-only; on Vercel the
# /api functions are served natively. The SPA fallback lives in vercel.json.
npm run deploy:rules         # push the Firestore security rules (firebase deploy --only firestore:rules)
```

Set these env vars in the Vercel project (Production + Preview): `OPENAI_API_KEY`, `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (service account), plus the `VITE_FIREBASE_*` client config.

## Performance targets

Feedback < 100ms (purely local checks) · interactive visuals at 60fps · first interaction < 2s · touch-friendly on
mobile · scales to many concurrent learners (content is static/client-side; Firestore scales).
