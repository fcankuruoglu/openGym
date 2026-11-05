// A slot's tempo and top-set RPE (lib/cues.js): kept only when they make sense, carried in a plan
// file, shown on the plan line, and a top set rated a point or more harder than its target holds
// the weight.
import { describe, it, expect } from 'vitest'
import { cleanTempo, topRpeOf, cueFields, topSetTooHard } from './cues.js'
import { readSession } from './progression.js'
import { buildPlanBundle, parsePlan } from './plan-share.js'
import { setsRepsOf } from './history.js'

describe('tempo and top-set RPE', () => {
  it('keeps four digits or X, and an RPE from 6 to 10 on the half point', () => {
    expect(cleanTempo(' 31x0 ')).toBe('31X0')
    expect(cleanTempo(2101)).toBe('2101')
    expect(cleanTempo('21')).toBe('')
    expect(topRpeOf({ topRpe: 8.4 })).toBe(8.5)
    expect(topRpeOf({ topRpe: 5 })).toBe(0)
    expect(cueFields({ tempo: 'abcd', topRpe: 9 })).toEqual({ topRpe: 9 })
  })
  it('reads a top set rated a point or more harder as too hard, and an unrated one as fine', () => {
    const target = { topRpe: 8 }
    expect(topSetTooHard(target, { rpe: 9 })).toBe(true)
    expect(topSetTooHard(target, { rir: 1 })).toBe(true)
    expect(topSetTooHard(target, { rpe: 8.5 })).toBe(false)
    expect(topSetTooHard(target, { r: 8 })).toBe(false)
    expect(topSetTooHard({}, { rpe: 10 })).toBe(false)
  })
  it('holds the weight when the top set was too hard, even with every rep done', () => {
    const entry = rpe => ({ id: '0025', target: { id: '0025', sets: 2, reps: 5, weight: 60, topRpe: 8 },
      sets: [{ w: 60, r: 5, done: true, rpe }, { w: 60, r: 5, done: true }] })
    expect(readSession(entry(8)).ok).toBe(true)
    expect(readSession(entry(9.5)).ok).toBe(false)
  })
  it('travels in a plan file, and the plan line reads top sets and back-off apart', () => {
    const routine = { id: 'r', name: 'A', ex: [{ id: '0025', sets: 3, reps: 8, tempo: '2101', topRpe: 9, backoff: true, backoffTops: 2, backoffPct: 15, backoffReps: 10 }] }
    const file = buildPlanBundle({ unit: 'kg', routines: [routine], week: {}, customEx: [] }, 'x')
    expect(file.routines[0].ex[0]).toMatchObject({ tempo: '2101', topRpe: 9 })
    const back = parsePlan({ ...file, routines: [{ ...file.routines[0], ex: [{ ...file.routines[0].ex[0], tempo: 'nope', topRpe: 12 }] }] }, 'kg')
    expect(back.routines[0].ex[0].tempo).toBeUndefined()
    expect(back.routines[0].ex[0].topRpe).toBeUndefined()
    expect(setsRepsOf(routine.ex[0])).toBe('2 × 8 + 1 × 10 (−15%)')
    expect(setsRepsOf({ id: '0025', sets: 3, reps: 8 })).toBe('3 × 8')
  })
})
