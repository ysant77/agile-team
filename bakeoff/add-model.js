// Add a candidate model and score it on the same fixed tasks, in one command (DESIGN 9k):
//   node bakeoff/add-model.js <ollama-tag> [--machine mac|laptop-8gb] [--repeats 0]
// The model must already be installed: this script never downloads (downloads need the owner's
// approval). It adds the tag to config/models.json with status "run", runs every role on the
// pinned tasks into the current run (resuming, so finished rows are kept), and rewrites REPORT.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_PATH, loadConfig, validateConfig } from './models.js';
import { digest } from './ollama.js';
import { readMemory, render } from './report.js';
import { main as runBakeoff } from './run.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export function addCandidate(config, model, machine) {
  const existing = config.candidates.find((c) => c.model === model);
  const candidates = existing
    ? config.candidates.map((c) => (c.model === model ? { ...c, status: 'run' } : c))
    : [...config.candidates, { model, machine, status: 'run' }];
  const next = { ...config, candidates };
  const errors = validateConfig(next);
  if (errors.length) throw new Error(errors.join('; '));
  return next;
}

export async function main(argv = process.argv.slice(2)) {
  const [model, ...rest] = argv;
  if (!model || model.startsWith('--')) throw new Error('usage: node bakeoff/add-model.js <ollama-tag> [--machine mac] [--repeats 0]');
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace(/^--/, '')] = rest[i + 1];
  if (!(await digest(model))) throw new Error(`${model} is not installed; ask the owner before any download`);

  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const config = loadConfig();
  const updated = addCandidate(raw, model, opts.machine ?? 'mac');
  writeFileSync(CONFIG_PATH, `${JSON.stringify(updated, null, 2)}\n`);

  await runBakeoff(['--models', model, '--resume', 'yes', '--repeats', opts.repeats ?? '0']);

  const results = join(HERE, 'results', `${config.currentRun}.jsonl`);
  const all = readFileSync(results, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  writeFileSync(join(HERE, 'REPORT.md'), `${render(all, readMemory([results]))}\n`);
  console.log(`report: ${join(HERE, 'REPORT.md')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
