import { NUDGE_COPY } from './nudge-copy.js';
import { HABIT_COPY } from './habit-copy.js';
import { lineIndex } from './nudge.js';

const COPY = {
  en: {
    restTitle: 'Rest over 💪',
    restBody: 'Time for your next set.',
    testBody: 'Test notification ✅ This is what alerts look like.',
    dayFallbackTitle: 'Workout planned today',
    dayRoutineSuffix: 'today',
    dayBody: "It's on your plan. Let's go 💪",
  },
  'pt-BR': {
    restTitle: 'Descanso terminado 💪',
    restBody: 'Hora da próxima série.',
    testBody: 'Notificação de teste ✅ É assim que os alertas aparecem.',
    dayFallbackTitle: 'Treino planejado para hoje',
    dayRoutineSuffix: 'hoje',
    dayBody: 'Está no seu plano. Bora treinar 💪',
  },
};

const copyFor = lang => COPY[lang] || COPY.en;

// A routine's `emoji` field held a literal emoji until the glyph redesign; since then it holds
// an icon key ('dumbbell', 'figureRun') that the app renders as an SVG. A push notification has
// no SVG to render, so an unmapped key reaches the phone as its own name — "dumbbell Push
// today". Keys are ASCII and emoji are not, so anything ASCII is looked up here (falling back
// rather than printing a word), and anything else is already an emoji and passes through.
// Mirrors frontend/src/lib/glyphs.js: GLYPHS is the full set the picker offers.
const DEFAULT_EMOJI = '🏋️';
const GLYPH_EMOJI = {
  figureStrength: '🏋️', arm: '💪', abs: '💥', legs: '🦵', pullup: '🧗',
  dumbbell: '🏋️', barbell: '🏋️', kettlebell: '🏋️', plate: '🏋️', machine: '🏋️',
  figureRun: '🏃', bike: '🚴', swim: '🏊', boxing: '🥊', timer: '⏱️',
  stretch: '🤸', moon: '🌙', heart: '❤️', flame: '🔥', bolt: '⚡',
};

export function routineEmoji(value) {
  if (!value) return DEFAULT_EMOJI;
  if (!/^[A-Za-z]+$/.test(value)) return value;
  return GLYPH_EMOJI[value] || DEFAULT_EMOJI;
}

export function restTimerPush(lang) {
  const copy = copyFor(lang);
  return { title: copy.restTitle, body: copy.restBody, tag: 'rest-timer' };
}

export function testPush(lang) {
  return { title: 'openGym', body: copyFor(lang).testBody, tag: 'test' };
}

// A daily habit's time (habits.js): its own name, its dose or a line saying it is time, and how
// many days the stock lasts once that is a week or less (frontend lib/habits.js habitBody, LOW_DAYS).
// Translated through habit-copy.js, generated from the frontend packs; de-CH as for the nudge. One
// tag per time, so two habits due together both stay in the tray.
const HABIT_LOW_DAYS = 7;
export function habitPush(lang, habit) {
  const pick = HABIT_COPY[lang === 'de-CH' ? 'de' : lang] || HABIT_COPY.en;
  const ch = s => (lang === 'de-CH' ? s.replace(/ß/g, 'ss') : s);
  const base = habit.dose || ch(pick.body);
  const low = habit.left != null && habit.left <= HABIT_LOW_DAYS ? ' · ' + ch(pick.low).replace('{0}', String(habit.left)) : '';
  return {
    title: habit.name, body: base + low, tag: 'habit-' + habit.key,
    data: { habit: habit.key },
    actions: [{ action: 'done', title: ch(pick.done) }, { action: 'snooze', title: ch(pick.snooze) }],
  };
}

export function dayReminderPush(lang, routine) {
  const copy = copyFor(lang);
  return {
    title: routine
      ? `${routineEmoji(routine.emoji)} ${routine.name} ${copy.dayRoutineSuffix}`
      : copy.dayFallbackTitle,
    body: copy.dayBody,
    tag: 'day-reminder',
  };
}

// The missed-workout nudge (nudge.js). Its copy is translated in the frontend packs and generated
// into nudge-copy.js, so every language the app speaks has it — unlike the strings above, which
// predate that and fall back to English. de-CH is de with ß written ss, as in the frontend
// (lib/i18n-core.js DERIVED_LOCALES).
const nudgeCopyFor = lang => {
  if (lang === 'de-CH') {
    const ch = s => s.replace(/ß/g, 'ss');
    return Object.fromEntries(Object.entries(NUDGE_COPY.de).map(([k, c]) => [k, { title: ch(c.title), lines: c.lines.map(ch) }]));
  }
  return NUDGE_COPY[lang] || NUDGE_COPY.en;
};
export function nudgePush(lang, tone, routine, iso) {
  const copy = nudgeCopyFor(lang)[NUDGE_COPY.en[tone] ? tone : 'friendly'];
  const line = copy.lines[lineIndex(iso, copy.lines.length)];
  const name = routine?.name || 'openGym';
  return { title: copy.title, body: line.replace('{0}', () => name), tag: 'nudge' };
}
