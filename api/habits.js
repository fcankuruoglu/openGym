// Daily habits — the server half. Hand-copied (not imported) from frontend/src/lib/habits.js, as
// nudge.js is from lib/nudge.js: see there for the shape of S.habits and S.habitLog. Only what the
// push needs: which times are owed now, on each habit's own clock. The tick in server.js adds the
// push subscription and the once-per-time mark in db.json.

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const hhmmToMin = v => (HHMM.test(v || '') ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3)) : NaN);
const weekdayOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay();

export const habitKey = (iso, id, time) => `${iso}|${id}|${time}`;
// lib/habits.js HABIT_KEY: what a snooze may name.
export const HABIT_KEY = /^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_-]{1,40}\|(([01]\d|2[0-3]):[0-5]\d|post)$/;

/** A snoozed time to send again: `{ key, name, dose, left }`, or null once it is ticked, skipped or gone. */
export function habitByKey(S, key) {
  if (!HABIT_KEY.test(key || '')) return null;
  const id = key.split('|')[1];
  const e = isMap(S?.habits) ? S.habits[id] : null;
  if (!isMap(e) || typeof e.name !== 'string' || !e.name.trim()) return null;
  const s = isMap(S.habitLog) ? S.habitLog[key]?.s : null;
  if (s === 'done' || s === 'skip') return null;
  return { key, name: e.name.trim(), dose: typeof e.dose === 'string' ? e.dose.trim() : '', left: daysLeft(S, id, e, key.slice(0, 10)) };
}

/**
 * Whole days the stock of habit `e` (stored, id `id`) lasts at its plan, or null when it is not
 * counted: the count typed in less one dose per tick after it (lib/habits.js stockLeft, daysLeft).
 */
export function daysLeft(S, id, e, today = new Date().toISOString().slice(0, 10)) {
  const st = e?.stock;
  if (!isMap(st) || !Number.isFinite(st.n) || st.n < 0 || !Number.isFinite(st.per) || st.per <= 0) return null;
  const times = new Set((Array.isArray(e.times) ? e.times : []).filter(x => HHMM.test(x))).size;
  if (!times && e.post !== true) return null;
  const at = Number(st.at) || 0;
  let taken = 0;
  for (const [k, x] of Object.entries(isMap(S?.habitLog) ? S.habitLog : {})) {
    if (x?.s === 'done' && (Number(x._ts) || 0) > at && k.split('|')[1] === id) taken++;
  }
  const left = Math.max(0, Math.round((st.n - taken * st.per) * 1000) / 1000);
  const days = new Set((Array.isArray(e.days) ? e.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6)).size;
  return Math.floor(left / (st.per * (times * (days || 7) / 7 + (e.post === true ? trainingRate(S, today) : 0))));
}

// lib/habits.js trainingRate: workout days per day over the four weeks to `today`, 3 a week before any.
function trainingRate(S, today) {
  const dates = new Set((Array.isArray(S?.workouts) ? S.workouts : []).map(w => w?.d).filter(d => typeof d === 'string'));
  const since = new Date(Date.parse(today + 'T12:00:00Z') - 28 * 86400000).toISOString().slice(0, 10);
  const n = [...dates].filter(d => d > since && d <= today).length;
  return n ? n / 28 : 3 / 7;
}

/**
 * The times owed a push: `{ key, name, dose, left }` (left: daysLeft, or null) for every time of a habit on today's weekday that is
 * between 0 and `windowMin` minutes old on that habit's clock and not ticked or skipped yet.
 * `nowIn(tz)` answers `{ date, hhmm }` for a zone, or null for one it cannot read.
 */
export function habitsDue(S, nowIn, windowMin) {
  const out = [];
  const log = isMap(S?.habitLog) ? S.habitLog : {};
  for (const [id, e] of Object.entries(isMap(S?.habits) ? S.habits : {})) {
    if (!isMap(e) || typeof e.name !== 'string' || !e.name.trim() || !Array.isArray(e.times)) continue;
    const now = nowIn(e.tz || 'UTC');
    if (!now) continue;
    const days = Array.isArray(e.days) ? e.days : [];
    if (days.length && !days.includes(weekdayOf(now.date))) continue;
    for (const time of new Set(e.times)) {
      const late = hhmmToMin(now.hhmm) - hhmmToMin(time);
      if (!(late >= 0 && late <= windowMin)) continue;
      const key = habitKey(now.date, id, time);
      const s = log[key]?.s;
      if (s === 'done' || s === 'skip') continue;
      out.push({ key, name: e.name.trim(), dose: typeof e.dose === 'string' ? e.dose.trim() : '', left: daysLeft(S, id, e, now.date) });
    }
  }
  return out;
}
