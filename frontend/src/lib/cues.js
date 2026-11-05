// Two cues a routine slot can carry beside its sets and reps (both optional, written only when set):
//
//   cfg.tempo    how each rep is lifted, the four digits a coach writes: "2101" is 2 s down, 1 s
//                at the bottom, 0 s up (as fast as you can), 1 s at the top; X is explosive.
//   cfg.topRpe   how hard the first work set should feel, on the RPE scale (6 to 10). A logged top
//                set rated harder than that by a point or more is not the session done: the
//                weight holds (progression.js readSession). An unrated set says nothing.
//
// Imports nothing from history.js or progression.js, both of which import this module.
import { isFailureSet } from './workout-model.js'

export const TOP_RPE_MIN = 6
export const TOP_RPE_MAX = 10

/** A tempo as stored: four characters of digits or X, else ''. */
export function cleanTempo(v) {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : typeof v === 'number' ? String(v) : ''
  return /^[0-9X]{4}$/.test(s) ? s : ''
}

/** The slot's top-set RPE on the half-point grid, or 0 when it has none. */
export function topRpeOf(cfg) {
  const n = Math.round(Number(cfg?.topRpe) * 2) / 2
  return n >= TOP_RPE_MIN && n <= TOP_RPE_MAX ? n : 0
}

/** The cue fields as a plan stores them: only those that are set. */
export function cueFields(cfg) {
  const tempo = cleanTempo(cfg?.tempo), rpe = topRpeOf(cfg)
  return { ...(tempo ? { tempo } : {}), ...(rpe ? { topRpe: rpe } : {}) }
}

/** Whether a logged top set was rated a point or more harder than the target it was given. */
export function topSetTooHard(target, set) {
  const goal = topRpeOf(target)
  if (!goal || !set) return false
  const rir = set.rir != null ? set.rir : set.rpe != null ? 10 - set.rpe : isFailureSet(set) ? 0 : null
  return rir != null && 10 - rir >= goal + 1
}
