// Runs one fixed command for the repair harness (C3, 24 Nov 2026) inside a macOS sandbox profile:
// no network, and writes only inside the scratch copy. The command and its arguments are fixed by
// the harness; the model never gives a command, only a test id that the harness checks. A run
// that passes its time limit is killed. Output is cut to a bounded tail.

import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';

export const SANDBOX = '/usr/bin/sandbox-exec';
export const OUT_MAX = 4000;

// The profile: everything the default allows, except any network use, any file write outside the
// scratch copy (and /dev/null), and reading the content of files under the home folder, the shared
// temporary folders and mounted volumes, other than the scratch copy and the Python environment
// (lead review of 24 Nov: a model-written test must not read a credential file into a trace).
// Metadata stays readable, so Python can resolve its paths. In the profile the last match wins.
const quote = (p) => `"${realpathSync(p).replaceAll('"', '')}"`;
export function profile(scratch, readable = []) {
  const dir = quote(scratch);
  const roots = [homedir(), '/private/tmp', '/private/var/folders', '/Volumes'].filter((p) => existsSync(p)).map(quote);
  const allow = [dir, ...readable.filter((p) => existsSync(p)).map(quote)];
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    `(deny file-read-data ${roots.map((r) => `(subpath ${r})`).join(' ')})`,
    `(allow file-read-data ${allow.map((r) => `(subpath ${r})`).join(' ')})`,
    '(deny file-write*)',
    `(allow file-write* (subpath ${dir}) (literal "/dev/null") (literal "/dev/dtracehelper"))`,
  ].join('\n');
}

// The folders a Python needs to read: its environment and its base install.
const prefixes = new Map();
export function pythonRoots(python) {
  if (!python) return [];
  if (!prefixes.has(python)) {
    const r = spawnSync(python, ['-I', '-c', 'import sys; print(sys.prefix); print(sys.base_prefix)'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } });
    prefixes.set(python, r.status === 0 ? r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : []);
  }
  return prefixes.get(python);
}

const tail = (s) => (s.length > OUT_MAX ? `...${s.slice(-OUT_MAX)}` : s);

// argv: the fixed program and arguments. env: replaces the whole environment (no secrets pass).
// python: the interpreter of the run, whose environment stays readable (default: the program run).
export function runSandboxed({ scratch, cwd = scratch, argv, env = {}, timeoutMs = 120_000, python = null }) {
  const r = spawnSync(SANDBOX, ['-p', profile(scratch, pythonRoots(python ?? argv[0])), ...argv], {
    cwd, env: { PATH: '/usr/bin:/bin', ...env }, timeout: timeoutMs, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  const timedOut = r.error?.code === 'ETIMEDOUT' || (r.signal === 'SIGKILL' && r.status === null);
  return { status: r.status, signal: r.signal ?? null, timedOut, stdout: tail(r.stdout ?? ''), stderr: tail(r.stderr ?? '') };
}

// pytest on a scratch copy of the bank, with the harness's own Python. The copy's src/ comes first
// on the path, so the copy's code is tested, not the code the environment was built from.
export const TEST_ID = /^tests\/[A-Za-z0-9_/]{1,120}\.py(::[A-Za-z0-9_]{1,120}(\[[A-Za-z0-9_.-]{1,60}\])?)?$/;
export function runPytest({ copy, python, tests, timeoutMs = 180_000 }) {
  for (const t of tests) if (!TEST_ID.test(t) || t.includes('..')) throw new Error(`not a test id: ${t}`);
  const r = runSandboxed({
    scratch: copy, python, argv: [python, '-m', 'pytest', '-q', '-p', 'no:cacheprovider', '-o', 'faulthandler_timeout=0', ...tests],
    env: { PYTHONPATH: `${copy}/src`, HOME: `${copy}/.home`, TMPDIR: `${copy}/.tmp`, PYTHONDONTWRITEBYTECODE: '1' }, timeoutMs,
  });
  // pytest exit codes: 0 all passed, 1 some failed, 2 interrupted, 3 internal error, 4 usage, 5 none collected.
  const outcome = r.timedOut ? 'timeout' : r.status === 0 ? 'passed' : r.status === 1 ? 'failed' : r.status === 5 ? 'no_tests' : 'error';
  const summary = (r.stdout.trim().split('\n').at(-1) ?? '').slice(0, 300);
  return { outcome, status: r.status, summary, tail: r.stdout.slice(-1500) };
}
