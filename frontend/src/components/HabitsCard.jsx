import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { slotsOn, withMark, daysLeft, habitsOf, LOW_DAYS } from '../lib/habits.js'
import CardHead from './CardHead.jsx'
import { Check, Button } from './ui.jsx'

/* Home: today's daily habits (lib/habits.js), one row per time with a tick, a skip for the open
   ones, and a line for each habit that is running low. Absent when there are no habits. */
export default function HabitsCard({ S }) {
  const nav = useNavigate()
  const iso = todayISO()
  const slots = slotsOn(S, iso)
  if (!slots.length) return null
  const mark = (key, m) => useStore.getState().update(s => { s.habitLog = withMark(s.habitLog, key, m) })
  const done = slots.filter(x => x.mark).length
  const low = habitsOf(S).map(h => ({ h, left: daysLeft(S, h.id) })).filter(x => x.left != null && x.left <= LOW_DAYS)
  return <div className="card habits-card">
    <CardHead icon="checkCircle" tint="var(--green)" title={t('Daily habits')} sub={`${done}/${slots.length}`}
      open={{ onClick: () => nav('/settings/habits') }} />
    <div className="habit-list">
      {slots.map(x => <div key={x.key} className={'habit-row' + (x.mark ? ' ' + x.mark : '')}>
        <Check checked={x.mark === 'done'} onChange={v => mark(x.key, v ? 'done' : null)} label={`${x.name} ${x.time}`} />
        <span className="habit-time">{x.time}</span>
        <span className="habit-name">{x.name}{x.dose && <small> · {x.dose}</small>}</span>
        {x.mark === 'skip'
          ? <Button size="sm" onClick={() => mark(x.key, null)}>{t('Skipped')}</Button>
          : !x.mark && <Button size="sm" onClick={() => mark(x.key, 'skip')}>{t('Skip')}</Button>}
      </div>)}
    </div>
    {low.map(({ h, left }) => <p key={h.id} className="habit-low">{t('{0} is running low: {1} days left.', h.name, left)}</p>)}
  </div>
}
