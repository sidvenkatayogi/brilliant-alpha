# PRD — "Long Run" Phase 2: Cohorts, Weekly Meetings & AI Facilitation

**Builds on the shipped Phase 1 MVP (the 5-lesson probability course). Read alongside the existing `PRD.md` and the current repo.** This phase deliberately lifts two Phase 1 non-goals: it adds **social/cohort features** and the app's **first AI feature**.

---

## 0. One-liner

Turn the solo learner into a **book-club cohort**: on first visit, each user is matched into a small group of peers at a similar level. Every week the group picks a meeting time inside the app (a LettuceMeet-style availability poll), and an **AI facilitator** hands them a discussion outline beforehand — because everyone in the group is a peer, the AI plays the "teacher in the room" so the meeting has structure. The video call itself is outsourced (Zoom/phone/whatever). A **Group tab** ties it together: see your members, schedule the meeting, get the outline, and watch which lessons your peers have reached — gently, as motivation, never as a leaderboard.

The authored lessons from Phase 1 are **unchanged**. AI is added only for *facilitating the human discussion*, not for teaching content. That line is load-bearing — see §6.4.

---

## 1. What changes, and what explicitly does not

**Stays exactly as-is (do not touch):**
- The 5 authored lessons, the typed-step content model, the widget registry, answer-checking, authored feedback.
- Per-user progress, streaks, mastery, the unlock rule, the course path. All Phase 1 derived logic (§8 of `PRD.md`) is unchanged.
- The "no AI in the *teaching* path" principle. Lessons still teach with zero model calls; feedback is still hand-written.

**Phase 1 non-goals now intentionally reversed:**
- *"Any AI"* → we add **one** AI feature (the meeting-outline generator), isolated to the social layer.
- *"Social features, leaderboards, sharing"* → we add cohorts and peer-progress visibility. Note: **leaderboards remain out** (§6.2 explains why presence, not ranking).

**New architectural firsts for this codebase** (each is a real change, called out so it doesn't surprise you):
1. A **backend**: Firebase Cloud Functions, needed to hold the Anthropic API key and to do shared/transactional writes (cohort assignment). Phase 1 was client-only.
2. **Cross-user reads**: peers must see each other's lesson status. Phase 1's rule was "a user reads only their own data." This needs a scoped relaxation (§9).
3. A **privacy projection**: a deliberately thin, peer-visible copy of progress so peers never see your wrong answers, attempts, or mastery score (§6.2, §8).

---

## 2. Key decisions I made for you (override any of these before building)

These were ambiguous in the brief. I picked sensible defaults so Claude Code has a concrete spec. Change the value, not the structure, if you disagree.

| # | Decision | Default | Why / how to change |
|---|---|---|---|
| D1 | **Cohort size** | 4–6 members (`maxSize = 6`, soft target 4) | Big enough for discussion, small enough to schedule. Change `maxSize`. |
| D2 | **What "similar level" means** | A *level band* derived from `totalLessonsCompleted` (band 0 = 0 done, band 1 = 1–2, band 2 = 3–4, band 3 = 5/done) | Coarse on purpose — a 5-lesson course fragments if bands are too fine. Tune the band cutoffs in one place (`levelBand()`). |
| D3 | **When assignment happens** | First time a user opens the Group tab without a `cohortId` | Avoids assigning users who never engage socially. Alternative: assign at signup. |
| D4 | **Cohorts are permanent** | Yes — once assigned, you stay with your group even as you outpace them | Keeps the book-club intact. A "re-cohort me" action is a P2 nice-to-have, not built. |
| D5 | **Meeting cadence** | One meeting poll per **ISO week** (`weekId = "2026-W26"`); a new poll appears each Monday local time | Matches "every week." |
| D6 | **Who confirms the time** | **Any** member can lock the winning slot; first to confirm wins and it's shared | Lightweight. Alternative: only a rotating "host." |
| D7 | **The meeting itself** | **Outsourced.** App stores an optional pasted link (Zoom/Meet/phone); it does **not** host video | Per the brief. |
| D8 | **AI model for outlines** | `claude-sonnet-4-6` (good balance of quality/speed/cost; supports structured output) | Swappable via one env constant. `claude-haiku-4-5` for cheaper, `claude-opus-4-8` for richer. |
| D9 | **Peer progress granularity** | Lesson-level **started / completed** only. Never step results, attempts, or mastery | Privacy + motivation (§6.2). |
| D10 | **Timezones** | Candidate slots stored as **absolute UTC timestamps**, rendered in each member's local time | Cohorts may span timezones. This is the sharpest edge in the build — see §6.3. |

---

## 3. Persona update

Still **Maya, 29** (see Phase 1 §2). What's new: Maya is *intrinsically* motivated but comes back for **momentum**, and the single biggest momentum source is other people. She doesn't want a competitive grind — being "last on the leaderboard" would make her quietly quit. She *does* want to feel a few peers moving alongside her, a standing weekly reason to show up, and a low-effort way to make the meeting not-awkward. Design consequences:

| Maya's trait (carried over / new) | Phase 2 consequence |
|---|---|
| Comes back for momentum, not grades | Peer progress is **presence, not ranking** (§6.2). No positions, no "you're behind." |
| Hates organizing logistics | One-tap availability poll; the app proposes the best slot. |
| Walks into a peer meeting unsure what to say | AI hands the group a ready facilitator outline tied to the exact lessons they've done. |
| Mobile, 10-min couch sessions | The whole Group tab, including the availability grid, is touch-first and reflows to one column. |

When a Phase 2 design call is ambiguous, resolve it for Maya: **gentler, lower-effort, motivating, never competitive.**

---

## 4. Goals & non-goals (Phase 2)

### In scope
- **Cohort assignment**: auto-match a user into a small same-level group; create a new group when none fits.
- **Group tab**: members list, weekly scheduler, AI outline, peer progress — all in one screen.
- **Weekly meeting scheduler**: LettuceMeet-style availability grid → overlap heatmap → confirmed time + optional pasted link.
- **AI meeting outline generator**: a facilitator-style agenda + discussion questions grounded in the lessons the group has actually completed. Cached per meeting, regenerable on demand.
- **Peer progress view**: per-lesson, "be the first to start this lesson!" until someone does, then the set of peers who've started/completed it — unordered.
- **Backend**: minimal Cloud Functions (cohort assignment + AI call) and extended security rules.
- **Tests** for all of the above (unit, emulator/rules, mocked-AI, e2e).

### Explicitly out of scope (don't let these creep in)
- **Leaderboards / rankings / competitive positioning.** Presence only. (This is a product decision, not a time cut — see §6.2.)
- **In-app video/voice.** The call is outsourced.
- **AI in the teaching path.** No AI hints, no AI-generated lessons or problems. AI touches the social layer only.
- **Chat/DMs, comments, reactions, notifications, email/push.** (A future phase.)
- **Re-cohorting / leaving a cohort / multi-cohort membership.** One cohort per user, permanent (D4).
- **Cross-cohort discovery, public profiles, friend graphs.**
- Calendar integration (Google Cal invites). Nice later; not now.

---

## 5. User stories

P0 = ship gate, P1 = strongly wanted, P2 = if time.

**Cohort**
- P0 — As a learner, the first time I open the Group tab I'm automatically placed in a small cohort of peers near my level, or a new cohort is created for me if none fits.
- P0 — As a learner, I can see my cohort's members (display names, where each is in the course).
- P1 — As a learner, my cohort has a friendly name so it feels like a group, not a row in a database.

**Weekly scheduling**
- P0 — As a cohort member, I can open this week's meeting and mark the time slots I'm available, on touch, by dragging across a grid.
- P0 — As a cohort member, I can see an overlap view that highlights when the *most* of us are free, and the app suggests the best slot.
- P0 — As a cohort member, I can confirm a final meeting time for the week, and everyone then sees it as locked.
- P0 — As a cohort member, I can paste a meeting link (Zoom/Meet/etc.) onto the confirmed meeting so the group knows where to go.
- P1 — As a cohort member, when a new week starts I see a fresh, empty poll without anyone having to reset anything.

**AI facilitation**
- P0 — As a cohort member, I can generate an AI meeting outline for this week that gives us an agenda, discussion questions, and a peer-teaching prompt based on the lessons we've completed.
- P0 — As a cohort member, once the outline is generated it's saved on the meeting so everyone sees the same one without re-spending tokens.
- P1 — As a cohort member, I can regenerate the outline (e.g., after more of us finish a lesson), within a sensible rate limit.

**Peer progress**
- P0 — As a learner, in the Group tab I can see, per lesson, which of my cohort-mates have started or completed it.
- P0 — As a learner, if no one in my cohort has started a lesson yet, I see an invitation to "be the first to start this lesson!"
- P0 — As a learner, the peer list for a lesson is shown **unordered** (presence, not ranking) and never reveals anyone's scores or wrong answers.

**Platform**
- P0 — As a learner, the entire Group tab works on a phone with touch and on desktop.

---

## 6. Feature specifications

### 6.1 Cohorts & assignment

A **cohort** is a small, permanent group of learners near the same level, formed lazily.

**Assignment (callable Cloud Function `assignCohort`, runs in a Firestore transaction):**
1. If the caller already has `cohortId`, return it (idempotent).
2. Compute the caller's `levelBand` from their `totalLessonsCompleted` (D2).
3. Find an existing cohort with the same `levelBand` and `memberUids.length < maxSize`. If several, pick the one with the fewest members (fill toward the soft target of 4 before opening a 5th).
4. If found: add the caller to `memberUids`, set the caller's `cohortId`.
5. If none: create a new cohort (`levelBand`, generated `name`, `memberUids: [uid]`, `maxSize: 6`), set `cohortId`.
6. Return the cohort id.

**Why a function + transaction:** two users hitting "assign" at the same moment must not both create cohorts or overfill one. The transaction makes step 3–5 atomic. Clients never write `memberUids` directly (rules deny it — §9); all membership changes go through the Admin SDK in the function.

**Edge cases to handle:**
- *Lonely pioneer:* an advanced user whose band has no open cohort gets a fresh single-member cohort; it fills as others reach that band. The Group tab must render gracefully for a cohort of one ("your group is forming — invite a friend or check back soon").
- *Level drift:* a user keeps their cohort even after outpacing it (D4). Peer progress will simply show them ahead. That's fine and even motivating for the others.

**Cohort name (P1):** generate something light on creation (e.g., adjective + probability noun: "The Lucky Priors", "Team Long Run"). Keep a small word list; no AI needed.

### 6.2 Peer progress — presence, not ranking ("be the first")

For each lesson in the course, the Group tab shows the caller's cohort-mates' status from the **peer-visible projection** (§8), never from the private progress docs.

**Display logic per lesson:**
- **No cohort member has started it** → show the motivating CTA: **"Be the first to start this lesson!"** (and, if it's unlocked for the caller, a button into the lesson).
- **At least one has started** → show a row of member chips for everyone who has **started** or **completed** it, with a subtle marker distinguishing started vs completed. **Render this set unordered** — alphabetical or arrival-order is fine, but it must **not** be a ranked/positioned list, and must **not** show counts like "3rd of 6."

**Why no ranking (this is deliberate, not laziness):** the persona quits if she feels "behind." Ranking turns a book club into a race and punishes the exact users we most want to retain — the slower ones. Presence ("these peers are here too") motivates; position ("you're last") demotivates. So: no leaderboard, no ordering by progress, no percentile, ever. If you later want a number, prefer cohort-positive framings ("4 of you have reached Bayes") over individual ranking.

**Privacy guarantee:** peers see only *lesson-level started/completed* (D9). They never see attempts, wrong answers, per-step results, streaks, or mastery scores. The projection (§8) physically cannot leak these because it doesn't contain them.

### 6.3 Weekly meeting scheduler (LettuceMeet-style)

Each cohort has **one meeting poll per ISO week** (D5). Doc id is the `weekId` so creation is naturally race-safe.

**Candidate slots:** generated from a config: a window of days (the coming week) × time blocks. Default: 7 days × hourly blocks across a configurable daily range (e.g., 08:00–22:00). Slots are stored as **absolute UTC timestamps** and rendered in each viewer's local timezone (D10). Keep the grid tractable on mobile — consider hourly (not 15-min) blocks and an evening-weighted default range; make block size and range config constants.

> **Timezone is the sharpest edge here.** If you store slots as naive local strings, a cross-timezone cohort will see misaligned grids and agree to the wrong time. Store UTC instants; convert on render with the browser's tz. Add a unit test for a two-timezone overlap (§13).

**Availability capture:** the availability grid widget (§11) lets a member drag to select the slots they're free. On release, write the member's selection to their own availability doc (subcollection under the meeting — §8). Writes are debounced; each member writes only their own doc (no contention on a shared doc).

**Overlap view:** computed **client-side** from all availability docs in the meeting. Each slot shows how many members are free (a heatmap intensity). The app surfaces a **suggested best slot** = the slot with the maximum free count, ties broken by earliest start. This is instant — no network in the interaction.

**Confirming:** any member can tap a slot (typically the suggested one) to **confirm** it. That writes `finalizedSlot` + `status: "scheduled"` to the meeting doc; all members now see the locked time. Any member can paste a `meetingLink` (Zoom/Meet/phone note). A member can **unlock/change** the time (writes `status` back to `"scheduling"`) — keep it simple, last-write-wins, it's a small trusted group.

**New week:** when a member opens the Group tab and the current `weekId` meeting doc doesn't exist, the client creates it (deterministic id = weekId; rules allow any cohort member to create it; a losing race just reads the existing doc). No scheduler/cron needed.

### 6.4 AI meeting outline generator (the one AI feature)

Gives the peer group structure for their call. Because everyone is a peer with no designated expert, **the AI plays facilitator/teacher**: it produces the agenda and the prompts a good discussion leader would, grounded in the specific lessons the group has done.

**Hard boundary (keep the app's identity intact):** the AI does **not** teach probability, generate lesson content, write hints, or grade anyone. It only structures a *human* discussion of already-authored, already-learned material. If a request would have the AI explain the concept itself, that's out of scope — the lessons do that.

**Where it runs:** a callable Cloud Function `generateMeetingOutline(cohortId, weekId)`. The function:
1. Verifies the caller is a member of the cohort.
2. Gathers, from the peer projections, the set of lessons the cohort has **collectively completed** (the shared, discussable ground) and which are **in progress**.
3. Pulls those lessons' static metadata from the repo content (titles, `conceptSummary`, `realWorldHook`) — this is the substrate the outline is built on.
4. Builds a prompt (see contract below) and calls the Anthropic Messages API (`POST https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`, model from D8).
5. Parses the **structured JSON** response defensively, then writes it to the meeting doc as `aiOutline` with `generatedAt` and the model id. Returns it.

**Caching & rate limit:** the outline is stored on the meeting doc so all members read the same one for free. Regeneration (P1) is allowed but rate-limited (e.g., at most once every few minutes per meeting, and/or only when peer progress has changed since `generatedAt`). The function is the only thing holding the API key.

**API key handling:** stored as a Functions secret (`firebase functions:secrets:set ANTHROPIC_API_KEY`); never shipped to the client, never in the repo. Use `@anthropic-ai/sdk` in the function.

**Prompt contract (input → output).** System prompt frames Claude as a warm peer-group facilitator for a probability book club, told explicitly *not* to re-teach concepts but to structure discussion among equals. User content provides: cohort size, the lessons completed (id, title, conceptSummary, realWorldHook), lessons in progress, and the target meeting length (e.g., 45 min). Instruct Claude to return **only** JSON (no prose, no code fences) in this shape:

```jsonc
{
  "warmUp": "one short icebreaker tied to a real-world hook",
  "agenda": [
    { "title": "...", "minutes": 10, "facilitatorNote": "what to do / how to run this block" }
  ],
  "discussionQuestions": [
    { "lessonId": "long-run", "question": "..." }
  ],
  "peerTeachingActivity": "a 'each person explains X to the group' style activity grounded in a completed lesson",
  "wrapUp": "how to close + a nudge toward next week's lessons"
}
```

Parse with a try/catch, strip accidental code fences, validate the shape, and on failure fall back to a **static authored outline template** (so the feature degrades gracefully and the group is never stuck). The frontend renders this JSON natively — mirroring the app's existing "structured data, not HTML" philosophy.

### 6.5 The Group tab (screen that ties it together)

One screen, `/group`, with four sections (sub-tabs or stacked cards; on mobile, stacked and collapsible):
1. **Members** — cohort name + each member's display name and course position (e.g., "on Lesson 3").
2. **This week's meeting** — the availability grid + overlap + suggested slot; the confirmed time + pasted link once locked.
3. **Meeting outline** — a "Generate outline" button (or the cached outline), rendered from the JSON in §6.4.
4. **Peer progress** — the per-lesson presence view from §6.2.

If the user has no cohort yet, opening the tab triggers `assignCohort` (with a loading state), then renders.

---

## 7. Architecture changes

Phase 1 was client-only React + Firebase. Phase 2 adds the **smallest possible backend**:

- **Firebase Cloud Functions (TypeScript)** — exactly two callable functions:
  - `assignCohort` — transactional cohort matching/creation (Admin SDK).
  - `generateMeetingOutline` — the Anthropic call; holds the API key.
  - Everything else (availability writes, overlap math, confirming a time, writing the peer projection, reading members) stays **client + security rules**. Don't build functions you don't need.
- **Anthropic SDK** (`@anthropic-ai/sdk`) inside the functions package only.
- Frontend gains: a `/group` route, the availability-grid widget, a cohort/meeting data layer (new Context or hooks alongside the existing Auth/Progress contexts), and the peer-projection write hooked into the existing lesson start/complete path.
- Stack otherwise unchanged: Vite + React 18 + TS, Tailwind, React Router, Firestore, Firebase Auth, Firebase Hosting, Emulator Suite for tests.

```
existing client  ──(rules)──>  Firestore
       │                          ▲
       │ callable                 │ Admin SDK
       ▼                          │
  Cloud Functions ────────────────┘
       │
       └── generateMeetingOutline ──> Anthropic Messages API (key in Functions secret)
```

---

## 8. Data model (Firestore)

Phase 1 docs are unchanged. **`users/{uid}` gains one field:**

```jsonc
{
  // ...all existing Phase 1 fields...
  "cohortId": "cohort_ab12cd"      // null until assigned
}
```

**`cohorts/{cohortId}`** — group metadata; written only by the `assignCohort` function.
```jsonc
{
  "name": "The Lucky Priors",
  "levelBand": 1,                  // see D2
  "memberUids": ["uid1", "uid2", "uid3"],
  "maxSize": 6,
  "createdAt": Timestamp
}
```

**`cohorts/{cohortId}/memberProgress/{uid}`** — the **peer-visible projection**. Thin on purpose: this is the *only* thing peers can read about each other, so it contains nothing sensitive. Written by each user (self-write) whenever they start/complete a lesson, alongside their normal private progress write.
```jsonc
{
  "uid": "uid2",
  "displayName": "Maya",
  "lessonsStarted":   ["long-run", "combining-events"],
  "lessonsCompleted": ["long-run"],
  "currentLessonId":  "combining-events",   // for "on Lesson N" display
  "updatedAt": Timestamp
  // NOTE: deliberately NO stepResults, attempts, masteryScore, streaks.
}
```

**`cohorts/{cohortId}/meetings/{weekId}`** — one per ISO week; id = `weekId` (race-safe create).
```jsonc
{
  "weekId": "2026-W26",
  "status": "scheduling",          // "scheduling" | "scheduled"
  "slotConfig": { "tz": "UTC", "blockMinutes": 60, "days": [...], "startHour": 8, "endHour": 22 },
  "finalizedSlotStart": null,      // UTC timestamp once confirmed
  "meetingLink": null,             // pasted Zoom/Meet/phone note
  "confirmedBy": null,             // uid
  "aiOutline": null,               // the JSON from §6.4 once generated
  "aiOutlineMeta": null,           // { generatedAt, model: "claude-sonnet-4-6", byUid }
  "createdAt": Timestamp
}
```

**`cohorts/{cohortId}/meetings/{weekId}/availability/{uid}`** — each member's own picks (separate docs to avoid write contention on the meeting).
```jsonc
{
  "uid": "uid2",
  "displayName": "Maya",
  "slots": [ /* UTC timestamps or slot ids the user is free */ ],
  "updatedAt": Timestamp
}
```

**Derived, computed in-app (not stored):** the overlap heatmap and suggested best slot (from the availability docs); each lesson's "be-the-first vs presence" state (from `memberProgress`). The level band is a pure function of `totalLessonsCompleted`.

---

## 9. Security rules

Phase 1's "own-data-only" rule is **kept for `users/{uid}` and its private `progress` subcollection** — peers still can't read your real progress. New scoped rules:

- **`cohorts/{cid}`** — *read* if `request.auth.uid in resource.data.memberUids`. *Write* denied to clients (only the Admin SDK in `assignCohort` writes membership).
- **`cohorts/{cid}/memberProgress/{uid}`** — *read* if the requester is a member of `cid` (`get(/cohorts/$(cid)).data.memberUids` contains the requester). *Create/update* only if `uid == request.auth.uid` and the requester is a member.
- **`cohorts/{cid}/meetings/{wid}`** — *read/create/update* if requester is a member of `cid`. (Members can create the week's doc, mark availability via the subcollection, confirm a time, paste a link.)
- **`cohorts/{cid}/meetings/{wid}/availability/{uid}`** — *read* if requester is a member of `cid`; *create/update* only if `uid == request.auth.uid` and requester is a member.

Membership checks use `get()` on the cohort doc (a billed read per check — fine at this scale; if it ever matters, the function can mint membership claims instead). **Required rules tests** (emulator): a non-member cannot read another cohort's members, meetings, availability, or projections; a member cannot write another member's projection or availability; no client can write `cohorts/{cid}.memberUids` directly.

---

## 10. Screens & navigation (additions)

- Add a **Group** entry to the primary nav (alongside the course path / dashboard).
- **`/group`** — the Group tab (§6.5). Triggers `assignCohort` on first load if `cohortId` is null (loading state, then render).
- Existing routes (`/`, `/lesson/:id`, `/lesson/:id/complete`, `/login`, `/signup`, `/profile`) unchanged. The dashboard may optionally surface a small "Your group meets — pick a time" nudge linking to `/group` (P1).
- Mobile-first throughout: the availability grid, member chips, and outline all reflow to a single column and work on touch.

---

## 11. New widget: the availability grid

A **touch-first availability picker** (LettuceMeet/when2meet style), reusable and consistent with the existing widget philosophy (structured props, finger-friendly).

- **Render:** day columns × time-block rows for the coming week, labeled in the viewer's local timezone (D10). Default hourly blocks; range from `slotConfig`.
- **Interaction:** drag (touch or mouse) to paint a contiguous selection; drag again to deselect. Selection commits (debounced write) on release. Must hold 60fps while dragging on a phone (Canvas if needed for the heatmap, like the Phase 1 widgets; SVG/DOM is acceptable if it stays smooth).
- **Two modes:** *edit mode* (your own availability, editable) and *overlap mode* (read-only heatmap of how many members are free per slot, with the suggested best slot highlighted and a tap-to-confirm affordance).
- **Empty/loading states:** "no availability yet — be the first to add yours"; cohort-of-one handled gracefully.
- Honor `prefers-reduced-motion` (consistent with Phase 1's animated widgets).

---

## 12. AI integration details (function-side)

- **Endpoint/headers:** `POST https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`, `x-api-key` from the Functions secret. Use `@anthropic-ai/sdk`.
- **Model:** `claude-sonnet-4-6` by default (D8), behind a single env/config constant so it's a one-line swap. (`claude-haiku-4-5` if you want it cheaper; `claude-opus-4-8` if you want richer outlines.) *Note: the Mythos-class models (Fable 5 / Mythos 5) are not a fit here and may be access-restricted; stick to the Opus/Sonnet/Haiku line.*
- **Output:** strict JSON per §6.4; the system prompt forbids prose and code fences; the function still strips fences defensively and validates shape before storing.
- **Failure handling:** on any API error or parse failure, return a static authored fallback outline so the group is never blocked; log the error server-side.
- **Cost control:** cache on the meeting doc; rate-limit regeneration; cap `max_tokens` to a sane outline size. One Sonnet call per generated outline, shared by the whole cohort.
- **No PII to the model beyond display names and lesson ids/titles.** Don't send emails, uids, or private progress detail.

---

## 13. Testing requirements

Extends the Phase 1 suite (which stays green). Mock the Anthropic call in all tests — **never hit the real API in CI.**

**Unit (Vitest + RTL):**
- `levelBand()` band boundaries (0 / 1–2 / 3–4 / 5).
- Overlap math: best-slot selection, tie-break by earliest, all-free and none-free edge cases.
- **Two-timezone overlap:** two members in different timezones marking "the same real instant" overlap correctly (guards D10).
- Peer-progress state machine: "be the first" when empty → presence (unordered) once a peer starts; renders no ranking and no scores.
- Outline JSON parsing: valid JSON, JSON wrapped in code fences, and malformed output → fallback template.
- Cohort name generator is deterministic/testable.

**Integration / rules (Firebase Emulator):**
- `assignCohort`: fills an existing under-capacity same-band cohort; creates a new one when none fits; is idempotent for an already-assigned user; concurrent callers don't overfill or double-create (transaction).
- Rules: non-member denied on members/meetings/availability/projection reads; member can't write another member's availability or projection; client can't write `memberUids`.
- Peer projection round-trips and contains none of the forbidden fields.

**Mocked-AI:**
- `generateMeetingOutline` builds the prompt from the right lessons, stores `aiOutline` + meta, is cached on second read, respects the regen rate limit, and falls back on a stubbed API error.

**End-to-end (Playwright) — new scenarios:**
1. A new user opens the Group tab and is assigned to a cohort; sees members.
2. A member marks availability on the grid (touch), sees the overlap update, and confirms a time that locks for the cohort.
3. A member generates a meeting outline (AI mocked) and it renders; a second member sees the same cached outline.
4. Peer progress shows "be the first to start this lesson!"; after a peer starts, it shows that peer present and unordered, with no scores leaked.
5. The full Group tab on a phone-sized viewport with touch.

---

## 14. Performance & cost targets

- The Phase 1 targets (feedback <100ms, 60fps widgets, <2s to first interaction) are unchanged for the learning path.
- **Availability grid:** dragging holds 60fps on mobile; overlap recompute is local and instant (no network in the interaction).
- **AI outline:** it's behind an explicit button, async, and cached — never in a hot path. Show a clear loading state; one Sonnet call per generation, shared by the cohort. Rate-limit regeneration.
- **Reads:** rule membership checks add `get()` reads; acceptable at cohort scale. Don't fan out reads of every member's private progress — read the thin projections.

---

## 15. Definition of done (Phase 2 gate)

Ship only when **all** are true:
- [ ] Phase 1 still passes end to end; lessons, feedback, progress, streaks, mastery untouched and AI-free.
- [ ] First visit to the Group tab assigns the user into a same-level cohort (or creates one); assignment is transactional and idempotent.
- [ ] Group tab shows members with course position.
- [ ] Weekly availability grid works on touch; overlap + suggested slot compute locally; any member can confirm a time and paste a link; a new week yields a fresh poll automatically.
- [ ] Timezones handled: a cross-timezone overlap test passes.
- [ ] AI outline generates from the cohort's completed lessons, returns valid structured JSON, renders natively, is cached on the meeting, regenerates within a rate limit, and falls back gracefully on error. API key lives only in a Functions secret.
- [ ] Peer progress shows "be the first" then unordered presence; **no ranking, no leaderboard, no leaked scores/attempts/mastery.**
- [ ] Security rules: peers read only the thin projection + shared meeting data; private progress stays private; rules tests pass.
- [ ] Whole Group tab works on mobile and desktop.
- [ ] Full test suite (unit + emulator/rules + mocked-AI + the 5 new e2e scenarios) passing; CI never calls the real Anthropic API.
- [ ] Deployed, public; README updated with the cohort/AI architecture and `ANTHROPIC_API_KEY` setup.

---

## 16. Suggested build order (vertical, lowest-risk first)

1. **Data model + rules first.** Add `cohortId`, the `cohorts` tree, and security rules; write the emulator rules tests. Get the privacy boundary right before any UI.
2. **`assignCohort` function** + the Group tab shell that calls it and lists members (cohort-of-one handled).
3. **Peer projection write** hooked into the existing lesson start/complete path, then the **peer-progress view** ("be the first" → unordered presence). This is high-value and low-risk.
4. **Availability grid widget** + meeting doc + per-member availability + overlap/suggest/confirm + pasted link. Nail timezones here.
5. **`generateMeetingOutline` function** (with the Anthropic call, secret, caching, fallback) + the outline renderer. Mock it in tests from the start.
6. **Full test suite, mobile polish, deploy**, README update.

> The bar for this phase: a real cohort can, in one sitting on a phone, find a time and walk into a peer call with an AI-made outline in hand — while the solo learning experience from Phase 1 is exactly as good as it was, and no peer can ever see another peer's mistakes. Build the social spine (1–4) before the AI flourish (5); the group is what makes Maya come back, the outline is what makes the meeting good.