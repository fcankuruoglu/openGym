// Back-off sets: every work set one weight step lighter than the one before it — with a 2 kg
// step, a plan of 3 × 6 @ 26 kg trains as 26 → 24 → 22. The step is the exercise's own
// progression step (cfg.inc, "Step" in its settings), so dumbbells drop by the 2 kg the rack
// goes up in and a lever machine by its 5 kg, without a second number to keep in line.
//
// Only the first set's weight is planned and progressed; the others are derived from it every
// time a session is built, so a raise of the top set carries the whole sequence with it
// (26/24/22 → 28/26/24). Whether it is raised is the ordinary policy's call, which already
// reads every planned set: one back-off set short of its reps holds the whole sequence.
//
// A plan can keep more than one top set (cfg.backoffTops, "2 top sets + 1 back-off") and drop
// the back-off sets by a share of the top set instead of one step each (cfg.backoffPct, every
// back-off set at the same lighter weight), with reps of their own (cfg.backoffReps). Without
// them it is the one-step-per-set sequence above, exactly as before.
//
// Imports nothing from history.js or progression.js — both import this module.
import { isWarmupRow, isSideSet, syncSideAggregate } from './workout-model.js'
import { defaultIncrement, isAssisted } from './exercises.js'

const round1 = v => Math.round(v * 10) / 10

export const BACKOFF_PCT_MAX = 50
const whole = (v, lo, hi) => { const n = Math.round(Number(v)) || 0; return n >= lo ? Math.min(hi, n) : 0 }

/** The shape of a back-off plan: `tops` sets at the top weight (at least 1), then the back-off
 *  sets, `pct` lighter than the top set (0: one step per set) at `reps` (0: the plan's reps). */
export function backoffShapeOf(cfg) {
  return {
    tops: whole(cfg?.backoffTops, 1, 9) || 1,
    pct: whole(cfg?.backoffPct, 1, BACKOFF_PCT_MAX),
    reps: whole(cfg?.backoffReps, 1, 100),
  }
}

/** The shape fields as a plan stores them: only those that differ from the default. */
export function backoffShapeFields(cfg) {
  const { tops, pct, reps } = backoffShapeOf(cfg)
  return { ...(tops > 1 ? { backoffTops: tops } : {}), ...(pct ? { backoffPct: pct } : {}), ...(reps ? { backoffReps: reps } : {}) }
}

/** Whether a plan asks for back-off sets. Off unless switched on, so every plan saved before
 *  this field existed builds exactly as it did. A pyramid owns each set already, and a
 *  rest-pause trains one work set, so neither has anything to step down. */
export function isBackoff(cfg) {
  return !!cfg && cfg.backoff === true && (cfg.mode || 'reps') === 'reps'
    && !(Array.isArray(cfg.pyramid) && cfg.pyramid.length)
    && cfg.intensifier?.type !== 'restpause'
}

/**
 * The weight of work set `k` (0 = the top set) below a top set of `top`. The same grid rule a
 * stepper tap uses: a top set on the step's grid lands every back-off set on it, one typed off
 * the grid steps down from where it is. Never below one step — an empty bar is not a set — and
 * never above the top set itself. `shape` (backoffShapeOf): the first `tops` sets stay at the
 * top set, and with a `pct` every set after them is that share lighter, rounded down to the step.
 */
export function backoffAt(top, k, step, shape) {
  const t = Number(top) || 0
  const s = Number(step) || 0
  const tops = shape?.tops || 1
  if (!(t > 0) || !(s > 0) || !(k >= tops)) return t
  const onGrid = Math.abs(t - Math.round(t / s) * s) <= 0.1
  let v
  if (shape?.pct > 0) {
    const raw = t * (1 - shape.pct / 100)
    v = onGrid ? round1(Math.floor(raw / s + 1e-9) * s) : round1(raw)
  } else {
    const raw = t - (k - tops + 1) * s
    v = onGrid ? round1(Math.round(raw / s) * s) : round1(raw)
  }
  return Math.max(Math.min(t, s), Math.min(t, v))
}

/** Work set `b`'s weight after work set `a` was set to `value` by hand: from a top set the
 *  sequence is rebuilt under it, from a back-off set the sets after it follow that one. */
export function backoffAfter(value, a, b, step, shape) {
  const tops = shape?.tops || 1
  if (a < tops) return backoffAt(value, b, step, shape)
  return shape?.pct > 0 ? value : backoffAt(value, b - a, step)
}

/** The step back-off sets use: the exercise's own (cfg.inc), else its default — the same
 *  number progression.js's weightIncrement gives, and 0 where back-off sets do not apply. An
 *  assistance machine is left out: less load is harder there, so "lighter" is the wrong way. */
export function backoffStepOf(cfg, unit) {
  if (!isBackoff(cfg) || isAssisted(cfg)) return 0
  return cfg.inc > 0 ? cfg.inc : defaultIncrement(cfg.id, unit)
}

/** The planned weights for `n` work sets: "26 → 24 → 22". */
export function backoffWeights(top, n, step, shape) {
  return Array.from({ length: Math.max(0, n) }, (_, k) => backoffAt(top, k, step, shape))
}

/**
 * Step the open work rows of a freshly built entry down from its first work row. Warm-ups are
 * left alone (they ramp toward the top set), a logged row is never rewritten, and a per-side
 * row steps both limbs.
 */
export function applyBackoff(rows, step, shape) {
  if (!(step > 0)) return rows
  const first = rows.find(r => !isWarmupRow(r))
  const top = first ? Number(first.w) || 0 : 0
  if (!(top > 0)) return rows
  let k = -1
  return rows.map(row => {
    if (isWarmupRow(row)) return row
    k++
    if (k < (shape?.tops || 1)) return row
    const w = backoffAt(top, k, step, shape)
    // Back-off reps of their own; a per-side row's total splits over both limbs, as makeSideSet does.
    const reps = shape?.reps > 0 ? shape.reps : 0
    if (isSideSet(row)) {
      const side = s => (s.done ? s : { ...s, w, ...(reps ? { r: Math.round(reps / 2) } : {}) })
      return syncSideAggregate({ ...row, sides: { L: side(row.sides.L), R: side(row.sides.R) } })
    }
    return row.done ? row : { ...row, w, ...(reps ? { r: reps } : {}) }
  })
}
