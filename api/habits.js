// Daily habits — the server half. Hand-copied (not imported) from frontend/src/lib/habits.js, as
// nudge.js is from lib/nudge.js: see there for the shape of S.habits and S.habitLog. Only what the
// push needs: which times are owed now, on each habit's own clock. The tick in server.js adds the
// push subscription and the once-per-time mark in db.json.

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const hhmmToMin = v => (HHMM.test(v || '') ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3)) : NaN);
const weekdayOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay();

export const habitKey = (iso, id, time) => `${iso}|${id}|${time}`;

/**
 * The times owed a push: `{ key, name, dose }` for every time of a habit on today's weekday that is
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
      out.push({ key, name: e.name.trim(), dose: typeof e.dose === 'string' ? e.dose.trim() : '' });
    }
  }
  return out;
}
