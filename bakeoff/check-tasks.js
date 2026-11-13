// Checks that each task's bug is real before any model is scored on it: the task's tests pass on
// the clean code and fail with the bug planted.
//   node bakeoff/check-tasks.js [taskSet] [taskId]
import { applyEdits, applySeed, makeWorktree, pytest, removeWorktree } from './repo.js';
import { BUGS, DS_TASKS } from './tasks/code.js';

const set = Number(process.argv[2] ?? 2);
const only = process.argv[3] ?? null;
let bad = 0;
for (const task of [...BUGS, ...DS_TASKS].filter((t) => (t.set ?? 1) === set && (!only || t.id === only))) {
  const dir = makeWorktree(`check-${task.id}`, task.ref, task.extras);
  try {
    const clean = pytest(dir, task.tests, 600_000).passed;
    if (task.seed) applySeed(dir, task.seed);
    const errors = task.inline ? applyEdits(dir, [task.inline]) : [];
    const seeded = errors.length ? null : pytest(dir, task.tests, 600_000).passed;
    const ok = clean === true && seeded === false;
    if (!ok) bad += 1;
    console.log(`${task.id}: clean ${clean ? 'pass' : 'FAIL'}, with bug ${seeded === null ? `not applied (${errors.join('; ')})` : seeded ? 'PASS (bug not caught)' : 'fail'} -> ${ok ? 'ok' : 'BAD'}`);
  } finally {
    removeWorktree(dir);
  }
}
process.exitCode = bad ? 1 : 0;
