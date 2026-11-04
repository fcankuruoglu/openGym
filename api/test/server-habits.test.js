/* Daily habits (habits.js): the tick sends one push per open time of a habit, on the habit's own
   clock, records it in db.json so it never goes out twice, and sends nothing for a time already
   ticked. Real server.js in a child, with the reminder switched off: habits do not ride on it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const USERS = [{ id: 'u_test_1', name: 'One', created: new Date().toISOString() }];
// localhost resolves to a loopback address, which PUSH_AGENT refuses: the send fails quietly.
const subs = [{ userId: 'u_test_1', endpoint: 'https://localhost/x', keys: { p256dh: 'p', auth: 'a' }, created: new Date().toISOString() }];

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-habits-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users: USERS, creds: [], subs, invites: [] }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', REMINDER_TICK_MS: '100' }
  });
  const h = { dataDir, child, log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  await boundPort(child, () => h.log);
  return h;
}

// Now, a few minutes ago, on the UTC clock the way server.js userNow() reads it.
const utc = (ago = 0) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(Date.now() - ago * 60000));
  const g = type => parts.find(p => p.type === type)?.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${g('hour')}:${g('minute')}` };
};
const wait = ms => new Promise(r => setTimeout(r, ms));

test('a habit time is pushed once; a ticked one is not pushed at all', async t => {
  const h = await startServer(t);
  const at = utc(2);
  if (at.date !== utc().date) return t.skip('midnight UTC: the time would be yesterday');
  const habits = {
    c: { name: 'Creatine', times: [at.hhmm], dose: '5 g', tz: 'UTC', _ts: 1 },
    w: { name: 'Water', times: [at.hhmm], tz: 'UTC', _ts: 1 },
  };
  const habitLog = { [`${at.date}|w|${at.hhmm}`]: { s: 'done', _ts: 2 } };
  fs.writeFileSync(path.join(h.dataDir, 'state-u_test_1.json'), JSON.stringify({ reminder: { on: false }, habits, habitLog }));

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !/habit firing/.test(h.log)) await wait(100);
  await wait(800);   // several more ticks: none of them may send it again

  const key = `${at.date}|c|${at.hhmm}`;
  assert.equal((h.log.match(/habit firing/g) || []).length, 1, h.log);
  assert.match(h.log, new RegExp(`habit firing u_test_1 ${key.replace(/\|/g, '\\|')}`), h.log);
  const db = JSON.parse(fs.readFileSync(path.join(h.dataDir, 'db.json'), 'utf8'));
  assert.deepEqual(db.users[0].habitSent, [key]);
});
