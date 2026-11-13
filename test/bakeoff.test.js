// Model selection protocol (DESIGN 9k): one config names the models, scorers are blind to the
// model, prompts are the same for every model, and the report says "no clear winner" in the noise.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { addCandidate } from '../bakeoff/add-model.js';
import { chatSettings, loadConfig, ROLE_NAMES, roleModel, validateConfig } from '../bakeoff/models.js';
import { bootstrap, latestRows, summariseRole } from '../bakeoff/report.js';
import { rowKey } from '../bakeoff/run.js';
import { runDev, runDs, runQa } from '../bakeoff/tasks/code.js';
import { DISPUTES, runLead } from '../bakeoff/tasks/lead.js';
import { REQUESTS, runPm } from '../bakeoff/tasks/pm.js';

const config = loadConfig();

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('the config is valid and has every role', () => {
  assert.deepEqual(validateConfig(config), []);
  for (const role of ROLE_NAMES) assert.ok('model' in config.roles[role]);
  assert.equal(roleModel(config, 'lead'), config.roles.lead.model);
  assert.throws(() => roleModel(config, 'cto'));
});

test('a bad config is refused', () => {
  const bad = structuredClone(config);
  bad.roles.dev = { model: 'not-a-candidate:1b', basis: 'x' };
  bad.repeatSetting.seeds = [config.deploySetting.seed];
  const errors = validateConfig(bad);
  assert.ok(errors.some((e) => e.includes('not a candidate')));
  assert.ok(errors.some((e) => e.includes('repeat seeds')));
});

test('no model is named in role logic, tasks, scorers or the client', () => {
  const names = config.candidates.flatMap((c) => [c.model, c.model.split(':')[0]]).concat(Object.keys(config.families));
  const files = [...filesUnder('src'), ...filesUnder('bakeoff/tasks'), 'bakeoff/ollama.js', 'bakeoff/run.js', 'bakeoff/report.js'];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const name of names) assert.ok(!text.includes(name), `${file} names ${name}`);
  }
});

test('generation settings are the same for every model apart from the required reasoning level', () => {
  const [first, ...rest] = config.candidates.map((c) => c.model);
  const strip = ({ think, ...s }) => s;
  for (const m of rest) assert.deepEqual(strip(chatSettings(config, m)), strip(chatSettings(config, first)));
  const family = Object.keys(config.families)[0];
  assert.equal(chatSettings(config, `${family}:20b`).think, config.families[family].think);
  assert.equal(chatSettings(config, 'other:1b').think, false);
  assert.equal(chatSettings(config, 'other:1b', 1).seed, config.repeatSetting.seeds[0]);
  assert.throws(() => chatSettings(config, 'other:1b', config.repeatSetting.seeds.length + 1));
});

// A fake model: records what it was sent and answers the same for every model name.
function fakeAsk(answer) {
  const sent = [];
  const ask = async (messages, format) => {
    sent.push(JSON.stringify({ messages, format }));
    const content = JSON.stringify(answer);
    return { ok: true, content, parsed: answer, calls: [] };
  };
  return { ask, sent };
}

test('the team lead prompt and score do not depend on the model name', async () => {
  const opinion = { decision: 'A', confidence: 0.9, reasons: [{ text: 'smaller diff', evidence: ['E2'] }] };
  for (const dispute of DISPUTES.slice(0, 3)) {
    const a = fakeAsk(opinion);
    const b = fakeAsk(opinion);
    const ra = await runLead(a.ask, dispute, { model: 'alpha:1b', digest: 'x', promptVersion: 'v' });
    const rb = await runLead(b.ask, dispute, { model: 'beta:9b', digest: 'y', promptVersion: 'v' });
    assert.deepEqual(a.sent, b.sent);
    assert.deepEqual(ra, rb);
  }
});

test('the PM prompt and score do not depend on the model name', async () => {
  const draft = { summary: 'x', description: 'y', acceptanceCriteria: ['AC1: a user sees a balance'], storyPoints: 3 };
  const a = fakeAsk(draft);
  const b = fakeAsk(draft);
  assert.deepEqual(await runPm(a.ask, REQUESTS[0]), await runPm(b.ask, REQUESTS[0]));
  assert.deepEqual(a.sent, b.sent);
});

test('code-role runners are not given the model at all', () => {
  for (const fn of [runDev, runDs, runQa]) assert.ok(fn.length <= 2, `${fn.name} takes ${fn.length} arguments`);
});

test('old rows without a repeat count as repeat 0', () => {
  assert.equal(rowKey({ model: 'm', role: 'qa', task: 't' }), 'm|qa|t|0');
  assert.equal(rowKey({ model: 'm', role: 'qa', task: 't', repeat: 2 }), 'm|qa|t|2');
});

test('the bootstrap interval is the same every time', () => {
  const xs = [1, 0, 1, 1, 0];
  assert.deepEqual(bootstrap(xs), bootstrap(xs));
  const [lo, hi] = bootstrap(xs);
  assert.ok(lo <= 0.6 && hi >= 0.6);
});

const rowsFor = (model, role, scores, extra = {}) => scores.map((score, i) => ({ model, role, task: `T${i}`, score, wallS: 10, ...extra }));

test('one task of difference in five is no clear winner, and the tie-break picks the smaller model', () => {
  const rows = [...rowsFor('big', 'dev', [1, 1, 1, 1, 0]), ...rowsFor('small', 'dev', [1, 1, 1, 0, 0])];
  const s = summariseRole(rows, 'dev', { big: 18, small: 3 });
  assert.equal(s.verdict.kind, 'noise');
  assert.equal(s.verdict.leader, 'big');
  assert.equal(s.verdict.pick, 'small');
});

test('a large difference is a clear winner', () => {
  const rows = [...rowsFor('good', 'lead', Array(10).fill(1), { guardVersion: 2 }), ...rowsFor('weak', 'lead', Array(10).fill(0), { guardVersion: 2 })];
  const s = summariseRole(rows, 'lead', { good: 18, weak: 3 });
  assert.equal(s.verdict.kind, 'clear');
  assert.equal(s.verdict.pick, 'good');
});

test('overlapping repeat spreads make a winner unclear', () => {
  const rows = [
    ...rowsFor('a', 'pm', Array(10).fill(1), { lintVersion: 2 }), ...rowsFor('b', 'pm', Array(10).fill(0), { lintVersion: 2 }),
    ...rowsFor('a', 'pm', [1, 1, 1, 0, 0, 0, 0, 0, 0, 0], { repeat: 1, lintVersion: 2 }), ...rowsFor('b', 'pm', [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], { repeat: 1, lintVersion: 2 }),
  ];
  assert.equal(summariseRole(rows, 'pm').verdict.kind, 'noise');
});

test('a model that has not finished a role is shown but not ranked', () => {
  const rows = [...rowsFor('done', 'qa', [1, 0, 1]), ...rowsFor('half', 'qa', [1, 1])];
  const s = summariseRole(rows, 'qa');
  assert.equal(s.verdict.kind, 'single');
  assert.equal(s.lines.find((l) => l.model === 'half').complete, false);
});

test('a re-run row replaces the failed one', () => {
  const rows = latestRows([{ model: 'm', role: 'qa', task: 't', score: 0, failed: 'fetch failed' }, { model: 'm', role: 'qa', task: 't', score: 1 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 1);
});

test('adding a candidate keeps the config valid and refuses a bad tag', () => {
  const next = addCandidate(structuredClone(config), 'newmodel:8b', 'laptop-8gb');
  assert.equal(next.candidates.at(-1).model, 'newmodel:8b');
  assert.equal(next.candidates.at(-1).status, 'run');
  assert.throws(() => addCandidate(structuredClone(config), 'bad tag; rm', 'mac'));
});

test('lead rows scored under older guards are left out of the ranking', () => {
  const rows = [...rowsFor('old', 'lead', Array(10).fill(1)), ...rowsFor('new', 'lead', Array(10).fill(0), { guardVersion: 2 })];
  const s = summariseRole(rows, 'lead');
  assert.deepEqual(s.lines.map((l) => l.model), ['new']);
});
