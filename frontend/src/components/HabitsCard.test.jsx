// @vitest-environment happy-dom
// Home's daily-habits card: today's times, and ‹ › back to a forgotten day (never ahead), whose tick
// lands on that day's own key.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { todayISO } from '../lib/format.js'
import { dayShift, habitKey, BACK_DAYS } from '../lib/habits.js'
import HabitsCard from './HabitsCard.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

let host, root, unsub = () => {}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { unsub(); act(() => root.unmount()); host.remove() })

const today = todayISO()
const yesterday = dayShift(today, -1)
const render = habits => {
  useStore.setState(s => ({ S: { ...s.S, habits, habitLog: {}, workouts: [] } }))
  const draw = () => act(() => root.render(<HabitsCard S={useStore.getState().S} />))
  draw()
  unsub()
  unsub = useStore.subscribe(draw)
}
const button = label => host.querySelector(`button[aria-label="${label}"]`)
const day = () => host.querySelector('.habit-day-name').textContent

describe('the habits card on Home', () => {
  it('ticks yesterday on its own key, and goes back no further than BACK_DAYS, never ahead', () => {
    render({ c: { name: 'Creatine', times: ['08:00'], _ts: 1 } })
    expect(day()).toBe('Today')
    expect(button('Next day').disabled).toBe(true)
    act(() => button('Previous day').click())
    expect(day()).toBe('Yesterday')
    act(() => host.querySelector('.habit-row .chk').click())
    expect(useStore.getState().S.habitLog[habitKey(yesterday, 'c', '08:00')]?.s).toBe('done')
    expect(useStore.getState().S.habitLog[habitKey(today, 'c', '08:00')]).toBeUndefined()
    for (let i = 1; i < BACK_DAYS; i++) act(() => button('Previous day').click())
    expect(button('Previous day').disabled).toBe(true)
  })
  it('shows on a day with nothing planned, so an earlier day can still be ticked; not at all without habits', () => {
    const notToday = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== new Date(today + 'T12:00:00Z').getUTCDay())
    render({ c: { name: 'Creatine', times: ['08:00'], days: [notToday[0]], _ts: 1 } })
    expect(host.querySelector('.habit-none').textContent).toBe('Nothing planned for this day.')
    act(() => root.render(null))
    render({})
    expect(host.querySelector('.habits-card')).toBeNull()
  })
})
