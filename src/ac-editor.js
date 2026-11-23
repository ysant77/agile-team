// The panel's AC editor (fresh-site path, option 1a, docs/DESIGN-FRESH-SITE.md). A person who can
// edit the work item types the AC lines ("AC1 | statement | check") and saves them. The app
// checks the lines with the create-ticket rules, writes the ticket spec (aat.ticket) as the user,
// keeping its other fields, and records the ACs with an audit event (recordAcsAction), so a judge
// on a fresh site needs no REST console. Pure logic with injected dependencies; src/resolvers.js
// wires it to Forge. The test names are kept as typed: no {TOKEN} rename.

import { recordAcsAction } from './approval-actions.js';
import { acLineErrors, parseAcLines } from './ticket-spec.js';

const MAX_TEXT = 20000;

// deps: { canEdit(key), readSpec(key), writeSpec(key, spec) -> { ok, status }, readAcs(key),
// appendAudit(event), store }.
export async function saveAcsAction({ key, accountId, payload }, deps) {
  if (!accountId) return { ok: false, error: 'the person is not known' };
  const text = String(payload?.text ?? '');
  if (text.length > MAX_TEXT) return { ok: false, error: `the AC text is longer than ${MAX_TEXT} characters` };
  if (!(await deps.canEdit(key))) return { ok: false, error: 'only a person who can edit this work item can save its ACs' };
  const lineError = acLineErrors(text);
  if (lineError) return { ok: false, error: lineError };
  const acs = parseAcLines(text);
  if (!acs.length) return { ok: false, error: 'write at least one AC line, for example "AC1 | statement | test_passes(test_name)"' };
  const spec = (await deps.readSpec(key)) ?? {};
  const next = { ...spec, version: spec.version ?? 1, acceptanceCriteria: acs };
  const put = await deps.writeSpec(key, next);
  if (!put?.ok) return { ok: false, error: `Jira refused the ACs (HTTP ${put?.status ?? 'unknown'}).` };
  // The saved ACs are recorded by the person who saved them (audit event acs.recorded).
  const recorded = await recordAcsAction({ key, accountId }, deps);
  if (!recorded.ok) return { ok: false, error: `The ACs were saved, but not recorded: ${recorded.error}` };
  return { ok: true, count: acs.length, acsAuditSeq: recorded.auditSeq };
}
