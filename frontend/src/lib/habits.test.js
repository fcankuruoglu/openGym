// Daily habits (lib/habits.js): reading, the day's times, ticks, the stock and the phone's
// notifications; how two devices merge them; and that the server's copy (api/habits.js) owes a
// push for the same times the app shows as open.
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/habits.js'
import * as Stamps from '../../../api/sync-stamps.js'
import {
  readHabit, habitsOf, withHabit, habitKey, slotsOn, withMark, stockLeft, daysLeft, habitNotifications, TIMES_MAX,
  toggleTime, toggleDay, HABIT_TEMPLATES, habitStats, habitBody, HABIT_KEY,
} from './habits.js'
import { mergeStates, STAMPED_MAPS } from './sync-merge.js'
import { todayISO } from './format.js'

// 2026-11-02 is a Monday.
const MON = '2026-11-02', TUE = '2026-11-03'
const creatine = { name: 'Creatine', times: ['08:00'], dose: '5 g', stock: { n: 60, at: 100, per: 1 }, tz: 'UTC', _ts: 1 }
const fishOil = { name: 'Fish oil', times: ['21:00', '07:30'], days: [1, 3, 5], tz: 'UTC', _ts: 1 }
const S = (over = {}) => ({
  unit: 'kg', week: {}, dayPlan: {}, workouts: [], routines: [], bodyweight: [], customEx: [], favEx: [],
  exWeights: {}, exNotes: {}, barWeights: {}, equipProfiles: [], gymCards: [], _ts: 0,
  habits: { c: creatine, f: fishOil }, habitLog: {}, ...over,
})

describe('habits: reading', () => {
  it('keeps the valid times sorted and once, drops junk, reads a removed one as none', () => {
    expect(readHabit({ name: ' Water ', times: ['12:00', '08:00', '12:00', '25:00', 'x'] })).toMatchObject({ name: 'Water', times: ['08:00', '12:00'], days: [] })
    expect(readHabit({ name: 'x', times: Array.from({ length: 9 }, (_, i) => `0${i}:00`) }).times).toHaveLength(TIMES_MAX)
    expect(readHabit({ name: 'x', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6] }).days).toEqual([])
    expect(readHabit({ name: 'x', times: ['08:00'], stock: { n: 10, per: 0 } }).stock).toBeNull()
    for (const junk of [null, { _ts: 5 }, { name: '', times: ['08:00'] }, { name: 'x', times: [] }, 'x']) expect(readHabit(junk)).toBeNull()
  })
  it('lists by first time, and a removal is a stamped empty entry', () => {
    expect(habitsOf(S()).map(h => h.id)).toEqual(['f', 'c'])
    const m = withHabit(S().habits, 'c', null, 50)
    expect(m.c).toEqual({ _ts: 50 })
    expect(habitsOf({ habits: m }).map(h => h.id)).toEqual(['f'])
  })
})

describe('habits: the day', () => {
  it('shows each time of the habits due that weekday, earliest first, with its mark', () => {
    const s = S({ habitLog: { [habitKey(MON, 'f', '07:30')]: { s: 'done', _ts: 2 }, [habitKey(MON, 'c', '08:00')]: { s: 'skip', _ts: 2 } } })
    expect(slotsOn(s, MON).map(x => [x.id, x.time, x.mark])).toEqual([['f', '07:30', 'done'], ['c', '08:00', 'skip'], ['f', '21:00', null]])
    expect(slotsOn(s, TUE).map(x => x.id)).toEqual(['c'])
  })
  it('a mark taken back is a stamped empty entry and reads as open', () => {
    const k = habitKey(MON, 'c', '08:00')
    const log = withMark(withMark({}, k, 'done', 5), k, null, 6)
    expect(log[k]).toEqual({ _ts: 6 })
    expect(slotsOn(S({ habitLog: log }), MON).find(x => x.id === 'c').mark).toBeNull()
  })
})

describe('habits: stock', () => {
  it('is the count typed in less one dose per tick after it, never below 0', () => {
    const log = {
      [habitKey(MON, 'c', '08:00')]: { s: 'done', _ts: 200 },
      [habitKey(TUE, 'c', '08:00')]: { s: 'done', _ts: 300 },
      [habitKey('2026-10-01', 'c', '08:00')]: { s: 'done', _ts: 50 },   // before the count: in it already
      [habitKey('2026-11-04', 'c', '08:00')]: { s: 'skip', _ts: 400 },
    }
    expect(stockLeft(S({ habitLog: log }), 'c')).toBe(58)
    expect(stockLeft(S(), 'f')).toBeNull()
    expect(stockLeft(S({ habits: { c: { ...creatine, stock: { n: 1, at: 0, per: 1 } } }, habitLog: log }), 'c')).toBe(0)
  })
  it('two devices each ticking a day lose neither tick in the merge', () => {
    const a = { ...S(), _ts: 10, habitLog: withMark({}, habitKey(MON, 'c', '08:00'), 'done', 200) }
    const b = { ...S(), _ts: 20, habitLog: withMark({}, habitKey(TUE, 'c', '08:00'), 'done', 300) }
    expect(stockLeft(mergeStates(a, b), 'c')).toBe(58)
  })
  it('counts the days left at the plan: 3 days a week, 2 a day', () => {
    const s = S({ habits: { f: { ...fishOil, stock: { n: 12, at: 0, per: 1 } } } })
    expect(daysLeft(s, 'f')).toBe(14)
    expect(daysLeft(s, 'c')).toBeNull()
  })
})

describe('habits: notifications on the phone', () => {
  it('plans the next open times only, soonest first, at most `max`', () => {
    const now = new Date(2026, 10, 2, 7, 45)   // Monday 07:45 local
    const log = { [habitKey(MON, 'c', '08:00')]: { s: 'done', _ts: 2 } }
    const n = habitNotifications(S({ habitLog: log }), { now, max: 3 })
    expect(n.map(x => [x.title, x.schedule.at.getDate(), x.schedule.at.getHours()])).toEqual([['Fish oil', 2, 21], ['Creatine', 3, 8], ['Fish oil', 4, 7]])
    expect(n.map(x => x.id)).toEqual([3000, 3001, 3002])
    expect(n[0].body).toBe('Time for it. Tap to tick it off.')
    expect(n[1].body).toBe('5 g')
  })
})

describe('habits: sync', () => {
  it('both maps are stamped maps on both sides of the sync', () => {
    for (const f of ['habits', 'habitLog']) {
      expect(STAMPED_MAPS).toContain(f)
      expect(Stamps.STAMPED_MAPS).toContain(f)
    }
  })
})

describe('habits: the server copy', () => {
  const nowIn = when => tz => (tz === 'Bad/Zone' ? null : when)
  it('owes a push for an open time up to the window, on its weekday, once ticked no more', () => {
    const due = Server.habitsDue(S(), nowIn({ date: MON, hhmm: '08:10' }), 15)
    expect(due).toEqual([{ key: habitKey(MON, 'c', '08:00'), name: 'Creatine', dose: '5 g', left: 60 }])
    expect(Server.habitsDue(S(), nowIn({ date: MON, hhmm: '08:16' }), 15)).toEqual([])
    expect(Server.habitsDue(S(), nowIn({ date: TUE, hhmm: '21:00' }), 15)).toEqual([])   // fish oil: not on Tuesday
    const ticked = S({ habitLog: withMark({}, habitKey(MON, 'c', '08:00'), 'skip', 2) })
    expect(Server.habitsDue(ticked, nowIn({ date: MON, hhmm: '08:00' }), 15)).toEqual([])
  })
  it('agrees with the app on which times are open', () => {
    const s = S({ habitLog: withMark({}, habitKey(MON, 'f', '07:30'), 'done', 2) })
    const open = slotsOn(s, MON).filter(x => !x.mark).map(x => x.key)
    for (const x of slotsOn(s, MON)) {
      const due = Server.habitsDue(s, nowIn({ date: MON, hhmm: x.time }), 0).map(d => d.key)
      expect(due.includes(x.key)).toBe(open.includes(x.key))
    }
  })
  it('skips a removed habit and a zone it cannot read', () => {
    expect(Server.habitsDue({ habits: { c: { _ts: 3 } } }, nowIn({ date: MON, hhmm: '08:00' }), 15)).toEqual([])
    expect(Server.habitsDue({ habits: { c: { ...creatine, tz: 'Bad/Zone' } } }, nowIn({ date: MON, hhmm: '08:00' }), 15)).toEqual([])
  })
})

describe('habits: the editor helpers', () => {
  it('a time preset goes in sorted and comes out again, but the last time stays', () => {
    expect(toggleTime(['12:00'], '08:00')).toEqual(['08:00', '12:00'])
    expect(toggleTime(['08:00', '12:00'], '08:00')).toEqual(['12:00'])
    expect(toggleTime(['08:00'], '08:00')).toEqual(['08:00'])
    expect(toggleTime(['01:00', '02:00', '03:00', '04:00', '05:00', '06:00'], '07:00')).toHaveLength(TIMES_MAX)
  })
  it('a day off from every day leaves the other six; all seven is every day again, the last one stays', () => {
    expect(toggleDay([], 0)).toEqual([1, 2, 3, 4, 5, 6])
    expect(toggleDay([1, 2, 3, 4, 5, 6], 0)).toEqual([])
    expect(toggleDay([1, 3], 5)).toEqual([1, 3, 5])
    expect(toggleDay([1], 1)).toEqual([1])
  })
  it('every template reads as a valid habit', () => {
    for (const tpl of HABIT_TEMPLATES) expect(readHabit(tpl), tpl.name).not.toBeNull()
  })
})

describe('habits: streak and rate', () => {
  // Creatine every day from Monday 2 November; today is Thursday 5 November.
  const THU = '2026-11-05'
  const days = ['2026-11-02', '2026-11-03', '2026-11-04']
  const log = marks => Object.fromEntries(days.map((d, i) => [habitKey(d, 'c', '08:00'), { s: marks[i], _ts: 1 }]).filter(([, e]) => e.s))
  const st = (marks, over = {}) => habitStats(S({ habits: { c: { ...creatine, from: '2026-11-02', ...over } }, habitLog: log(marks) }), 'c', THU)
  it('counts the days in a row, a skip keeps it, a gap ends it, today open does not', () => {
    expect(st(['done', 'done', 'done']).streak).toBe(3)
    expect(st(['done', 'skip', 'done']).streak).toBe(3)
    expect(st(['done', null, 'done']).streak).toBe(1)
    expect(st([null, null, null]).streak).toBe(0)
  })
  it('today counts once it is ticked', () => {
    const s = S({ habits: { c: { ...creatine, from: '2026-11-02' } }, habitLog: { ...log(['done', 'done', 'done']), [habitKey(THU, 'c', '08:00')]: { s: 'done', _ts: 1 } } })
    expect(habitStats(s, 'c', THU).streak).toBe(4)
  })
  it('rates the ticks over the due times since it started, skips as not taken', () => {
    expect(st(['done', 'skip', 'done']).rate).toBeCloseTo(2 / 3)
    expect(st(['done', 'done', 'done'], { from: THU }).rate).toBeNull()
  })
  it('a day it is not planned is stepped over, not a gap', () => {
    // Monday, Wednesday, Friday only: Tuesday off.
    expect(st(['done', null, 'done'], { days: [1, 3, 5] }).streak).toBe(2)
  })
  it('a new habit starts today, an edited one keeps its day', () => {
    const m = withHabit({}, 'x', { name: 'Water', times: ['09:00'] }, 1, '2026-11-05')
    expect(m.x.from).toBe('2026-11-05')
    expect(withHabit(m, 'x', { name: 'Water', times: ['10:00'] }, 2, '2026-11-09').x.from).toBe('2026-11-05')
  })
})

describe('habits: running low', () => {
  it('the reminder says so from 7 days, on the phone as on the server', () => {
    expect(habitBody('5 g', 7)).toBe('5 g · Running low: 7 days left.')
    expect(habitBody('', 8)).toBe('Time for it. Tap to tick it off.')
    expect(habitBody('5 g', null)).toBe('5 g')
    const s = S({ habits: { c: { ...creatine, stock: { n: 6, at: 0, per: 1 } } } })
    const n = habitNotifications(s, { now: new Date(2026, 10, 2, 7, 0), max: 2 })
    expect(n.map(x => x.body)).toEqual(['5 g · Running low: 6 days left.', '5 g · Running low: 5 days left.'])
    const due = Server.habitsDue(s, () => ({ date: '2026-11-02', hhmm: '08:00' }), 15)
    expect(due.find(d => d.name === 'Creatine').left).toBe(daysLeft(s, 'c'))
  })
})

describe('habits: after a workout', () => {
  const shake = { name: 'Protein shake', times: [], post: true, dose: '30 g', from: '2026-11-02', _ts: 1 }
  const end = new Date(2026, 10, 3, 18, 0).getTime()   // Tuesday 18:00 local
  const s = (over = {}) => S({ habits: { p: shake }, workouts: [{ id: 'w1', d: TUE, end }], ...over })
  it('a habit with only the after-workout time reads, and shows only on a day with a workout', () => {
    expect(readHabit(shake)).toMatchObject({ times: [], post: true })
    expect(slotsOn(s(), TUE).map(x => x.time)).toEqual(['post'])
    expect(slotsOn(s(), MON)).toEqual([])
    expect(HABIT_KEY.test(habitKey(TUE, 'p', 'post'))).toBe(true)
  })
  it('the phone reminds half an hour after the workout ended, and not once it is ticked', () => {
    const n = habitNotifications(s(), { now: new Date(2026, 10, 3, 18, 5) })
    expect(n.map(x => [x.title, x.schedule.at.getHours(), x.schedule.at.getMinutes()])).toEqual([['Protein shake', 18, 30]])
    expect(n[0].extra).toEqual({ habit: habitKey(TUE, 'p', 'post') })
    const ticked = s({ habitLog: withMark({}, habitKey(TUE, 'p', 'post'), 'done', 2) })
    expect(habitNotifications(ticked, { now: new Date(2026, 10, 3, 18, 5) })).toEqual([])
  })
  it('the streak counts workout days only, the server never pushes it', () => {
    const log = withMark({}, habitKey(TUE, 'p', 'post'), 'done', 2)
    expect(habitStats(s({ habitLog: log }), 'p', '2026-11-05').streak).toBe(1)
    expect(Server.habitsDue(s(), () => ({ date: TUE, hhmm: '18:30' }), 15)).toEqual([])
  })
  it('the stock lasts by how often you train, the same on the server', () => {
    const st = s({ habits: { p: { ...shake, stock: { n: 12, at: 0, per: 1 } } } })
    // One workout in the four weeks to today: 1/28 of a dose a day.
    const left = daysLeft(st, 'p')
    expect(left).toBeGreaterThan(12)
    expect(Server.daysLeft(st, 'p', st.habits.p, todayISO())).toBe(left)
  })
  it('the editor can take the last clock time out when after-workout is on', () => {
    expect(toggleTime(['08:00'], '08:00', false)).toEqual([])
  })
})

