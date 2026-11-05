// habit-copy.js is generated from the frontend's HABIT_PUSH and locale packs (the api image has no
// frontend to read them from at runtime). A string changed on one side only fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { habitPush } from '../push-messages.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('api/habit-copy.js matches the frontend strings (node scripts/build-habit-copy.mjs)', async t => {
  if (!fs.existsSync(path.join(API, '..', 'frontend', 'src', 'lib', 'habits.js'))) return t.skip('no frontend next to the api');
  const { buildHabitCopy } = await import('../scripts/build-habit-copy.mjs');
  assert.equal(fs.readFileSync(path.join(API, 'habit-copy.js'), 'utf8').replace(/\r\n/g, '\n'), await buildHabitCopy(),
    'api/habit-copy.js is out of date: run node scripts/build-habit-copy.mjs in api/');
});

test('a habit push: the dose or that it is time, in the profile language, and a low stock from 7 days', () => {
  const h = { key: '2026-11-05|c|08:00', name: 'Kreatin', dose: '5 g', left: null };
  assert.deepEqual(habitPush('tr', h), {
    title: 'Kreatin', body: '5 g', tag: 'habit-2026-11-05|c|08:00', data: { habit: h.key },
    actions: [{ action: 'done', title: 'Aldım' }, { action: 'snooze', title: '10 dk sonra' }],
  });
  assert.equal(habitPush('tr', { ...h, dose: '' }).body, 'Vakti geldi. İşaretlemek için dokun.');
  assert.equal(habitPush('en', { ...h, left: 7 }).body, '5 g · Running low: 7 days left.');
  assert.equal(habitPush('en', { ...h, left: 8 }).body, '5 g');
  assert.equal(habitPush('xx', { ...h, dose: '' }).body, 'Time for it. Tap to tick it off.');
});
