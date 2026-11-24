// Panel actions that write test approvals and the AC record (finding E1, 19 Nov). Pure logic with
// injected dependencies; src/resolvers.js wires them to Forge. Order: check the input and the
// person's edit permission, write the audit event, then the app's store. An entry in the store
// always names a real audit event; an audit event with no entry counts for nothing.

import { acHash, ACS_EVENT, APPROVAL_EVENTS, recordAcs, recordApproval } from './approvals.js';
import { highStakeMarks } from './verifier/checks.js';

// A test name as the verifier compares it: "test_x" or "TestClass::test_x", no path.
const TEST_NAME = /^(?:[A-Za-z_][A-Za-z0-9_]*::)?[A-Za-z_][A-Za-z0-9_]*$/;
const MIN_REASON = 5;
const MAX_REASON = 500;

export function approvalInputErrors(payload) {
  if (!payload || typeof payload !== 'object') return ['no input'];
  const errors = [];
  if (!Object.hasOwn(APPROVAL_EVENTS, payload.kind)) errors.push('kind must be "removal" or "change"');
  const name = String(payload.test ?? '').trim();
  if (!TEST_NAME.test(name) || name.length > 200) errors.push('the test must be one test name, for example test_transfer_errors or TestApi::test_x');
  const reason = String(payload.reason ?? '').trim();
  if (reason.length < MIN_REASON) errors.push(`a reason of at least ${MIN_REASON} characters is required`);
  if (reason.length > MAX_REASON) errors.push(`the reason is longer than ${MAX_REASON} characters`);
  return errors;
}

// deps: { canEdit(key), appendAudit(event), store }.
export async function approveTest({ key, accountId, payload }, deps) {
  const errors = approvalInputErrors(payload);
  if (errors.length) return { ok: false, error: errors.join('; ') };
  if (!accountId) return { ok: false, error: 'the person is not known' };
  if (!(await deps.canEdit(key))) return { ok: false, error: 'only a person who can edit this work item can approve a test change' };
  const test = String(payload.test).trim();
  const reason = String(payload.reason).trim();
  const audit = await deps.appendAudit({ actor: accountId, event: APPROVAL_EVENTS[payload.kind], data: { key, test, reason } });
  await recordApproval(deps.store, key, payload.kind, { test, reason, by: accountId, at: audit.at ?? new Date().toISOString(), auditSeq: audit.seq });
  return { ok: true, auditSeq: audit.seq };
}

// deps: { canEdit(key), readAcs(key), appendAudit(event), store }. readAcs reads the ACs as the
// verifier reads them (src/jira-evidence.js), so the hash compares the same list.
export async function recordAcsAction({ key, accountId }, deps) {
  if (!accountId) return { ok: false, error: 'the person is not known' };
  if (!(await deps.canEdit(key))) return { ok: false, error: 'only a person who can edit this work item can record its ACs' };
  const h = acHash(await deps.readAcs(key));
  // Set 8 Y08: the high-stake marks of this moment are kept with the record, so a mark removed
  // later still asks for a sign-off (src/verifier/checks.js, checkHumanSignoff).
  const marks = deps.readMarks ? highStakeMarks(await deps.readMarks(key)) : [];
  const audit = await deps.appendAudit({ actor: accountId, event: ACS_EVENT, data: { key, acHash: h, ...(marks.length ? { marks } : {}) } });
  await recordAcs(deps.store, key, { acHash: h, by: accountId, at: audit.at ?? new Date().toISOString(), auditSeq: audit.seq, ...(marks.length ? { marks } : {}) });
  return { ok: true, auditSeq: audit.seq, acHash: h };
}
