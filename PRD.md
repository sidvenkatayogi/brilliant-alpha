# PRD — "Long Run": A Learn-by-Doing Probability & Statistics App

**Phase 1 (MVP) only. No AI features of any kind in this scope.**

---

## 0. One-liner

A Brilliant-style web app that teaches **probability and statistics through hands-on interaction** — you predict, manipulate a live visual, get it wrong, and figure it out — built deep around five lessons that climb from "what does chance even mean" to "why the house always wins."

**Subject (stated up front, per the brief): Probability & Statistics.**

The whole app is built for this one subject. Every interaction, the data model, and the mastery logic are designed around the way probability is best taught: by letting intuition fail against a running experiment.

---

## 1. Product principle (the north star)

Probability is the rare subject where the *aha is the interaction*. Its hardest ideas are hard precisely because intuition lies — Bayes, base rates, the gambler's fallacy. So every lesson must contain a moment where the learner **predicts → acts → is surprised**. If a lesson has no moment where a confident guess breaks against the visual, it isn't done.

Each lesson also opens with a **real-world hook**: a short, concrete story or fact about how the concept shows up in actual life (insurance, plane safety, spam filters, medical tests, casinos). This is not decoration — it's how the persona stays motivated and how an abstract idea earns the learner's attention.

---

## 2. Target persona

**Maya, 29 — product manager, curious self-learner / career-switcher.**

She took a stats class years ago and forgot most of it. She's smart, intrinsically motivated, and increasingly aware that she gets fooled by numbers — risk, odds, "99% accurate" claims, gambling math. She's eyeing a move toward more data-literate work and wants to *think clearly about uncertainty*, not pass an exam.

How she behaves, and how it shapes the product:

| Maya's trait | Design consequence |
|---|---|
| Learns in 10-minute sessions, often on her phone on the couch | Mobile-first, lessons are 4–6 minutes, resume-mid-lesson is essential |
| Bounces off symbol-heavy textbooks | Minimal notation; lead with visuals and plain language, introduce a formula only after the intuition lands |
| Loves counterintuitive "wait, *what?*" moments | Every lesson built around a predict-then-surprise beat |
| Motivated by relevance, not grades | Real-world hook opens every lesson |
| Comes back if there's momentum | Streaks, milestones, a clear "continue where you left off" |

We are **not** building for the exam-cramming college student or the quant-interview prepper. When a design call is ambiguous, resolve it for Maya: shorter, more visual, more real-world, less notation.

---

## 3. Goals & non-goals

### In scope (Phase 1 MVP) — what we prioritize
- One coherent **course** of **5 interactive lessons** that build on each other.
- Each lesson driven by a **structured content model** (typed steps), not hardcoded HTML.
- At least one **rich interaction beyond multiple choice** per lesson (slider, draggable grid, live icon array, betting sim).
- A **manipulable visual** per lesson that responds in real time.
- **Instant, authored feedback** on every answer — right or wrong — including a hint/explanation for wrong answers. All feedback hand-written, none generated.
- **Auth** (accounts + names).
- **Persistent progress**: leave mid-lesson, return on any device, pick up exactly where you left off; streaks and history survive.
- A **course path with mastery tracking** that unlocks/recommends the next step.
- **Streaks and milestones** (the habit loop).
- **Mobile + desktop**, touch-friendly.
- **Deployed, public.**
- A **testing suite** covering the engine, feedback logic, and the five MVP test scenarios.

### Explicitly out of scope (do NOT build this week)
These are named here on purpose so they don't creep in:
- **Any AI** — no model calls, no generated problems, no chatbot tutor, no AI hints. (Phase 2.)
- Spaced repetition, interleaving, formal retrieval scheduling. (Phase 3.)
- Social features, leaderboards, sharing, comments.
- A content-authoring UI / lesson editor.
- Multiple courses or subjects.
- Payments, subscriptions, notifications/email.
- Lesson content stored in the database (see §7 — content ships as versioned JSON in the repo for the MVP).

---

## 4. User stories

Priority order. P0 = MVP gate, must ship. P1 = strongly wanted. P2 = nice if time.

**Auth & identity**
- P0 — As a learner, I can sign up and log in with email/password or Google, set a display name, and stay logged in across sessions.

**Core learning loop**
- P0 — As a learner, I can open a lesson and move through a sequence of steps (a real-world hook, a concept, a prediction, an interactive visual, checkpoints).
- P0 — As a learner, I can directly manipulate a visual (drag a slider, tap grid cells, move sliders on an icon array) and watch it respond in real time.
- P0 — As a learner, when I answer a checkpoint I get instant feedback (<100ms) that's specific to what I chose, with an explanation or hint when I'm wrong.
- P0 — As a learner, I can make a prediction *before* the reveal so the lesson can surprise me.

**Progress & persistence**
- P0 — As a learner, if I leave mid-lesson, I return to the exact step I was on.
- P0 — As a learner, my completed lessons, streak, and history persist across sessions and devices.

**Path & mastery**
- P0 — As a learner, I see a course path showing which lessons are locked, available, and completed.
- P0 — As a learner, when I finish a lesson I see a sensible recommended next step.
- P1 — As a learner, if I repeatedly miss a concept, the app surfaces a review/easier step before pushing me forward.

**Habit loop**
- P0 — As a learner, I have a streak that grows when I show up on a new day and resets if I skip.
- P1 — As a learner, I hit milestones (first lesson, course complete, N-day streak) that feel rewarding.

**Platform**
- P0 — As a learner, the whole thing works well on a phone with touch input and on desktop.

---

## 5. The course: 5 lessons

The arc climbs from "what is chance" to a genuine payoff. Each lesson: a **real-world hook**, a **core concept**, **one rich interaction**, a **predict-then-surprise beat**, and **authored feedback**. Keep each to ~4–6 minutes.

### Lesson 1 — Chance & the Long Run
- **Real-world hook:** An insurance company has no idea whether *you* will crash your car this year. But across two million drivers, the crash rate barely moves from year to year. That eerie stability is the *only* reason they can price a policy. Probability is the math of "unpredictable one at a time, predictable in bulk."
- **Concept:** Probability = long-run relative frequency. Randomness is lumpy up close, smooth at scale (law of large numbers — felt, not stated).
- **Interaction:** A coin/die **sampler**. A slider runs trials from 10 → 10,000; live bars show the empirical distribution converging toward the true probability line as trials grow.
- **Surprise beat:** Predict "roll a die 6 times — how many sixes?" Most say exactly 1. The sampler shows how wildly small samples vary.
- **Sample feedback (correct):** "Right — randomness looks lumpy up close and smooth far away. Six rolls is too few to trust; six thousand isn't."
- **Sample feedback (wrong):** "Not quite. Watch the early bars versus the late ones — the *spread* shrinks as trials grow. That's the whole idea."

### Lesson 2 — Combining Events (AND / OR / Independence)
- **Real-world hook:** A passenger jet carries multiple independent hydraulic systems. If one fails on 1 in 1,000 flights, the chance *all three* fail at once is about 1 in a billion — because independent chances multiply. That's why redundancy works, and why "and" and "or" behave so differently.
- **Concept:** Addition rule (or), multiplication rule for independent events (and), mutually exclusive vs overlapping events.
- **Interaction:** A **6×6 grid** of all 36 two-dice outcomes. Define event A and event B (e.g. "sum = 7", "first die even"); the grid lights cells and shows P(A), P(B), P(A or B), P(A and B) updating live.
- **Surprise beat:** Predict P(A or B), then see why it isn't just P(A) + P(B) when events overlap.
- **Sample feedback (wrong):** "P(A or B) isn't always P(A) + P(B) — when they overlap you'd double-count the shared cells. Count the cells lit for *either* event in the grid."

### Lesson 3 — Conditioning (P(A | B))
- **Real-world hook:** Every spam filter, every Netflix "because you watched…", every "customers who bought this also bought" runs on conditioning. "What's the chance of rain?" is a different question from "what's the chance of rain *given* the sky is grey?" Conditioning is the math of updating on what you already know.
- **Concept:** P(A | B) means restricting the sample space to B, then recounting. Conditioning shrinks the world.
- **Interaction:** A **condition filter** over the sample space (the 36-grid or a population of icons). Toggle a condition ("given the first die is even") and watch the space collapse to the relevant slice while the probability recomputes live.
- **Surprise beat:** Predict P(sum = 7) vs P(sum = 7 | first die = 3) and see the denominator change everything.
- **Sample feedback (wrong):** "When you condition on B, B becomes your new whole world. Don't ask 'how likely is A overall' — ask 'among the B cases, how often is A?'"

### Lesson 4 — Bayes & Base Rates ⭐ (the centerpiece)
- **Real-world hook:** You take a test for a rare disease. It's "99% accurate." It comes back positive. Most people — including many *doctors* — think you almost certainly have it. They're wrong, often badly. The same trap convicts innocent people in court (the prosecutor's fallacy) and flags innocent travelers at airports. This lesson rewires how you read a "positive result."
- **Concept:** Bayes through natural frequencies / base rates. A rare condition + a small false-positive rate over a huge healthy population means most positives are false.
- **Interaction:** An **icon array of 1,000 people** with three sliders — prevalence, sensitivity (true-positive rate), false-positive rate. Icons recolor live into true positives vs false positives; the app shows "of everyone who tests positive, this many actually have it" updating in real time.
- **Surprise beat:** Predict the chance you're sick given a positive "99% accurate" test for a rare disease. Let them guess high (~99%), then reveal it can be under 50%.
- **Sample feedback (correct/reveal):** "Surprised? With a rare disease, the handful of true positives gets swamped by false positives pulled from the much larger healthy group. The test is accurate; your conclusion still flips."
- This is the screenshot lesson. Make the reveal land hard.

### Lesson 5 — Expected Value & Why the House Wins
- **Real-world hook:** A roulette bet pays 35-to-1 and feels like a jackpot waiting to happen. Over time it bleeds you at a steady, mathematically guaranteed rate. Casinos, lotteries, and insurers all run on the same quiet number: expected value. Learn to compute it and you can see the leak in any bet, contract, or gamble.
- **Concept:** EV = Σ(outcome × probability). Variance is the illusion of hope — a negative-EV game can feel winnable and still drain you.
- **Interaction:** A **betting game**: set a wager, "play" rounds, watch your bankroll trajectory accumulate over many plays while the EV-per-play is shown alongside. (Alternative: drag probability bars to build a distribution and watch EV update.)
- **Surprise beat:** Predict "up or down after 100 plays?" Variance may have them up early; the trend reveals the leak.
- **Sample feedback (wrong):** "You might be up right now — variance does that. But the EV is negative, so the more you play, the more certainly you trend down. The house doesn't need to win every round; it needs the average."

*(Future lessons, post-MVP, designed-for but not built: Galton board / Central Limit Theorem; Sampling variability. The content model and path must accommodate adding these as JSON with no engine changes.)*

---

## 6. Content model (the architectural core)

A lesson is **not** a blob of HTML. It is structured data: metadata + an ordered list of **typed steps**. The frontend has a **step renderer** and a **widget registry** that map `type` → React component. This is what lets you add lessons fast as JSON, and what makes Phase 2 AI generation possible later.

### Lesson shape
```jsonc
{
  "id": "long-run",
  "order": 1,
  "title": "Chance & the Long Run",
  "subtitle": "What a probability actually means",
  "realWorldHook": "An insurance company has no idea whether you'll crash...",
  "conceptSummary": "Probability is long-run relative frequency.",
  "estimatedMinutes": 5,
  "steps": [ /* ordered typed steps, see below */ ]
}
```

### Step types

**`concept`** — explanation + optional visual. Advances on "Continue."
```jsonc
{ "id": "s1", "type": "concept", "title": "...", "body": "markdown text",
  "visual": { "widget": "coinSampler", "props": { "interactive": false } } }
```

**`predict`** — capture a guess *before* the reveal. No wrong answer; stored to power the surprise.
```jsonc
{ "id": "s2", "type": "predict", "prompt": "Roll a die 6 times — how many sixes?",
  "format": "multiple_choice",
  "options": [ {"id":"a","label":"Exactly 1"}, {"id":"b","label":"Anywhere from 0 to 4"} ],
  "revealMessage": "Hold that thought — let's actually run it." }
```

**`interactive`** — the manipulable visual. May be pure exploration, or gated by a completion condition.
```jsonc
{ "id": "s3", "type": "interactive", "prompt": "Drag the slider up to 10,000 trials.",
  "widget": { "type": "coinSampler", "props": { "sides": 6, "maxTrials": 10000 } },
  "completion": { "type": "reaches", "param": "trials", "value": 1000 } }
```

**`question`** — a checkpoint with answer-checking and authored feedback.
```jsonc
{ "id": "s4", "type": "question",
  "prompt": "At 10 rolls you saw 33% sixes; at 6,000 rolls, 16.8%. Why?",
  "format": "multiple_choice",            // or "numeric"
  "options": [ {"id":"a","label":"The die changed"},
               {"id":"b","label":"Small samples are noisy; the average settles as trials grow"} ],
  "answer": { "correctOptionId": "b" },     // or { "value": 0.167, "tolerance": 0.01 }
  "feedback": {
    "correct": "Right — randomness is lumpy up close and smooth far away.",
    "incorrect": "Look at the spread of the early bars vs the late ones — it shrinks as trials grow.",
    "byOption": { "a": "The die's fair throughout — watch how the bars settle, not jump." }
  },
  "hint": "Compare how much the bars wobble at 10 trials vs 6,000." }
```

### Widget registry (the rich interactions)
A single map `widgetType → React component`, so the renderer never special-cases a lesson:

| `widget.type` | Used in | What it does |
|---|---|---|
| `coinSampler` | L1 | Slider drives 10–10,000 trials; live bars converge to true probability (Canvas for 60fps) |
| `diceGrid` | L2, L3 | 6×6 outcome grid; define events, light cells, show combined probabilities (SVG) |
| `conditionFilter` | L3 | Toggle a condition; sample space collapses, probability recomputes (SVG) |
| `bayesIconArray` | L4 | 1,000-person icon array + 3 sliders; recolors true/false positives live (SVG/Canvas) |
| `evBettingGame` | L5 | Set wager, play rounds, bankroll trajectory + live EV (Canvas) |

Adding a lesson later = write a JSON file + (only if it needs a new interaction) register one widget. No engine rewrite.

---

## 7. Tech stack

Fixed by you: **React + Firebase.** Specifics:

- **Build/Framework:** Vite + React 18 + **TypeScript**.
- **Styling:** Tailwind CSS, mobile-first.
- **Routing:** React Router.
- **Auth:** Firebase Auth — email/password + Google sign-in.
- **Database:** Cloud Firestore (user data only; see content note below).
- **Hosting:** Firebase Hosting (one ecosystem). *(Vercel is an acceptable alternative if preferred.)*
- **State:** React Context for auth + progress. No Redux — keep it light.
- **Visuals:** **SVG** for discrete/structured visuals (grids, icon arrays, bars); **HTML5 Canvas** where 60fps animation matters (`coinSampler`, `evBettingGame`). Optional: a lightweight animation lib (e.g. Framer Motion) for step transitions only.
- **Testing:** **Vitest + React Testing Library** (engine, feedback logic, components); **Playwright** (the 5 e2e scenarios); **Firebase Emulator Suite** (Auth + Firestore) so tests never touch production.

**Content storage decision (deliberate):** For the MVP, **lesson content ships as versioned JSON files in the repo** (`/src/content/lessons/*.json`), loaded at runtime. Only **user progress** lives in Firestore. Rationale: faster to build, no seeding pipeline this week, and the content is still fully structured — so Phase 2 can move generation/storage into the DB later without changing the renderer.

---

## 8. Database schema (Firestore)

Content is in the repo (§7). Firestore holds only per-user state.

**`users/{uid}`**
```jsonc
{
  "displayName": "Maya",
  "email": "maya@example.com",
  "createdAt": Timestamp,
  "currentStreak": 3,
  "longestStreak": 7,
  "lastActiveDate": "2026-06-22",        // YYYY-MM-DD in the user's local time
  "totalLessonsCompleted": 2,
  "milestones": ["first_lesson", "streak_3"]
}
```

**`users/{uid}/progress/{lessonId}`** — one doc per lesson the learner has touched
```jsonc
{
  "lessonId": "long-run",
  "status": "in_progress",               // "not_started" | "in_progress" | "completed"
  "currentStepIndex": 3,                  // powers resume-mid-lesson
  "stepResults": {                        // keyed by step id
    "s4": { "correct": true,  "attempts": 1, "answeredAt": Timestamp },
    "s6": { "correct": false, "attempts": 2, "answeredAt": Timestamp }
  },
  "masteryScore": 0.83,                    // fraction of question-steps correct on first try
  "startedAt": Timestamp,
  "completedAt": null,
  "lastAccessedAt": Timestamp
}
```

**Derived logic (computed in app, not stored redundantly):**
- **Streak:** on any activity, compare today's local date to `lastActiveDate`. Same day → no change. Exactly +1 day → `currentStreak++` (update `longestStreak`). Gap > 1 day → reset `currentStreak` to 1. Always update `lastActiveDate`.
- **Mastery:** `masteryScore` = (first-try-correct question steps) / (total question steps). Lesson counts as **mastered** at ≥ 0.8.
- **Unlock rule:** Lesson N unlocks when Lesson N-1 is `completed`. Lesson 1 always open.
- **Review nudge (P1):** if a lesson is completed with `masteryScore < 0.6`, the path surfaces a "revisit" suggestion before recommending the next lesson.

**Security rules:** a user can read/write only their own `users/{uid}` document and subcollection. Content needs no rules (it's static in the bundle).

---

## 9. Screens & navigation

- `/login`, `/signup` — Firebase Auth, display-name capture.
- `/` — **Course path / dashboard.** Vertical path of the 5 lessons with locked / available / completed states; streak banner; prominent "Continue" CTA jumping to the in-progress lesson and step.
- `/lesson/:lessonId` — **Lesson player.** Renders typed steps via the step renderer; progress indicator; instant feedback panel; "leave" preserves `currentStepIndex`.
- `/lesson/:lessonId/complete` — **Completion screen.** Mastery score, streak update, milestone celebration if earned, and the recommended next step.
- `/profile` (P1) — streak, lessons completed, history.

Mobile-first throughout: every interaction works with touch; sliders, grid taps, and drags are finger-friendly; layouts reflow to a single column on narrow screens.

---

## 10. Testing requirements

The suite must cover the brief's five test scenarios plus the engine's correctness.

**Unit / component (Vitest + RTL)**
- Answer-checking: multiple-choice match and numeric-with-tolerance, including edge cases.
- Feedback selection: correct vs incorrect vs per-option `byOption` resolution.
- Mastery calculation and the unlock rule.
- Streak transitions: same-day, +1 day, gap reset, longest-streak update (use fixed/mocked dates).
- Step renderer dispatches each step type to the right component; widget registry resolves each `widget.type`.

**Integration (Firebase Emulator Suite)**
- Sign up → write user doc; log in → read it back.
- Progress write/read round-trips; security rules block cross-user access.

**End-to-end (Playwright) — the five MVP scenarios:**
1. A learner completes one lesson end to end, gets some questions wrong, and uses the feedback to recover.
2. A learner manipulates an interactive widget and the visual responds in real time.
3. A learner leaves mid-lesson and returns to confirm the step position and streak persist.
4. A learner finishes a lesson and the path recommends a sensible next step.
5. The full flow on a phone-sized viewport with touch.

---

## 11. Performance targets (from the brief — non-negotiable)

- Feedback on an answer renders in **under 100ms** (purely local checks — no network in the answer path).
- Interactive visuals hold **60 FPS** while being manipulated.
- Lessons reach first interaction in **under 2 seconds**.
- Works on **mobile** screen sizes with **touch** input.
- Supports **multiple concurrent learners** with no slowdown (Firestore scales; keep content static and client-side).

Implementation notes: answer-checking and feedback are fully client-side against the content model. Firestore writes (progress, streak) happen asynchronously and never block feedback or interaction. Canvas widgets use `requestAnimationFrame` and cap redraw work to stay at 60fps.

---

## 12. Definition of done (MVP acceptance gate)

Ship only when **all** of these are true:
- [ ] Subject stated up front in the README (Probability & Statistics) with the persona.
- [ ] 5 interactive lessons, each driven by the content model, each with a real-world hook, a manipulable visual, a predict-then-surprise beat, and authored feedback on right *and* wrong answers.
- [ ] At least one rich interaction beyond multiple choice per lesson, working on touch.
- [ ] Auth with display names; sessions persist.
- [ ] Progress, streaks, and history persist across sessions and devices; resume lands on the exact step.
- [ ] Course path with locked/available/completed states, mastery tracking, and a sensible next-step recommendation.
- [ ] Streaks and at least the first milestones implemented.
- [ ] Works well on mobile and desktop.
- [ ] Performance targets met on the deployed app.
- [ ] Test suite (unit + integration + the 5 e2e scenarios) passing.
- [ ] **No AI anywhere.** The app teaches fully with zero model calls.
- [ ] Deployed, public, with a setup guide and architecture overview in the README.

---

## 13. Suggested build order (vertical, in the brief's order)

1. **Lesson 1, end to end, by hand** — content model + step renderer + the `coinSampler` widget + authored feedback. Get this one lesson genuinely great before anything else.
2. Instant feedback (including wrong-answer hints) generalized across step types.
3. Auth + progress persistence + resume-mid-lesson.
4. Course path with mastery tracking + next-step recommendation.
5. Streaks and milestones.
6. Lessons 2–5 (mostly content JSON + their four widgets).
7. Full test suite, mobile polish, deploy.

> The MVP is judged on whether **one lesson actually teaches probability without any AI**. Five lessons that climb and click beat any number of shallow ones. Build the app first; smart and sticky come later.