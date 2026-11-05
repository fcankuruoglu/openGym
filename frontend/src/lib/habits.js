// Daily habits: a supplement, a glass of water, a stretch. Something you do at set times on set
// days, a reminder for each, a tick (or a skip) per time, and for the ones that run out (a tub of
// creatine, a box of capsules) how much is left.
//
// Stored as two stamped maps (lib/sync-merge.js STAMPED_MAPS, and api/sync-stamps.js):
//
//   S.habits   = { [id]: { name, times: ['08:00', '21:00'], days: [1, 3, 5], dose: '5 g', post: true,
//                          stock: { n: 60, at, per: 1 }, tz, from: '2026-11-04', _ts }, … }
//   S.habitLog = { '2026-11-04|<id>|08:00': { s: 'done' | 'skip', _ts }, … }
//
// `days` are weekdays, 0 = Sunday; none means every day. `from` is the day it was added, so the
// streak and the rate never count the days before it as missed. `post` adds a time "after the
// workout" on every day a workout is logged, whatever `days` says (time `post` in the log key); a
// habit can have that one alone. The phone reminds of it half an hour after the workout ended, the
// server does not (it has no clock time to go by). `tz` is the zone the habit was saved in,
// so the server's push goes out at that time on the user's clock (api/habits.js, the server's
// copy of the due rule). Removing a habit or a tick is a stamped empty entry (`{ _ts }`), not a
// deleted key, as for day notes: a delete would come straight back from the other device's copy.
//
// The stock is never stored as a running count. Two devices that each took a capsule would both
// write "59" and one capsule would be lost to the merge. It is the count the user last typed in
// (`n`, at `at`) minus `per` for every tick made after that, so each device only ever adds its
// own ticks and the merge of the log is the whole truth.
import { localTZ, todayISO } from './format.js'

export const HABIT_MAX = 20
export const TIMES_MAX = 6
export const NAME_MAX = 60
export const DOSE_MAX = 40
// Under this many days of stock the card says so in red, and every reminder of it says so too.
export const LOW_DAYS = 7
// The reminder's text when the habit has no dose, and the line a low stock adds. English keys:
// translated in the app, and generated into api/habit-copy.js for the server's push.
export const HABIT_PUSH = {
  body: 'Time for it. Tap to tick it off.', low: 'Running low: {0} days left.',
  // The reminder's two buttons: tick it off (the app opens and ticks it), or ask again later.
  done: 'Taken', snooze: 'In 10 min',
}
export const SNOOZE_MIN = 10
// How far back Home's card goes to tick off a day that was forgotten.
export const BACK_DAYS = 7
// A habit's key as it travels in a notification and back: date, id, time (habitKey).
export const HABIT_KEY = /^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_-]{1,40}\|(([01]\d|2[0-3]):[0-5]\d|post)$/
export const POST = 'post'
// How long after a workout ends the phone reminds of an after-workout habit.
export const POST_DELAY_MIN = 30

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const ISO = /^\d{4}-\d{2}-\d{2}$/
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const weekdayOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay()

/** A stored habit read back with the junk left out, or null for none or a removed one. */
export function readHabit(entry) {
  if (!isMap(entry)) return null
  const name = str(entry.name, NAME_MAX)
  const times = [...new Set((Array.isArray(entry.times) ? entry.times : []).filter(x => HHMM.test(x)))].sort().slice(0, TIMES_MAX)
  const post = entry.post === true
  if (!name || !(times.length || post)) return null
  const days = [...new Set((Array.isArray(entry.days) ? entry.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
  const s = entry.stock
  const stock = isMap(s) && Number.isFinite(s.n) && s.n >= 0 && Number.isFinite(s.per) && s.per > 0
    ? { n: s.n, at: Number(s.at) || 0, per: s.per } : null
  const from = typeof entry.from === 'string' && ISO.test(entry.from) ? entry.from : ''
  return { name, times, days: days.length === 7 ? [] : days, dose: str(entry.dose, DOSE_MAX), stock, tz: typeof entry.tz === 'string' ? entry.tz : '', from, post }
}

/** Every habit of the profile, `{ id, …habit }`, by its first time and then by name. */
export function habitsOf(S) {
  const m = isMap(S?.habits) ? S.habits : {}
  return Object.entries(m)
    .map(([id, e]) => { const h = readHabit(e); return h && { id, ...h } })
    .filter(Boolean)
    .sort((a, b) => (a.times[0] || POST).localeCompare(b.times[0] || POST) || a.name.localeCompare(b.name))
}

/**
 * S.habits with `id` set to `habit`, stamped `now` and saved in this device's zone; null removes it.
 * A new habit starts `today`; an edited one keeps the day it started.
 */
export function withHabit(map, id, habit, now = Date.now(), today = todayISO()) {
  const clean = habit && readHabit(habit)
  const from = readHabit(isMap(map) ? map[id] : null)?.from || today
  const entry = clean
    ? { name: clean.name, times: clean.times, ...(clean.days.length ? { days: clean.days } : {}), ...(clean.dose ? { dose: clean.dose } : {}),
        ...(clean.post ? { post: true } : {}),
        ...(clean.stock ? { stock: clean.stock } : {}), tz: localTZ(), from, _ts: now }
    : { _ts: now }
  return { ...(isMap(map) ? map : {}), [id]: entry }
}

// The editor's quick starts. Names and doses are English keys, translated when one is picked, so
// the habit is saved in the language it was made in.
export const HABIT_TEMPLATES = [
  { name: 'Creatine', dose: '5 g', times: ['08:00'] },
  { name: 'Protein shake', dose: '30 g', times: ['17:00'] },
  { name: 'Omega-3', dose: '1 capsule', times: ['08:00'] },
  { name: 'Vitamin D3', dose: '1 capsule', times: ['08:00'] },
  { name: 'Magnesium', dose: '1 capsule', times: ['22:00'] },
  { name: 'Multivitamin', dose: '1 tablet', times: ['08:00'] },
  { name: 'Water', dose: '500 ml', times: ['09:00', '12:00', '15:00', '18:00'] },
]
export const TIME_PRESETS = [
  { label: 'Morning', time: '08:00' }, { label: 'Noon', time: '12:00' },
  { label: 'Evening', time: '18:00' }, { label: 'Bedtime', time: '22:00' },
]
export const DAY_PRESETS = [
  { label: 'Every day', days: [] }, { label: 'Weekdays', days: [1, 2, 3, 4, 5] }, { label: 'Weekend', days: [0, 6] },
]

/** `times` with `time` added (sorted, capped) or taken out; the last time stays unless `keepOne` is false. */
export function toggleTime(times, time, keepOne = true) {
  if (times.includes(time)) return times.length > 1 || !keepOne ? times.filter(x => x !== time) : times
  return [...times, time].sort().slice(0, TIMES_MAX)
}

/** `days` with weekday `d` switched. None means every day, so switching one off there leaves the other six. */
export function toggleDay(days, d) {
  const all = days.length ? days : [0, 1, 2, 3, 4, 5, 6]
  const next = all.includes(d) ? all.filter(x => x !== d) : [...all, d].sort()
  if (!next.length) return days   // the last day stays, as the last time does
  return next.length === 7 ? [] : next
}

export const sameDays = (a, b) => a.length === b.length && a.every(x => b.includes(x))

export const habitKey = (iso, id, time) => `${iso}|${id}|${time}`

/** Whether `habit` (read) is on for the date `iso`. */
export const dueOn = (habit, iso) => !habit.days.length || habit.days.includes(weekdayOf(iso))

const workoutsOf = S => (Array.isArray(S?.workouts) ? S.workouts.filter(w => w && typeof w.d === 'string') : [])
export const trainedOn = (S, iso) => workoutsOf(S).some(w => w.d === iso)
/** The times of `habit` on `iso`: its clock times on its days, and `post` once a workout is logged. */
export const timesOn = (S, habit, iso) => [...(dueOn(habit, iso) ? habit.times : []), ...(habit.post && trainedOn(S, iso) ? [POST] : [])]
/** When the last workout logged on `iso` ended, in ms, or null. */
export function workoutEnd(S, iso) {
  const ends = workoutsOf(S).filter(w => w.d === iso).map(w => (typeof w.end === 'number' ? w.end : Date.parse(w.end))).filter(Number.isFinite)
  return ends.length ? Math.max(...ends) : null
}
// Workout days per day over the last four weeks, for a stock used after workouts; three a week
// before there are any.
export function trainingRate(S, today = todayISO()) {
  const since = dayShift(today, -28)
  const n = new Set(workoutsOf(S).filter(w => w.d > since && w.d <= today).map(w => w.d)).size
  return n ? n / 28 : 3 / 7
}

const markOf = (S, key) => {
  const e = isMap(S?.habitLog) ? S.habitLog[key] : null
  return e?.s === 'done' || e?.s === 'skip' ? e.s : null
}

/** The day's times, earliest first: `{ id, name, dose, time, key, mark }`, mark 'done' | 'skip' | null. */
export function slotsOn(S, iso) {
  const out = []
  for (const h of habitsOf(S)) {
    for (const time of timesOn(S, h, iso)) {
      const key = habitKey(iso, h.id, time)
      out.push({ id: h.id, name: h.name, dose: h.dose, time, key, mark: markOf(S, key) })
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name))
}

/** S.habitLog with `key` marked 'done' or 'skip', stamped `now`; null takes the mark back. */
export function withMark(log, key, mark, now = Date.now()) {
  const entry = mark === 'done' || mark === 'skip' ? { s: mark, _ts: now } : { _ts: now }
  return { ...(isMap(log) ? log : {}), [key]: entry }
}

/** What is left of habit `id`: the count last typed in less one dose per tick since. Null: not counted. */
export function stockLeft(S, id) {
  const h = readHabit(S?.habits?.[id])
  if (!h?.stock) return null
  let taken = 0
  for (const [k, e] of Object.entries(isMap(S.habitLog) ? S.habitLog : {})) {
    if (e?.s === 'done' && (Number(e._ts) || 0) > h.stock.at && k.split('|')[1] === id) taken++
  }
  return Math.max(0, Math.round((h.stock.n - taken * h.stock.per) * 1000) / 1000)
}

/** Whole days the stock of `id` lasts at its plan, or null when it is not counted. */
export function daysLeft(S, id) {
  const left = stockLeft(S, id)
  if (left == null) return null
  const h = readHabit(S.habits[id])
  const perDay = h.stock.per * (h.times.length * (h.days.length || 7) / 7 + (h.post ? trainingRate(S) : 0))
  return Math.floor(left / perDay)
}

// `tr` stands in for t() where there is none: the English key with its {0} filled.
const fill = (s, ...a) => a.reduce((v, x, i) => v.replace(`{${i}}`, x), s)

/** A reminder's text: the dose (or that it is time), and the stock when it is running low. */
export function habitBody(dose, left, tr = fill) {
  const base = dose || tr(HABIT_PUSH.body)
  return left != null && left <= LOW_DAYS ? `${base} · ${tr(HABIT_PUSH.low, left)}` : base
}

/** The date `n` days after (before, for a negative `n`) the date `iso`. */
export const dayShift = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)

/**
 * How habit `id` is going on `today`: `streak`, the due days in a row with every time ticked or
 * skipped (a skip is a choice, not a miss; today counts once it is complete and never breaks it
 * while still open), and `rate`, the share of the due times ticked over the `window` days before
 * today (null before there is one). Days before the habit started are not counted.
 */
export function habitStats(S, id, today = todayISO(), window = 30) {
  const h = readHabit(S?.habits?.[id])
  if (!h) return null
  // A habit from before `from` was kept: the first day it was ticked, or today.
  const logged = Object.keys(isMap(S.habitLog) ? S.habitLog : {}).filter(k => k.split('|')[1] === id).map(k => k.slice(0, 10)).sort()[0]
  const from = h.from || (logged && logged < today ? logged : today)
  const marks = iso => timesOn(S, h, iso).map(time => markOf(S, habitKey(iso, id, time)))
  const kept = iso => marks(iso).every(Boolean)
  let streak = 0
  let d = marks(today).length && kept(today) ? today : dayShift(today, -1)
  for (let i = 0; i < 366 && d >= from; i++, d = dayShift(d, -1)) {
    const m = marks(d)
    if (!m.length) continue
    if (!m.every(Boolean)) break
    streak++
  }
  let due = 0, done = 0
  for (let i = 1; i <= window; i++) {
    const iso = dayShift(today, -i)
    if (iso < from) break
    const m = marks(iso)
    due += m.length
    done += m.filter(x => x === 'done').length
  }
  return { streak, rate: due ? done / due : null }
}

/**
 * The phone's local notifications for the next times not yet ticked or skipped, soonest first and
 * at most `max` of them (iOS keeps 64 pending for the whole app, and the workout reminders use some).
 * `tr` is the app's t(), so this file stays pure.
 */
export function habitNotifications(S, { now = new Date(), max = 20, idBase = 3000, days = 7, tr = fill } = {}) {
  const left = Object.fromEntries(habitsOf(S).map(h => [h.id, daysLeft(S, h.id)]))
  const out = []
  const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  for (let offset = 0; offset < days && out.length < max; offset++) {
    const day = new Date(noon)
    day.setDate(noon.getDate() + offset)
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    for (const s of slotsOn(S, iso)) {
      if (s.mark || out.length >= max) continue
      let at = new Date(day)
      if (s.time === POST) {
        const end = workoutEnd(S, iso)
        if (end == null) continue
        at = new Date(end + POST_DELAY_MIN * 60000)
      } else at.setHours(Number(s.time.slice(0, 2)), Number(s.time.slice(3)), 0, 0)
      if (at <= now) continue
      // The stock as it will be by then, at the plan: a day less for every day ahead.
      const low = left[s.id] == null ? null : Math.max(0, left[s.id] - offset)
      out.push({ id: idBase + out.length, title: s.name, body: habitBody(s.dose, low, tr), actionTypeId: 'habit', extra: { habit: s.key }, schedule: { at, allowWhileIdle: true } })
    }
  }
  return out
}
