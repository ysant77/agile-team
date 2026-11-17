// Scratch worktrees of the demo bank for code tasks. Never touches a branch: detached heads only.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BANK = resolve(process.env.BANK_REPO ?? join(HERE, '..', '..', 'ledger-demo'));
const WORK = join(HERE, '.work');

// Model-written code runs through sh(), so it gets only what a build needs: no tokens, keys or
// other secrets from the caller's environment (unit 2 review, item 6). This is not a sandbox; see
// bakeoff/README.md.
const ENV_KEEP = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'UV_CACHE_DIR', 'UV_PYTHON'];
export function safeEnv(env = process.env) {
  return Object.fromEntries(ENV_KEEP.filter((k) => env[k] !== undefined).map((k) => [k, env[k]]));
}

export function sh(cmd, args, cwd, timeoutMs = 300_000) {
  const r = spawnSync(cmd, args, { cwd, env: safeEnv(), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? (r.error ? -1 : 0), out: `${r.stdout ?? ''}${r.stderr ?? ''}`, timedOut: r.error?.code === 'ETIMEDOUT' };
}

export function makeWorktree(name, ref, extras = []) {
  mkdirSync(WORK, { recursive: true });
  const dir = join(WORK, name);
  if (existsSync(dir)) removeWorktree(dir);
  execFileSync('git', ['-C', BANK, 'worktree', 'add', '-q', '--detach', dir, ref], { stdio: 'pipe' });
  const sync = sh('uv', ['sync', '--locked', '-q', ...extras.flatMap((e) => ['--extra', e])], dir);
  if (sync.code !== 0) throw new Error(`uv sync failed: ${sync.out.slice(-400)}`);
  return dir;
}

export function removeWorktree(dir) {
  spawnSync('git', ['-C', BANK, 'worktree', 'remove', '--force', dir], { stdio: 'pipe' });
}

function inside(dir, rel) {
  const full = resolve(dir, rel);
  if (!full.startsWith(dir + sep) || full.includes(`${sep}.git${sep}`)) throw new Error(`path outside the worktree: ${rel}`);
  return full;
}

export const read = (dir, rel) => readFileSync(inside(dir, rel), 'utf8');
export const write = (dir, rel, text) => {
  const full = inside(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
};

// Apply exact one-time replacements. Returns the errors; nothing is applied when one fails.
export function applyEdits(dir, edits) {
  const errors = [];
  const staged = new Map();
  for (const [i, e] of (edits ?? []).entries()) {
    if (!e || typeof e.path !== 'string' || typeof e.old !== 'string' || typeof e.new !== 'string') {
      errors.push(`edit ${i + 1}: needs path, old and new`);
      continue;
    }
    let text;
    try {
      text = staged.get(e.path) ?? read(dir, e.path);
    } catch (error) {
      errors.push(`edit ${i + 1}: ${error.message}`);
      continue;
    }
    const count = e.old ? text.split(e.old).length - 1 : 0;
    if (count !== 1) {
      errors.push(`edit ${i + 1}: "old" found ${count} times in ${e.path}`);
      continue;
    }
    staged.set(e.path, text.replace(e.old, () => e.new));
  }
  if (errors.length === 0) for (const [path, text] of staged) write(dir, path, text);
  return errors;
}

export function pytest(dir, args, timeoutMs = 300_000) {
  const r = sh('uv', ['run', 'pytest', '-q', '-p', 'no:cacheprovider', '-x', '--tb=short', ...args], dir, timeoutMs);
  return { passed: r.code === 0, code: r.code, timedOut: r.timedOut, tail: r.out.split('\n').slice(-40).join('\n') };
}

export function changed(dir) {
  const r = sh('git', ['diff', '--numstat'], dir);
  return r.out.trim().split('\n').filter(Boolean).map((line) => {
    const [add, del, path] = line.split('\t');
    return { path, lines: Number(add) + Number(del) };
  });
}

export function applySeed(dir, seed) {
  const r = sh('git', ['apply', join('seeds', `${seed}.patch`)], dir);
  if (r.code !== 0) throw new Error(`seed ${seed} does not apply: ${r.out}`);
}
