// Settings → Reminders → Daily habits: supplements, water, a stretch. The list, and the editor for
// one habit (its name, dose, times, days and stock). What is stored and how the stock is counted:
// lib/habits.js. The ticks themselves are on Home (components/HabitsCard.jsx).
import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Section, Row, Switch, Button, NumberField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { confirmSheet } from '../sheets.jsx'
import { DAYN, uid, weekOrder, weekStartOf } from '../lib/format.js'
import { MOBILE, syncReminder } from '../lib/mobile.js'
import {
  habitsOf, withHabit, stockLeft, daysLeft, toggleTime, toggleDay, sameDays,
  HABIT_MAX, TIMES_MAX, NAME_MAX, DOSE_MAX, HABIT_TEMPLATES, TIME_PRESETS, DAY_PRESETS,
} from '../lib/habits.js'

const update = fn => useStore.getState().update(fn)

export const timesLine = h => h.times.join(' · ')
export const daysLine = (h, ws) => (h.days.length ? weekOrder(ws).filter(d => h.days.includes(d)).map(d => t(DAYN[d]).slice(0, 2)).join(' ') : t('Every day'))

export default function HabitsPage() {
  const S = useStore(s => s.S)
  const [editing, setEditing] = useState(null)   // a habit's id, or 'new'
  const habits = habitsOf(S)
  if (editing) return <HabitEditor S={S} id={editing} close={() => setEditing(null)} />
  return <>
    <Section footer={MOBILE ? t('The phone reminds you at each time until you tick it off on Home.') : t('A push at each time until you tick it off on Home. Turn on push notifications under Reminders first.')}>
      {habits.map(h => {
        const left = daysLeft(S, h.id)
        return <Row key={h.id} icon="checkCircle" iconTint="var(--green)" title={h.name}
          subtitle={[h.dose, timesLine(h), daysLine(h, weekStartOf(S)), left != null ? t('Days left: {0}', left) : ''].filter(Boolean).join(' · ')}
          accessory="chevron" onClick={() => setEditing(h.id)} />
      })}
      {habits.length < HABIT_MAX && <Row icon="plusCircle" iconTint="var(--green)" title={t('Add a habit')} onClick={() => setEditing('new')} />}
    </Section>
  </>
}

function HabitEditor({ S, id, close }) {
  const toast = useUI(s => s.toast)
  const old = habitsOf(S).find(h => h.id === id)
  const oldLeft = old ? stockLeft(S, id) : null
  const [d, setD] = useState(() => ({
    name: old?.name || '', dose: old?.dose || '', times: old?.times || ['08:00'], days: old?.days || [],
    counted: !!old?.stock, n: oldLeft ?? 30, per: old?.stock?.per ?? 1,
  }))
  const set = patch => setD(x => ({ ...x, ...patch }))
  const setTime = (i, v) => set({ times: d.times.map((x, j) => (j === i ? v : x)) })

  const save = async () => {
    // The count typed in starts a new count; left alone, the old one keeps counting.
    const same = old?.stock && d.n === oldLeft && d.per === old.stock.per
    const stock = d.counted && d.per > 0 ? (same ? old.stock : { n: d.n, at: Date.now(), per: d.per }) : null
    const habit = { name: d.name, dose: d.dose, times: d.times, days: d.days, stock }
    const key = old ? id : uid()
    update(s => { s.habits = withHabit(s.habits, key, habit) })
    // The phone asks for permission here, once, rather than from a background resync.
    if (MOBILE && !(await syncReminder(useStore.getState().S, true))) toast(t('Could not change notification settings'))
    close()
  }
  const remove = () => confirmSheet({
    title: t('Remove this habit?'),
    message: t('Its reminders stop. The days you ticked off stay in your data.'),
    confirmText: t('Remove'), danger: true,
    onConfirm: () => { update(s => { s.habits = withHabit(s.habits, id, null) }); close() },
  })
  const valid = d.name.trim() && d.times.length > 0
  // A quick start fills the form in this language; everything stays editable after.
  const pick = tpl => set({ name: t(tpl.name), dose: t(tpl.dose), times: tpl.times })
  const picked = tpl => d.name === t(tpl.name)

  return <>
    {!old && <Section title={t('Quick start')} footer={t('Pick one to fill in the form, then change what you like.')}>
      <div className="chips wrap habit-chips">
        {HABIT_TEMPLATES.map(tpl => <button key={tpl.name} type="button" className={'chip' + (picked(tpl) ? ' on' : '')}
          aria-pressed={picked(tpl)} onClick={() => pick(tpl)}>{t(tpl.name)}</button>)}
      </div>
    </Section>}
    <Section>
      <label className="lrow gym-in-row">
        <span className="lrow-i" style={{ '--tint': 'var(--orange)' }}><Icon name="pencil" /></span>
        <span className="lrow-m"><span className="lrow-t">{t('Name')}</span></span>
        <input className="lrow-in" value={d.name} maxLength={NAME_MAX} placeholder={t('Creatine')} aria-label={t('Name')}
          enterKeyHint="done" autoComplete="off" onChange={e => set({ name: e.target.value })} />
      </label>
      <label className="lrow gym-in-row">
        <span className="lrow-i" style={{ '--tint': 'var(--teal)' }}><Icon name="note" /></span>
        <span className="lrow-m"><span className="lrow-t">{t('Dose')}</span></span>
        <input className="lrow-in" value={d.dose} maxLength={DOSE_MAX} placeholder={t('5 g')} aria-label={t('Dose')}
          enterKeyHint="done" autoComplete="off" onChange={e => set({ dose: e.target.value })} />
      </label>
    </Section>
    <Section title={t('Times')}>
      <div className="chips wrap habit-chips">
        {TIME_PRESETS.map(p => <button key={p.time} type="button" className={'chip' + (d.times.includes(p.time) ? ' on' : '')}
          aria-pressed={d.times.includes(p.time)} onClick={() => set({ times: toggleTime(d.times, p.time) })}>{t(p.label)} <span className="dim">{p.time}</span></button>)}
      </div>
      {d.times.map((time, i) => <Row key={i} icon="clock" iconTint="var(--purple)" title={t('At')}>
        <input type="time" className="timef" value={time} aria-label={t('At')} onChange={e => e.target.value && setTime(i, e.target.value)} />
        {d.times.length > 1 && <Button size="sm" icon="xmark" aria-label={t('Remove')} onClick={() => set({ times: d.times.filter((_, j) => j !== i) })} />}
      </Row>)}
      {d.times.length < TIMES_MAX && <Row icon="plusCircle" iconTint="var(--purple)" title={t('Add a time')} onClick={() => set({ times: [...d.times, '12:00'] })} />}
    </Section>
    <Section title={t('Days')}>
      <div className="chips wrap habit-chips">
        {DAY_PRESETS.map(p => <button key={p.label} type="button" className={'chip' + (sameDays(d.days, p.days) ? ' on' : '')}
          aria-pressed={sameDays(d.days, p.days)} onClick={() => set({ days: p.days })}>{t(p.label)}</button>)}
      </div>
      <div className="habit-days" role="group" aria-label={t('Days')}>
        {weekOrder(weekStartOf(S)).map(x => {
          const on = !d.days.length || d.days.includes(x)
          return <button key={x} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} aria-label={t(DAYN[x])}
            onClick={() => set({ days: toggleDay(d.days, x) })}>{t(DAYN[x]).slice(0, 2)}</button>
        })}
      </div>
    </Section>
    <Section title={t('Stock')} footer={d.counted ? t('Each tick takes one dose off. Bought more? Type in what you have now.') : null}>
      <Row icon="clipboard" iconTint="var(--blue)" title={t('Count what I have left')}>
        <Switch checked={d.counted} onChange={v => set({ counted: v })} aria-label={t('Count what I have left')} />
      </Row>
      {d.counted && <>
        <Row icon="list" iconTint="var(--blue)" title={t('In stock')}><NumberField value={d.n} onChange={n => set({ n })} aria-label={t('In stock')} /></Row>
        <Row icon="minus" iconTint="var(--blue)" title={t('Per dose')}><NumberField value={d.per} onChange={per => set({ per })} aria-label={t('Per dose')} /></Row>
      </>}
    </Section>
    <div className="gym-actions">
      <Button variant="primary" onClick={save} disabled={!valid}>{t('Save')}</Button>
      <Button onClick={close}>{t('Cancel')}</Button>
    </div>
    {old && <Section>
      <Row className="gym-remove" danger title={t('Remove')} onClick={remove} />
    </Section>}
  </>
}
