import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { fmtDate, todayISO } from '../lib/format.js'
import { slotsOn, withMark, daysLeft, habitsOf, habitStats, dayShift, BACK_DAYS, HABIT_KEY, HABIT_MAX, LOW_DAYS, POST } from '../lib/habits.js'
import { useUI } from '../store/useUI.js'
import CardHead from './CardHead.jsx'
import { Check, Button } from './ui.jsx'
import Icon from './Icon.jsx'

/* Home: today's daily habits (lib/habits.js), one row per time with a tick, a skip for the open
   ones, the streak once it is two days, a + that opens a new habit, and a line for each habit that
   is running low. ‹ › go back up to BACK_DAYS days, to tick off one that was forgotten; never
   ahead, a tick for a day still to come is not a habit kept. Absent when there are no habits. */
export default function HabitsCard({ S }) {
  const nav = useNavigate()
  const today = todayISO()
  const [back, setBack] = useState(0)
  const iso = dayShift(today, -back)
  // A web push's Taken button opens Home with ?habit=<key> (public/sw.js): ticked here, once, and
  // the address put back, so a reload does not tick it again. Read off the hash, on mount and on
  // every change of it: an app already open on Home is only navigated, not mounted again.
  useEffect(() => {
    const take = () => {
      const key = new URLSearchParams(window.location.hash.split('?')[1] || '').get('habit')
      if (!HABIT_KEY.test(key || '')) return
      const id = key.split('|')[1]
      const name = habitsOf(useStore.getState().S).find(h => h.id === id)?.name
      if (name) {
        useStore.getState().update(s => { s.habitLog = withMark(s.habitLog, key, 'done') })
        useUI.getState().toast(t('{0} ticked off', name))
      }
      nav('/home', { replace: true })
    }
    take()
    window.addEventListener('hashchange', take)
    return () => window.removeEventListener('hashchange', take)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const habits = habitsOf(S)
  if (!habits.length) return null
  const slots = slotsOn(S, iso)
  const mark = (key, m) => useStore.getState().update(s => { s.habitLog = withMark(s.habitLog, key, m) })
  const done = slots.filter(x => x.mark).length
  const dayName = back === 0 ? t('Today') : back === 1 ? t('Yesterday') : fmtDate(iso)
  const low = habits.map(h => ({ h, left: daysLeft(S, h.id) })).filter(x => x.left != null && x.left <= LOW_DAYS)
  const streak = Object.fromEntries(habits.map(h => [h.id, habitStats(S, h.id, today)?.streak || 0]))
  return <div className="card tap-host habits-card">
    <CardHead icon="checkCircle" tint="var(--green)" title={t('Daily habits')} sub={slots.length ? `${done}/${slots.length}` : null}
      open={{ onClick: () => nav('/settings/habits') }}
      action={habits.length < HABIT_MAX && <Button size="sm" icon="plus" aria-label={t('Add a habit')} onClick={() => nav('/settings/habits?new=1')} />} />
    <div className="habit-day" role="group" aria-label={dayName}>
      <Button size="sm" icon="chevronLeft" aria-label={t('Previous day')} disabled={back >= BACK_DAYS} onClick={() => setBack(b => b + 1)} />
      <span className="habit-day-name" aria-live="polite">{dayName}</span>
      <Button size="sm" icon="chevronRight" aria-label={t('Next day')} disabled={back === 0} onClick={() => setBack(b => b - 1)} />
    </div>
    {!slots.length && <p className="habit-none">{t('Nothing planned for this day.')}</p>}
    <div className="habit-list">
      {slots.map(x => <div key={x.key} className={'habit-row' + (x.mark ? ' ' + x.mark : '')}>
        <Check checked={x.mark === 'done'} onChange={v => mark(x.key, v ? 'done' : null)} label={`${x.name} ${x.time}`} />
        <span className="habit-time">{x.time === POST ? t('After workout') : x.time}</span>
        <span className="habit-name">{x.name}{x.dose && <small> · {x.dose}</small>}</span>
        {streak[x.id] >= 2 && <span className="habit-streak" title={t('{0} days in a row', streak[x.id])}><Icon name="flame" />{streak[x.id]}</span>}
        {x.mark === 'skip'
          ? <Button size="sm" onClick={() => mark(x.key, null)}>{t('Skipped')}</Button>
          : !x.mark && <Button size="sm" onClick={() => mark(x.key, 'skip')}>{t('Skip')}</Button>}
      </div>)}
    </div>
    {low.map(({ h, left }) => <p key={h.id} className="habit-low">{t('{0} is running low: {1} days left.', h.name, left)}</p>)}
  </div>
}
