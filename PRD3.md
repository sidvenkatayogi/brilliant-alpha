# PRD2 — "Long Run" v2: Scenario-Game Lesson Overhaul

> **Note (2026-06-28):** The daily email-quiz feature (originally documented in the README) has been removed in favour of an in-app Practice quiz (`/quiz`). PRD3 covers the scenario-game lesson redesign only and is unaffected by that change.

**This is a revision PRD, handed to Claude Code on top of the existing v1 codebase.**
It overhauls **lesson design, widgets, and visual/motion direction only**. The engine, data model, auth, persistence, streaks, mastery, path, and "no AI anywhere" constraint are **unchanged** unless this document explicitly says otherwise.

Read this whole doc before touching code. The most important section is §4 (the five scenarios) — that is the actual work.

---

## 1. Why we're doing this (the diagnosis)

The v1 app teaches probability through abstract widgets: a coin/die sampler with converging bars, a unit-square area model, a recolored 1,000-icon grid, a bankroll line. Each lesson *opens* with a strong real-world hook (insurance, plane redundancy, spam filters, medical tests, casinos) — and then **abandons it** for a generic chart.

That split is the whole problem:

- The **hook motivates** but the **graph teaches**, and they're two different objects. The learner's attention is captured by a story and then handed an abstraction that doesn't look like the story at all.
- The interactions read as "math toys." They're correct and they animate, but they feel like instrument panels, not situations.
- Nothing is at stake. Dragging a slider to watch bars converge has no consequence. Probability *bites* when it's your money, your plane, your inbox, your patient.

**The redesign rule: the scenario IS the mechanic.** The thing the learner manipulates must be the real-world situation itself, not a chart that represents it. You don't read about insurance and then drag an abstract slider — you *are* the insurer, and the "slider" is how many drivers you've signed up. The aha is no longer "watch the bars settle." It's "watch your business survive (or not)."

If a redesigned lesson still has a step where the learner manipulates an abstraction that *stands for* the scenario instead of *being* the scenario, that lesson isn't done.

---

## 2. What does NOT change (do not rebuild these)

Keep the v1 engine and infrastructure as-is. Claude Code should **not** re-architect or rewrite:

- **Typed-step content model** (`concept | predict | interactive | question`) and the step renderer.
- **Widget registry pattern** (`widgetType → React component`). We are swapping *which* widgets exist, not how they're registered.
- **Answer-checking & feedback engine** (`checkAnswer`, `selectFeedback`, `byOption`, `revealByOption`). All feedback stays hand-authored. No generation.
- **Mastery** = first-try-correct question steps / total question steps; mastered ≥ 0.8; review nudge < 0.6.
- **Unlock rule**, **streaks**, **milestones** (`first_lesson`, `streak_3`, `course_complete`), **redo/restart**, **reduced-motion support**.
- **Firestore schema** (`users/{uid}` + `users/{uid}/progress/{lessonId}`), security rules, emulator-based tests.
- **Auth** (email/password + Google), **resume-mid-lesson**, cross-device persistence.
- **Tech stack**: Vite + React 18 + TS, Tailwind, React Router, Firebase, Vitest/RTL + Playwright.
- **Performance targets**: feedback < 100ms (local, no network in answer path), 60fps on interaction, first interaction < 2s, mobile + touch.
- **No AI. Anywhere.** Same hard gate as v1.
- The five required e2e scenarios still exist (they're about engine behavior — complete a lesson, manipulate a widget, leave/resume, next-step recommendation, mobile/touch). They keep passing; only the widget selectors they drive will be updated to the new widgets.

In short: this is a **content + widget + art** overhaul on a stable spine.

---

## 3. One new architectural concept: shared scenario state

This is the single engine-adjacent addition, and it's what makes "the interaction is part of the scenario" real instead of cosmetic.

**Problem in v1:** each step is independent. A `predict` step, the `interactive` widget, and the `question` checkpoint don't share any world. So even if they're all "about insurance," they're three disconnected screens.

**Addition:** a **per-lesson scenario state** that threads through every step of a lesson, so the same living world persists from the hook to the final checkpoint.

### 3.1 Lesson-level `scenario` block (new, optional)

Add an optional `scenario` object to the lesson JSON:

```jsonc
{
  "id": "long-run",
  "order": 1,
  "title": "Chance & the Long Run",
  "scenario": {
    "role": "You run a small-town car-insurance company.",
    "initialState": {
      "premium": 800,
      "customers": 10,
      "trueCrashRate": 0.05,
      "payout": 12000,
      "bankroll": 5000,
      "yearsRun": 0,
      "history": []
    }
  },
  "steps": [ /* typed steps, as before */ ]
}
```

### 3.2 `ScenarioProvider` (new, per lesson)

- A lightweight React context that holds the mutable scenario state for the active lesson, seeded from `scenario.initialState`.
- Lives **inside** the LessonPlayer, scoped to the current lesson; it resets when the lesson resets/restarts.
- It is **ephemeral exploration state** — it does NOT go in Firestore. Only the existing progress fields (`currentStepIndex`, `stepResults`, `masteryScore`, …) persist. If a learner leaves and resumes, the scenario re-seeds from `initialState` at the resumed step; we do not try to persist a half-simulated world. (This keeps the Firestore schema untouched.)

### 3.3 How steps use it

- **Widgets** receive `scenario` state + a typed setter, and read/write the shared world.
- **`concept` and `predict` steps** can render a small read-only view of the *same* world (e.g. the town with its current 10 houses), so the story and the toy are visibly one object.
- **`question` steps** can interpolate live scenario values into prompts and feedback (e.g. "You ran 20 years and went broke in year 7 — why?").

### 3.4 Backward compatibility

Lessons **without** a `scenario` block behave exactly like v1 (independent steps). This must be a clean, additive change — no existing engine test should break.

---

## 4. The five scenarios (the heart of this PRD)

Each lesson is now a **playable situation**. The probability concept is unchanged; the delivery is a small game. Every lesson still has: a real-world frame, **one rich interaction that IS the scenario**, a **predict → act → surprise** beat, and **authored feedback on right and wrong**. Target 4–6 minutes, mobile-first, touch-first.

For each lesson below: the **premise**, the **living world** (what's drawn), the **mechanic** (what the learner does and how it maps to the math), the **step flow**, the **surprise beat**, and **sample authored feedback**.

---

### Lesson 1 — The Insurance Desk
**Concept:** probability = long-run relative frequency; small samples are noisy, large ones are stable (law of large numbers, *felt*).
**Replaces widget:** `coinSampler` → **`insuranceDesk`**.

**Premise.** You run a small-town car-insurance company. You charge each driver a premium. Each year, each driver either crashes (true rate ~5%) and you pay out, or doesn't. Your job is to *not go broke*.

**Living world.** A small illustrated town: a row/grid of houses each with a car parked outside, a bankroll meter (a stack of cash or a vault gauge) on the side, and a "year ledger." Signing up customers adds houses to the town. Running a year animates: a few cars flash a little crash burst (red), payouts fly from the vault, premiums fly in, the bankroll meter swings.

**Mechanic.**
- **Customers** is the core control (this is the old "trials" slider, reskinned as *the scale of your business*): start at 10, can grow to thousands.
- **Run Year** simulates one year for the current customer base; cars crash at the true rate, you collect premiums and pay claims, bankroll updates.
- **Run 20 Years** / fast-forward shows the *distribution of yearly outcomes* — with 10 customers it's a roller-coaster (broke some years, rich others); with 5,000 customers it's a near-flat, slightly-profitable line.
- The "true probability line" from v1 becomes **"the break-even premium"**: the learner can see their per-customer margin converge to a stable number only at scale.

**Step flow (threaded through one world):**
1. `concept` — the hook *as the opening screen*: "Here's your town. 10 drivers. You can't predict who crashes — but watch what 'unpredictable' does to your bank account." (read-only view of the live town.)
2. `predict` — "You charge \$800. Expected claims are ~\$600 per driver. With 10 customers, will you turn a profit *every* year?" Options lean toward "yes, the margin's positive." `revealByOption` for the savvy learner who picks "no."
3. `interactive` (`insuranceDesk`) — run years at 10 customers. Completion: run at least ~10 years (so they feel the swings), then grow customers and run again. `completion: { type: "reaches", param: "customers", value: 2000 }` after they've experienced small-N.
4. `question` — "At 10 customers you went broke in some years even though your margin was positive. At 5,000 you barely budged. Why?" Correct: small samples are noisy; the average only shows up at scale.

**Surprise beat.** A positive average margin feels like guaranteed profit. At N=10, variance wipes you out in bad years anyway. The reveal: *being right on average doesn't protect you when N is small — and that's exactly why insurers need millions of customers.*

**Sample feedback.**
- correct: "Right. Your premium was always profitable on average — but with 10 drivers, one bad year of crashes swamps the average. Scale is what turns 'risky bet' into 'stable business.'"
- incorrect (picked "yes, profit every year"): "Check your ledger — you booked a loss in some years even though the math 'should' win. Few customers = wild swings. The average only rescues you at scale."

---

### Lesson 2 — The Redundancy Bay
**Concept:** AND (independent events multiply), OR (addition / at-least-one), independence vs overlap.
**Replaces widget:** `probabilityArea` → **`redundancyBay`**.

**Premise.** You're an aircraft safety engineer. The plane stays in the air as long as *at least one* hydraulic system works. Each system fails independently on some fraction of flights. You design the plane (how many backup systems) and then fly a whole fleet.

**Living world.** A side-view plane with N glowing system indicators (green = working, red = failed). Below, a runway/sky where a **fleet of flights** animates across the screen, one little plane per flight. Two live counters: **"crashes"** (all systems failed = AND) and **"needed maintenance"** (at least one system failed = OR).

**Mechanic.**
- **Add/remove systems** (1–4): a tactile "bolt on another backup" action.
- **Per-system failure rate** slider (e.g. 1-in-10 down to 1-in-1000).
- **Fly the fleet** (e.g. 1,000 flights): planes stream across; the rare all-systems-fail flight gets a dramatic moment (smoke, falls); the common one-system-fail flight gets a yellow "diverted to maintenance" tag.
- AND is shown as the catastrophe count shrinking *multiplicatively* as you add systems; OR is shown as the maintenance count *growing* as you add systems (more parts = more chances something flags). Seeing both move in opposite directions as you add redundancy is the core insight.

**Step flow:**
1. `concept` — "One hydraulic system fails on 1 in 10 flights. Scary. So we add backups. Here's your plane — start with one system."
2. `predict` — "Each system fails 1 in 10 flights. With **three** independent systems, how often do **all three** fail at once?" Let them anchor on something like "1 in 30" (additive intuition). `revealByOption`.
3. `interactive` (`redundancyBay`) — build up to 3 systems, fly 1,000+ flights, watch catastrophes collapse toward ~1-in-1,000 while maintenance flags climb. Completion: fly the fleet with ≥3 systems.
4. `question` (AND) — "Why did adding a third system make total failure *so* much rarer, not just a bit rarer?" Correct: independent failure chances multiply, so each backup divides the risk.
5. `question` (OR) — "Adding systems made *crashes* rarer but *maintenance* more common. Why?" Correct: 'at least one fails' adds up across more parts; AND and OR move in opposite directions.

**Surprise beat.** People expect three systems to be ~3× safer (additive). It's ~100× safer (multiplicative: 0.1³ = 0.001). Redundancy is exponentially powerful — *that's* why planes are safe.

**Sample feedback.**
- incorrect (additive guess): "Independent failures **multiply**, they don't add. 1/10 × 1/10 × 1/10 = 1/1,000 — not 1/30. That gap is the whole reason redundancy works."
- correct (OR): "Exactly — 'all fail' (AND) shrinks fast, but 'at least one fails' (OR) grows with more parts. More backups = far safer flights but more frequent maintenance flags."

---

### Lesson 3 — The Spam Inbox
**Concept:** conditioning, P(A | B) = restrict the world to B, then recount.
**Replaces widget:** `conditionZoom` → **`spamInbox`**.

**Premise.** You're tuning an email spam filter. You have an inbox of 100 emails — some spam, some real. You toggle *clues*, and the filter narrows to just the emails with that clue. The question is always: *among the emails with this clue, what fraction is spam?*

**Living world.** An inbox: ~100 envelope icons in a list/grid. Spam ones carry a subtle marker (you can color-reveal them). Each email has hidden tags: `contains "FREE"`, `ALL CAPS subject`, `has a link`, `from a known contact`. A live readout: **"P(spam) in the current view."**

**Mechanic.**
- **Toggle a condition** (the clue chips). When toggled on, non-matching emails **physically slide out / fade away**, the matching ones **rise and repack** to fill the frame. The denominator visibly shrinks.
- The spam fraction recomputes over the *surviving* slice and animates from the old value to the new one.
- Stackable conditions ("FREE" **and** has a link) keep collapsing the world.
- This is the same "conditioning shrinks the world" idea as v1's `conditionZoom`, but the world is an inbox you actually recognize, not 36 abstract dice dots.

**Step flow:**
1. `concept` — "Here's 100 emails. About 10 are spam. A 'spam filter' is just this question, asked well: *given a clue, how likely is spam now?*"
2. `predict` — "Overall, ~10% of these are spam. Of the emails whose subject is **ALL CAPS and say 'FREE MONEY'**, what fraction do you think is spam?" Anchor low (near 10%). `revealByOption`.
3. `interactive` (`spamInbox`) — toggle conditions, watch the inbox collapse and the spam fraction leap. Completion: apply a condition that meaningfully changes P(spam) (e.g. ≥1 strong clue toggled).
4. `question` — "Why did the spam percentage jump from 10% to ~80% when you filtered to 'FREE MONEY, ALL CAPS'?" Correct: conditioning restricts the world to that slice and recounts — you're no longer asking about all email, only this kind.

**Surprise beat.** P(spam) overall is small. P(spam | screaming clickbait clue) is huge. Same emails, different question — the clue rewrites the odds. The reveal: *the filter isn't magic, it's just conditioning.*

**Sample feedback.**
- incorrect: "Don't ask 'how much email is spam overall' — ask 'among emails with *this clue*, how much is spam.' When you condition on the clue, that slice becomes your whole world. Recount inside it."
- correct: "Right — conditioning shrinks the world. Once you only look at 'FREE MONEY, ALL CAPS', the honest emails are mostly gone and spam dominates what's left."

---

### Lesson 4 — The Screening Clinic ⭐ (centerpiece)
**Concept:** Bayes / base rates via natural frequencies. A rare condition + a small false-positive rate over a large healthy population means most positives are false.
**Replaces widget:** `bayesIconArray` → **`screeningClinic`**. **Keep** `bayesFormula` as the companion reveal.

**Premise.** You run a screening clinic. 1,000 people come in for a test for a rare disease. The test is "99% accurate." People flow through a testing machine and sort into bins. Then a single worried patient — who just tested positive — asks you: *"Doc, am I going to die?"* You have to give the honest answer.

**Living world.** A clinic scene. A crowd of 1,000 tiny people (Canvas — this is the high-count one). They **walk through a testing machine** in a stream and drop into bins: **test-negative** and **test-positive**. The test-positive bin then visibly **splits into two colors** — *actually sick* (true positives) vs *healthy but flagged* (false positives). A big live readout: **"Of everyone who tested positive, [X] actually have the disease."** Then one highlighted patient steps forward asking the question.

**Mechanic (keep the 3 sliders, re-framed in clinic language):**
- **How rare is the disease?** (prevalence)
- **How good is the test at catching it?** (sensitivity / true-positive rate)
- **How often does it false-alarm?** (false-positive rate)
- As sliders move, the crowd re-flows through the machine and the bins recolor live; the "of all positives, this many are real" number updates in real time. The drama is watching the **false-positive bin dwarf the true-positive bin** when the disease is rare.

**Step flow (mirrors the shipped L4 structure):**
1. `concept` — set the clinic, the rare disease, the "99% accurate" test.
2. `predict` — "You tested positive on a 99%-accurate test for a disease 1 in 1,000 people have. What's the chance you actually have it?" Let them guess high (~99%). `revealByOption` for anyone who guesses low.
3. `interactive` (`screeningClinic`) — run the 1,000 through; watch the positive bin split. Completion: run the clinic at the default rare-disease settings and view the split.
4. `question` — "Of everyone who tested positive, only ~9% actually have the disease. How can a 99%-accurate test be right about your positive result less than 1 in 10 times?" Correct: with a rare disease the few true positives are swamped by false positives drawn from the huge healthy group.
5. `concept` — the "natural frequencies" recap: think in people, not percentages.
6. `question` (`bayesFormula` companion) — show Bayes with *this clinic's current numbers already plugged in* (true positives / all positives), color-matched to the bins (true = one color, false = the other), then the formal theorem. "Formula only after the intuition lands."
7. `concept` — the payoff: this same trap convicts the innocent (prosecutor's fallacy) and flags innocent travelers. You now read "positive result" correctly.

**Surprise beat.** Guess ~99%, reveal <10%. Make it *land*: when the positive bin splits, the false-positive color should visibly flood the true-positive color. This is the screenshot moment — give it a beat of animation and a held final state.

**Sample feedback.**
- reveal/correct: "Surprised? The test is accurate. Your *conclusion* still flips. With a rare disease, a handful of true positives gets buried under false positives pulled from the enormous healthy crowd. Count the people, not the percentages."
- incorrect (guessed high): "The '99% accurate' is the test's reliability — not the chance you're sick given a positive. Look at the bins: most of the positive pile is healthy people the test false-flagged."

---

### Lesson 5 — The Casino Floor
**Concept:** expected value = Σ(outcome × probability); variance is the illusion of hope; negative EV drains you over time.
**Replaces widget:** `evBettingGame` → **`casinoFloor`**.

**Premise.** You walk onto a casino floor with \$100. You pick a bet and play. Variance may pump you up early — then you fast-forward and watch the leak. Then you **flip sides and run the house**, and the exact same math that was bleeding you becomes a steady profit.

**Living world.** A casino: an animated roulette wheel (or slot pull / coin flip — keep it to one clean game, roulette is iconic), a stack of chips that *is* your bankroll, and a bankroll trajectory that the chips feed into. Spins animate; wins flash green and grow the stack, losses shrink it. A "be the house" toggle re-skins the same sim from the casino's side: now the house's vault fills as players churn.

**Mechanic.**
- **Set a wager**, **Spin** (single, animated) and **Fast-forward 1,000 spins** (the trajectory races ahead).
- The **EV-per-play** is shown alongside the live bankroll — a small negative number for the player.
- **"Be the house" flip:** same engine, opposite sign. The player's negative EV is the house's positive EV. Watching your own losses become the house's reliable income is the emotional payoff — and it **closes the course loop back to L1** (the insurer and the house run the *same* long-run math; one sells you safety, the other sells you hope).

**Step flow:**
1. `concept` — "\$100. A roulette bet pays 35-to-1 — feels like a jackpot waiting to happen. Let's actually play."
2. `predict` — "After 100 spins of a 35-to-1 bet, are you up or down?" Let variance make "up" tempting. `revealByOption`.
3. `interactive` (`casinoFloor`) — play single spins (ride the variance), then fast-forward 1,000 and watch the slide. Completion: fast-forward to a large number of plays. Then **flip to "be the house"** and run it again.
4. `question` — "You were *up* after 30 spins but *down* after 1,000. What changed?" Correct: nothing changed — variance let you win early, but negative EV makes the long-run trend inevitable.

**Surprise beat.** Variance has you winning early; the fast-forward reveals the guaranteed bleed. Then the house-side flip reframes the whole thing: the casino doesn't need to win every spin — it needs the average, and it has millions of spins. (Mirror of L1's "insurers need millions of customers.")

**Sample feedback.**
- incorrect (thought "up"): "You might be up right now — that's variance, not skill. But EV per spin is negative, so the more you play, the more certainly you trend down. The house doesn't win every round; it wins the average."
- correct: "Exactly. A negative-EV game can feel winnable for a while — that's the trap. Flip to the house's side and the same math that drained you becomes their steady income. Same long-run engine as the insurer in Lesson 1."

---

## 5. Art & motion direction (the "vector art, animations" ask)

The point of v2 is that lessons *look like situations*. This needs a deliberate, consistent visual language — not five unrelated mini-games.

### 5.1 Style
- **Flat illustrated vector** (SVG), clean and slightly rounded, warm but uncluttered. Think modern explainer-illustration restraint, not skeuomorphic clutter. Every scenario lives on a consistent **"stage" frame** so the app feels like one product.
- One shared **palette** with semantic roles, reused across all lessons so color *means* something everywhere:
  - **neutral/base** — the world, the population, the undecided.
  - **favorable / true** — one consistent color for the "good / true-positive / win / survives" outcome (e.g. a calm teal-green).
  - **unfavorable / false** — one consistent color for "loss / false-positive / crash / broke" (e.g. a warm amber-red).
  - **accent** — interactive affordances (sliders, toggles, the thing you can grab).
- Iconography per lesson: houses+cars (L1), planes+systems (L2), envelopes (L3), people (L4), chips+wheel (L5). Keep them simple and legible at phone size.

### 5.2 Motion principles
- **State changes are animated transitions, never instant recolors.** When the spam inbox filters, emails *slide and repack*; when the clinic splits the positive bin, colors *flood in*; when a car crashes, a small *burst* plays. v1 recolored grids instantly — v2 tweens.
- **Things physically move.** People walk through the machine, planes fly across, chips stack, payouts fly from the vault. The learner should feel a little world running.
- **The surprise beat gets a held animation.** On each lesson's reveal, give the key visual a beat (a short build, then a settled final state the learner can sit with). The L4 bin-split is the marquee one.
- **Micro-feedback** on correct/incorrect: a small satisfying confirmation (no confetti spam — keep it tasteful and fast, < 400ms).

### 5.3 Rendering tech (consistent with v1's actual implementation)
- **SVG + a light animation lib (Framer Motion is already acceptable per v1 §7)** for the discrete, recognizable scene elements and their transitions (houses, planes, envelopes, chips, the toggles, the bin splits at low counts).
- **HTML5 Canvas with `requestAnimationFrame` + `devicePixelRatio`** for the high-count animated sims where 60fps matters: the 1,000-person clinic flow (L4), the fleet of 1,000 flights (L2), the 1,000-spin fast-forward (L5), and the multi-year insurance runs (L1). This matches how v1 actually shipped (all heavy widgets on Canvas).
- **Honor `prefers-reduced-motion`** everywhere (v1 already does this for some widgets — extend it to all five). Reduced-motion = jump to final states, skip the particle flourishes, but still show the result.
- All interactions are **touch-first**: large hit targets, draggable controls that work with a finger, no hover-only affordances.

---

## 6. Updated widget registry

Same registry pattern. New roster (5 live widgets + the formula companion):

| v1 widget | v2 widget | Lesson | Renders on |
|---|---|---|---|
| `coinSampler` | **`insuranceDesk`** | L1 | Canvas (multi-year sim) + SVG town |
| `probabilityArea` | **`redundancyBay`** | L2 | SVG plane + Canvas fleet |
| `conditionZoom` | **`spamInbox`** | L3 | SVG inbox + Framer transitions |
| `bayesIconArray` | **`screeningClinic`** | L4 | Canvas crowd flow + SVG bins |
| `bayesFormula` | **`bayesFormula`** | L4 | DOM/markup (unchanged role) |
| `evBettingGame` | **`casinoFloor`** | L5 | SVG wheel/chips + Canvas fast-forward |

Each widget:
- reads/writes the **shared scenario state** (§3) via props (`scenario`, `setScenario`) rather than holding the whole world in private local state, so concept/predict/question steps can reflect the same world;
- exposes the **completion condition params** the JSON references (e.g. `customers`, `flightsFlown`, `playsRun`);
- holds 60fps on its animated path and degrades cleanly under reduced-motion.

Old widget files can be removed once their lessons are migrated, but keep the registry resolution and the `visual.props.interactive: false` read-only mode the concept steps use.

---

## 7. Content changes summary (what Claude Code edits)

- **`src/content/lessons/*.json`** — rewrite all five lessons to the scenario flows in §4: add the `scenario` block, re-author every step's copy around the situation, point `interactive`/`visual` steps at the new widget types, and rewrite all `feedback` (correct, incorrect, `byOption`) and `predict` `revealByOption` to fit the new scenarios. **All feedback stays hand-authored.**
- **`src/widgets/registry.tsx`** + new widget components — implement the six widgets in §6.
- **`ScenarioProvider`** — new context inside `LessonPlayer` (§3). Additive; non-scenario lessons unaffected.
- **Concept-step read-only views** — let `concept`/`predict` steps render a static frame of the scenario widget so the story and the toy are one object.
- **Playwright selectors** — update the existing five e2e specs to drive the new widget DOM/test-ids. The *scenarios under test* (complete a lesson, manipulate a widget and see it respond, leave/resume, next-step recommendation, mobile/touch) are unchanged.
- **Do not touch**: Firestore schema, security rules, auth, streak/mastery/unlock engine, the no-AI gate.

---

## 8. Definition of done (v2 acceptance gate)

Ship only when all are true:

- [ ] All five lessons are **scenario games**: the thing the learner manipulates **is** the real-world situation, not an abstraction standing in for it.
- [ ] Each lesson threads **one shared world** across its concept / predict / interactive / question steps via the scenario state.
- [ ] Each lesson keeps a clear **predict → act → surprise** beat, with the surprise delivered through the scenario (broke at N=10; 3 systems = 100× safer; spam jumps to 80%; positive is <10% real; up early then down).
- [ ] All six widgets implemented, animated, touch-friendly, 60fps on their animated path, reduced-motion respected.
- [ ] Consistent **vector art + motion language** across all five (shared stage frame, shared semantic palette, animated transitions not instant recolors).
- [ ] All **feedback hand-authored** for right and wrong, per option where it helps. **No AI anywhere.**
- [ ] Engine, schema, auth, persistence, streaks, mastery, unlock, redo — **unchanged and still passing their tests**.
- [ ] The five e2e scenarios pass against the new widgets; unit/integration coverage (checkAnswer, selectFeedback, mastery, streak, content validation) green.
- [ ] Performance targets met on the deployed app (feedback < 100ms, 60fps interaction, first interaction < 2s, mobile/touch).
- [ ] Deployed, public; README updated to describe the scenario-game design.

---

## 9. Build order (vertical, one great lesson first)

1. **L4 — The Screening Clinic, end to end.** It's the centerpiece and the screenshot moment, and it exercises everything: scenario state, a Canvas crowd-flow widget, the bin-split surprise animation, the `bayesFormula` companion, authored feedback. Get this one genuinely great before anything else — if the clinic lands, the pattern is proven.
2. **`ScenarioProvider`** + concept-step read-only views, generalized from L4.
3. **L1 — The Insurance Desk** (and confirm it loops thematically to L5).
4. **L5 — The Casino Floor**, including the "be the house" flip that closes the L1 loop.
5. **L2 — The Redundancy Bay** and **L3 — The Spam Inbox**.
6. Reduced-motion pass on all five, mobile/touch polish, update Playwright selectors, deploy, README.

> The build is judged on whether **one scenario actually teaches its concept by being played** — start with the clinic. Five lessons that feel like situations beat any number of lessons that feel like instrument panels. Keep the spine; overhaul the surface; let the math bite.