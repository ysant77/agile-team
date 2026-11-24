// What a candidate patch may change, and how it is applied (repair harness, 24 Nov 2026). The model
// gives a unified diff only. The harness checks every path before anything is applied, then
// applies it with `git apply` to a fresh scratch copy; the investigated tree is never changed.
// Allowed: change an existing Python file under src/; add a new agent test tests/test_agent_*.py
// (kept apart from the bank's own tests, which are the protected oracle). Everything else is
// refused: existing tests, scripts, CI, config, lock files, migrations, deletes, renames, binary.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const PATCH_LIMITS = { maxBytes: 20_000, maxFiles: 5 };
const SAFE = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,200}$/;
const SRC_PY = /^src\/[A-Za-z0-9_/]+\.py$/;
const AGENT_TEST = /^tests\/test_agent_[a-z0-9_]{1,60}\.py$/;

const strip = (p) => p.replace(/^[ab]\//, '').split('\t')[0].trim();

// exists(path) -> boolean, for the copy the patch is for.
export function checkPatch(diff, { exists }) {
  const text = String(diff ?? '');
  if (!text.trim()) return { ok: false, error: 'the patch is empty; give a unified diff' };
  if (Buffer.byteLength(text) > PATCH_LIMITS.maxBytes) return { ok: false, error: `the patch is larger than ${PATCH_LIMITS.maxBytes} bytes` };
  if (/^(GIT binary patch|Binary files )/m.test(text)) return { ok: false, error: 'binary patches are not allowed' };
  if (/^(rename from|rename to|copy from|copy to|deleted file mode|old mode|new mode|similarity index)/m.test(text)) {
    return { ok: false, error: 'renames, copies, deletes and mode changes are not allowed' };
  }
  const lines = text.split('\n');
  const files = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('--- ') || !lines[i + 1]?.startsWith('+++ ')) continue;
    const from = lines[i].slice(4).trim();
    const to = lines[i + 1].slice(4).trim();
    if (to === '/dev/null') return { ok: false, error: 'deleting a file is not allowed' };
    const path = strip(to);
    const add = from === '/dev/null';
    if (!add && strip(from) !== path) return { ok: false, error: `${strip(from)} -> ${path}: renames are not allowed` };
    if (!SAFE.test(path) || path.split('/').some((s) => s === '..' || s === '.' || s === '')) return { ok: false, error: `${path}: not a plain relative path` };
    if (add) {
      if (!AGENT_TEST.test(path) && !SRC_PY.test(path)) return { ok: false, error: `${path}: a new file must be a Python file under src/ or an agent test tests/test_agent_<name>.py` };
      if (exists(path)) return { ok: false, error: `${path} exists; change it with a diff of the file` };
    } else {
      if (!SRC_PY.test(path)) return { ok: false, error: `${path}: only Python files under src/ may be changed; the bank's tests, scripts, CI and config are protected` };
      if (!exists(path)) return { ok: false, error: `${path} does not exist` };
    }
    files.push({ path, kind: add ? 'add' : 'modify' });
  }
  if (!files.length) return { ok: false, error: 'no file in the patch; give a unified diff with --- a/<path> and +++ b/<path> lines' };
  if (files.length > PATCH_LIMITS.maxFiles) return { ok: false, error: `the patch changes more than ${PATCH_LIMITS.maxFiles} files` };
  if (new Set(files.map((f) => f.path)).size !== files.length) return { ok: false, error: 'a file appears twice in the patch' };
  return { ok: true, files };
}

// A fresh copy of the tree's HEAD (tracked files only) in dest.
export function makeCopy(tree, dest) {
  mkdirSync(dest, { recursive: true });
  const archive = spawnSync('git', ['-C', tree, 'archive', '--format=tar', 'HEAD'], { maxBuffer: 256 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error(`git archive failed: ${archive.stderr}`);
  const untar = spawnSync('tar', ['-x', '-C', dest], { input: archive.stdout });
  if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr}`);
  for (const d of ['.home', '.tmp']) mkdirSync(join(dest, d), { recursive: true });
  return dest;
}

// Checks, then applies the patch in the copy. Returns { ok } or { ok: false, error }.
export function applyPatch(copy, diff) {
  const checked = checkPatch(diff, { exists: (p) => existsSync(join(copy, p)) });
  if (!checked.ok) return checked;
  const input = String(diff).endsWith('\n') ? String(diff) : `${diff}\n`;
  const dry = spawnSync('git', ['apply', '--check', '--recount', '-'], { cwd: copy, input, encoding: 'utf8' });
  if (dry.status !== 0) return { ok: false, error: `the patch does not apply: ${String(dry.stderr).trim().slice(0, 400)}` };
  const run = spawnSync('git', ['apply', '--recount', '-'], { cwd: copy, input, encoding: 'utf8' });
  if (run.status !== 0) return { ok: false, error: `the patch did not apply: ${String(run.stderr).trim().slice(0, 400)}` };
  return { ok: true, files: checked.files };
}

// C3 follow-up (24 Nov): search-and-replace edits in place of a unified diff. Each edit is
// { path, old, new }. "old" must occur exactly once in the file (after the earlier edits of the
// same call); an empty "old" creates a new file, which must not exist. All edits of one call are
// checked and applied in memory first; then all are written, or none. The same path rules and size
// limits as a diff hold, measured on the resulting diff.
const LINE_NO = /^\d+: /;
const count = (text, part) => (part ? text.split(part).length - 1 : 0);

function editPathError(path, add, exists) {
  if (!SAFE.test(path) || path.split('/').some((s) => s === '..' || s === '.' || s === '')) return `${path}: not a plain relative path`;
  if (add) {
    if (!AGENT_TEST.test(path) && !SRC_PY.test(path)) return `${path}: a new file must be a Python file under src/ or an agent test tests/test_agent_<name>.py; other files are protected`;
    if (exists) return `${path} exists; give the exact old text to change it`;
    return null;
  }
  if (!SRC_PY.test(path) && !AGENT_TEST.test(path)) return `${path}: only Python files under src/ may be changed; the bank's tests, scripts, CI and config are protected`;
  if (!exists) return `${path} does not exist`;
  return null;
}

export function applyEdits(copy, edits) {
  if (!Array.isArray(edits) || edits.length === 0) return { ok: false, error: 'no edit; give edits: [{ path, old, new }]' };
  if (edits.length > 20) return { ok: false, error: 'more than 20 edits in one patch' };
  const files = new Map(); // path -> { before, after, kind }
  for (const [i, e] of edits.entries()) {
    const path = String(e?.path ?? '').trim();
    let old = String(e?.old ?? '');
    const text = String(e?.new ?? '');
    const known = files.get(path);
    const onDisk = existsSync(join(copy, path));
    if (!known) {
      const err = editPathError(path, old === '', onDisk);
      if (err) return { ok: false, error: `edit ${i + 1}: ${err}` };
      if (old === '') { files.set(path, { before: null, after: text, kind: 'add' }); continue; }
      const before = readFileSync(join(copy, path), 'utf8');
      files.set(path, { before, after: before, kind: 'modify' });
    } else if (old === '') {
      return { ok: false, error: `edit ${i + 1}: ${path} exists; give the exact old text to change it` };
    }
    const f = files.get(path);
    let n = count(f.after, old);
    // The lines of read-repo-file start with "N: ". Text copied with them is tried once without.
    if (n === 0 && old.split('\n').filter((l) => l !== '').every((l) => LINE_NO.test(l))) {
      const bare = old.split('\n').map((l) => l.replace(LINE_NO, '')).join('\n');
      if (count(f.after, bare) === 1) { old = bare; n = 1; }
    }
    if (n !== 1) return { ok: false, error: `edit ${i + 1}: the old text occurs ${n} times in ${path}; it must occur exactly once (copy it exactly from read-repo-file, without the line numbers, with enough lines to be unique)` };
    f.after = f.after.replace(old, () => text);
  }
  if (files.size > PATCH_LIMITS.maxFiles) return { ok: false, error: `the patch changes more than ${PATCH_LIMITS.maxFiles} files` };
  const diff = [...files.entries()].map(([path, f]) => unifiedDiff(path, f.before, f.after)).join('');
  if (Buffer.byteLength(diff) > PATCH_LIMITS.maxBytes) return { ok: false, error: `the patch is larger than ${PATCH_LIMITS.maxBytes} bytes` };
  if (!diff.trim()) return { ok: false, error: 'the edits change nothing' };
  for (const [path, f] of files) {
    mkdirSync(dirname(join(copy, path)), { recursive: true });
    writeFileSync(join(copy, path), f.after);
  }
  return { ok: true, files: [...files.entries()].map(([path, f]) => ({ path, kind: f.kind })), diff };
}

// A unified diff of one file, made with diff(1) in a scratch folder (for the record and the limits).
function unifiedDiff(path, before, after) {
  if (before === after) return '';
  const dir = mkdtempSync(join(tmpdir(), 'edit-diff-'));
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    writeFileSync(a, before ?? '');
    writeFileSync(b, after);
    const r = spawnSync('diff', ['-u', '--label', before === null ? '/dev/null' : `a/${path}`, '--label', `b/${path}`, a, b], { encoding: 'utf8' });
    return r.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
