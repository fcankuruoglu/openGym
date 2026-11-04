// Daily habits: a supplement, a glass of water, a stretch. Something you do at set times on set
// days, a reminder for each, a tick (or a skip) per time, and for the ones that run out (a tub of
// creatine, a box of capsules) how much is left.
//
// Stored as two stamped maps (lib/sync-merge.js STAMPED_MAPS, and api/sync-stamps.js):
//
//   S.habits   = { [id]: { name, times: ['08:00', '21:00'], days: [1, 3, 5], dose: '5 g',
//                          stock: { n: 60, at, per: 1 }, tz, _ts }, … }
//   S.habitLog = { '2026-11-04|<id>|08:00': { s: 'done' | 'skip', _ts }, … }
//
// `days` are weekdays, 0 = Sunday; none means every day. `tz` is the zone the habit was saved in,
// so the server's push goes out at that time on the user's clock (api/habits.js, the server's
// copy of the due rule). Removing a habit or a tick is a stamped empty entry (`{ _ts }`), not a
// deleted key, as for day notes: a delete would come straight back from the other device's copy.
//
// The stock is never stored as a running count. Two devices that each took a capsule would both
// write "59" and one capsule would be lost to the merge. It is the count the user last typed in
// (`n`, at `at`) minus `per` for every tick made after that, so each device only ever adds its
// own ticks and the merge of the log is the whole truth.
import { localTZ } from './format.js'

export const HABIT_MAX = 20
export const TIMES_MAX = 6
export const NAME_MAX = 60
export const DOSE_MAX = 40
// Under this many days of stock the card says so in red.
export const LOW_DAYS = 7

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const weekdayOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay()

/** A stored habit read back with the junk left out, or null for none or a removed one. */
export function readHabit(entry) {
  if (!isMap(entry)) return null
  const name = str(entry.name, NAME_MAX)
  const times = [...new Set((Array.isArray(entry.times) ? entry.times : []).filter(x => HHMM.test(x)))].sort().slice(0, TIMES_MAX)
  if (!name || !times.length) return null
  const days = [...new Set((Array.isArray(entry.days) ? entry.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
  const s = entry.stock
  const stock = isMap(s) && Number.isFinite(s.n) && s.n >= 0 && Number.isFinite(s.per) && s.per > 0
    ? { n: s.n, at: Number(s.at) || 0, per: s.per } : null
  return { name, times, days: days.length === 7 ? [] : days, dose: str(entry.dose, DOSE_MAX), stock, tz: typeof entry.tz === 'string' ? entry.tz : '' }
}

/** Every habit of the profile, `{ id, …habit }`, by its first time and then by name. */
export function habitsOf(S) {
  const m = isMap(S?.habits) ? S.habits : {}
  return Object.entries(m)
    .map(([id, e]) => { const h = readHabit(e); return h && { id, ...h } })
    .filter(Boolean)
    .sort((a, b) => a.times[0].localeCompare(b.times[0]) || a.name.localeCompare(b.name))
}

/** S.habits with `id` set to `habit`, stamped `now` and saved in this device's zone; null removes it. */
export function withHabit(map, id, habit, now = Date.now()) {
  const clean = habit && readHabit(habit)
  const entry = clean
    ? { name: clean.name, times: clean.times, ...(clean.days.length ? { days: clean.days } : {}), ...(clean.dose ? { dose: clean.dose } : {}),
        ...(clean.stock ? { stock: clean.stock } : {}), tz: localTZ(), _ts: now }
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

/** `times` with `time` added (sorted, capped) or taken out; the last time stays. */
export function toggleTime(times, time) {
  if (times.includes(time)) return times.length > 1 ? times.filter(x => x !== time) : times
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

const markOf = (S, key) => {
  const e = isMap(S?.habitLog) ? S.habitLog[key] : null
  return e?.s === 'done' || e?.s === 'skip' ? e.s : null
}

/** The day's times, earliest first: `{ id, name, dose, time, key, mark }`, mark 'done' | 'skip' | null. */
export function slotsOn(S, iso) {
  const out = []
  for (const h of habitsOf(S)) {
    if (!dueOn(h, iso)) continue
    for (const time of h.times) {
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
  const perDay = h.stock.per * h.times.length * (h.days.length || 7) / 7
  return Math.floor(left / perDay)
}

/**
 * The phone's local notifications for the next times not yet ticked or skipped, soonest first and
 * at most `max` of them (iOS keeps 64 pending for the whole app, and the workout reminders use some).
 * `tr` is the app's t(), so this file stays pure.
 */
export function habitNotifications(S, { now = new Date(), max = 20, idBase = 3000, days = 7, tr = s => s } = {}) {
  const out = []
  const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  for (let offset = 0; offset < days && out.length < max; offset++) {
    const day = new Date(noon)
    day.setDate(noon.getDate() + offset)
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    for (const s of slotsOn(S, iso)) {
      if (s.mark || out.length >= max) continue
      const at = new Date(day)
      at.setHours(Number(s.time.slice(0, 2)), Number(s.time.slice(3)), 0, 0)
      if (at <= now) continue
      out.push({ id: idBase + out.length, title: s.name, body: s.dose || tr('Time for it. Tap to tick it off.'), schedule: { at, allowWhileIdle: true } })
    }
  }
  return out
}
