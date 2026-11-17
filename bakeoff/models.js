// Reads config/models.json, the only place that names a model (DESIGN 9k). Role logic, tasks and
// scorers get a model name only as an opaque value passed through from here.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROLE_NAMES = ['pm', 'dev', 'qa', 'ds', 'lead'];
export const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'models.json');
const STATUSES = new Set(['run', 'next', 'dropped']);

export function validateConfig(config) {
  const errors = [];
  for (const key of ['deploySetting', 'repeatSetting', 'roles', 'candidates']) {
    if (!config?.[key]) errors.push(`missing ${key}`);
  }
  if (errors.length) return errors;
  const names = config.candidates.map((c) => c.model);
  if (new Set(names).size !== names.length) errors.push('a candidate is listed twice');
  for (const c of config.candidates) {
    if (!/^[\w.-]+(:[\w.-]+)?$/.test(c.model ?? '')) errors.push(`bad model tag: ${c.model}`);
    if (!STATUSES.has(c.status)) errors.push(`bad status for ${c.model}: ${c.status}`);
  }
  for (const role of ROLE_NAMES) {
    const r = config.roles[role];
    if (!r) {
      errors.push(`missing role ${role}`);
      continue;
    }
    if (!r.basis) errors.push(`role ${role} has no basis`);
    for (const m of [r.model, r.runnerUp].filter(Boolean)) {
      if (!names.includes(m)) errors.push(`role ${role} uses ${m}, which is not a candidate`);
    }
  }
  const seeds = config.repeatSetting.seeds ?? [];
  if (!seeds.length || seeds.includes(config.deploySetting.seed)) errors.push('repeat seeds must be set and differ from the deploy seed');
  return errors;
}

export function loadConfig(path = CONFIG_PATH) {
  const text = readFileSync(path, 'utf8');
  const config = JSON.parse(text);
  const errors = validateConfig(config);
  if (errors.length) throw new Error(`${path}: ${errors.join('; ')}`);
  return { ...config, hash: createHash('sha256').update(text).digest('hex').slice(0, 16) };
}

export function roleModel(config, role) {
  if (!ROLE_NAMES.includes(role)) throw new Error(`unknown role: ${role}`);
  return config.roles[role].model;
}

export function candidates(config, statuses = ['run']) {
  return config.candidates.filter((c) => statuses.includes(c.status)).map((c) => c.model);
}

// Generation settings for one call. repeat 0 is the deploy setting; repeat i > 0 uses the i-th
// repeat seed. The family entry holds the only per-model difference (a required reasoning level).
export function chatSettings(config, model, repeat = 0) {
  const base = repeat === 0 ? config.deploySetting : { ...config.repeatSetting, seed: config.repeatSetting.seeds[repeat - 1] };
  if (base.seed === undefined) throw new Error(`no seed for repeat ${repeat}`);
  const family = Object.keys(config.families ?? {}).find((f) => model.startsWith(f));
  return {
    temperature: base.temperature,
    seed: base.seed,
    numCtx: base.numCtx,
    think: family ? config.families[family].think : false,
  };
}
