/* eslint-disable */
// Seeds the local Emulator Suite with a ready-made demo: a login account already
// in a cohort, three dummy members at various points in the course, and their
// filled availability — but the login account's OWN availability left empty so
// you can demo adding it and watching the overlap update.
//
//   1) npm run emulators:all       (in one terminal — starts auth+firestore+functions)
//   2) npm run seed:demo           (in another terminal — runs this script)
//   3) npm run dev:test            (open http://localhost:5173 and log in)
//
// Re-run any time to reset the demo data. Emulator data is in-memory, so it also
// resets when you restart the emulators.

const admin = require('firebase-admin')

// Point the Admin SDK at the running emulators.
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'

const PROJECT_ID = 'demo-long-run'
admin.initializeApp({ projectId: PROJECT_ID })
const db = admin.firestore()
const auth = admin.auth()

// --- login account ---
const LOGIN = {
  uid: 'demo-maya',
  email: 'demo@longrun.app',
  password: 'demo1234',
  displayName: 'Maya',
}
const COHORT_ID = 'demo-cohort'

// --- pure slot logic, mirrored from src/cohort/{weekId,slots}.ts ---
const DEFAULT_SLOT_CONFIG = { tz: 'UTC', blockMinutes: 60, startHour: 17, endHour: 22 }
const HOURS_PER_DAY = DEFAULT_SLOT_CONFIG.endHour - DEFAULT_SLOT_CONFIG.startHour // 5

function startOfIsoWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const isoDay = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (isoDay - 1))
  return d
}
function currentWeekId(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const isoDay = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() + 4 - isoDay)
  const isoYear = d.getFullYear()
  const yearStart = new Date(isoYear, 0, 1, 12)
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}
function buildSlotConfig(weekStart = startOfIsoWeek()) {
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return { ...DEFAULT_SLOT_CONFIG, days }
}
function generateSlots(config) {
  const slots = []
  for (const day of config.days) {
    const [y, m, d] = day.split('-').map(Number)
    for (let hour = config.startHour; hour < config.endHour; hour += config.blockMinutes / 60) {
      slots.push(new Date(y, m - 1, d, hour, 0, 0, 0).getTime())
    }
  }
  return slots
}
function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const weekId = currentWeekId()
const slotConfig = buildSlotConfig()
const slots = generateSlots(slotConfig)
// Slot index for a given weekday (Mon=0…Sun=6) and local hour.
const idx = (dayIdx, hour) => dayIdx * HOURS_PER_DAY + (hour - DEFAULT_SLOT_CONFIG.startHour)
const at = (dayIdx, hour) => slots[idx(dayIdx, hour)]

// --- dummy members (Firestore-only; they never log in) ---
const DUMMIES = [
  {
    uid: 'demo-ada',
    displayName: 'Ada',
    lessonsCompleted: ['long-run', 'combining-events'],
    lessonsStarted: ['long-run', 'combining-events', 'conditioning'],
    currentLessonId: 'conditioning',
    // Free: Tue 19–20, Wed 19–21, Thu 19
    slots: [at(1, 19), at(1, 20), at(2, 19), at(2, 20), at(2, 21), at(3, 19)],
  },
  {
    uid: 'demo-bo',
    displayName: 'Bo',
    lessonsCompleted: ['long-run'],
    lessonsStarted: ['long-run', 'combining-events'],
    currentLessonId: 'combining-events',
    // Free: Mon 18, Wed 19–20, Thu 19–20
    slots: [at(0, 18), at(2, 19), at(2, 20), at(3, 19), at(3, 20)],
  },
  {
    uid: 'demo-chen',
    displayName: 'Chen',
    lessonsCompleted: ['long-run', 'combining-events', 'conditioning', 'bayes-base-rates'],
    lessonsStarted: ['long-run', 'combining-events', 'conditioning', 'bayes-base-rates'],
    currentLessonId: null, // finished Bayes, hasn't started Expected Value
    // Free: Tue 20, Wed 19, Thu 19
    slots: [at(1, 20), at(2, 19), at(3, 19)],
  },
]
// → Wed 19:00 and Thu 19:00 each overlap all three dummies (count 3); the app
//   suggests Wed 19:00 (earliest of the tie).

async function upsertAuthUser() {
  try {
    await auth.getUser(LOGIN.uid)
    await auth.updateUser(LOGIN.uid, {
      email: LOGIN.email,
      password: LOGIN.password,
      displayName: LOGIN.displayName,
    })
  } catch {
    await auth.createUser({
      uid: LOGIN.uid,
      email: LOGIN.email,
      password: LOGIN.password,
      displayName: LOGIN.displayName,
    })
  }
}

async function main() {
  await upsertAuthUser()

  const now = Date.now()
  const today = localDate(new Date())

  // Login user's profile — already assigned to the demo cohort.
  await db.doc(`users/${LOGIN.uid}`).set({
    displayName: LOGIN.displayName,
    email: LOGIN.email,
    createdAt: now,
    currentStreak: 2,
    longestStreak: 2,
    lastActiveDate: today,
    totalLessonsCompleted: 2,
    milestones: ['first_lesson'],
    cohortId: COHORT_ID,
  })

  // Login user's private progress (drives "on Lesson N" + dashboard).
  const mayaProgress = {
    'long-run': { status: 'completed', masteryScore: 1, currentStepIndex: 6 },
    'combining-events': { status: 'completed', masteryScore: 0.83, currentStepIndex: 8 },
    conditioning: { status: 'in_progress', masteryScore: 0, currentStepIndex: 3 },
  }
  for (const [lessonId, p] of Object.entries(mayaProgress)) {
    await db.doc(`users/${LOGIN.uid}/progress/${lessonId}`).set({
      lessonId,
      status: p.status,
      currentStepIndex: p.currentStepIndex,
      stepResults: {},
      masteryScore: p.masteryScore,
      startedAt: now,
      completedAt: p.status === 'completed' ? now : null,
      lastAccessedAt: now,
    })
  }

  // The cohort itself.
  await db.doc(`cohorts/${COHORT_ID}`).set({
    name: 'The Lucky Priors',
    levelBand: 1,
    memberUids: [LOGIN.uid, ...DUMMIES.map((d) => d.uid)],
    maxSize: 6,
    createdAt: now,
  })

  // Peer-visible projection for the login user (so they appear in the members list
  // immediately; the app keeps it in sync afterwards).
  await db.doc(`cohorts/${COHORT_ID}/memberProgress/${LOGIN.uid}`).set({
    uid: LOGIN.uid,
    displayName: LOGIN.displayName,
    lessonsStarted: ['long-run', 'combining-events', 'conditioning'],
    lessonsCompleted: ['long-run', 'combining-events'],
    currentLessonId: 'conditioning',
    updatedAt: now,
  })

  // This week's meeting: two times are on the table. Ada's Wed 19:00 already has
  // the three dummies' approval — so Maya is the final approver who locks it —
  // and Chen has floated a Thu 20:00 alternative the group can also view/approve.
  await db.doc(`cohorts/${COHORT_ID}/meetings/${weekId}`).set({
    weekId,
    status: 'proposed',
    slotConfig,
    proposals: [
      { slotStart: at(2, 19), proposedBy: 'demo-ada', approvals: ['demo-ada', 'demo-bo', 'demo-chen'] },
      { slotStart: at(3, 20), proposedBy: 'demo-chen', approvals: ['demo-chen'] },
    ],
    finalizedSlotStart: null,
    meetingLink: null,
    confirmedBy: null,
    aiOutline: null,
    aiOutlineMeta: null,
    createdAt: now,
  })

  // Dummy members: projection + filled availability (NOT the login user).
  for (const d of DUMMIES) {
    await db.doc(`cohorts/${COHORT_ID}/memberProgress/${d.uid}`).set({
      uid: d.uid,
      displayName: d.displayName,
      lessonsStarted: d.lessonsStarted,
      lessonsCompleted: d.lessonsCompleted,
      currentLessonId: d.currentLessonId,
      updatedAt: now,
    })
    await db.doc(`cohorts/${COHORT_ID}/meetings/${weekId}/availability/${d.uid}`).set({
      uid: d.uid,
      displayName: d.displayName,
      slots: d.slots,
      updatedAt: now,
    })
  }

  console.log('\n✅ Demo data seeded into the emulators.\n')
  console.log('   Log in at http://localhost:5173 with:')
  console.log(`      email:    ${LOGIN.email}`)
  console.log(`      password: ${LOGIN.password}\n`)
  console.log(`   Cohort:  The Lucky Priors  (members: Maya + Ada, Bo, Chen)`)
  console.log(`   Week:    ${weekId}`)
  console.log('   Meeting: two proposed times — Ada\'s Wed 19:00 (3/4 approved) and')
  console.log('            Chen\'s Thu 20:00 (1/4). Log in and "Approve" Wed 19:00 to lock it,')
  console.log('            or "Propose another time" to add your own.\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
