// F5 (review of 16 Nov): field_equals needs the fields it names; they were never collected.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectJira } from '../src/jira-evidence.js';
import { runAcCheck } from '../src/verifier/verdict.js';

function fakeJira(issue, fieldsById) {
  const paths = [];
  const requestJira = async (path) => {
    const p = path.value ?? String(path);
    paths.push(p);
    const wanted = new URL(`https://x${p}`).searchParams.get('fields') ?? '';
    const isFieldRead = !p.includes('properties=');
    const body = isFieldRead
      ? { key: issue.key, fields: Object.fromEntries(wanted.split(',').filter((f) => f in fieldsById).map((f) => [f, fieldsById[f]])) }
      : issue;
    return { ok: true, status: 200, json: async () => body };
  };
  return { requestJira, paths };
}

const issue = (acs) => ({
  key: 'BANK-31',
  fields: { issuetype: { name: 'Task' }, status: { name: 'In Progress' }, subtasks: [], issuelinks: [] },
  properties: { 'aat.ticket': { acceptanceCriteria: acs } },
});

test('F5: the fields that field_equals names are read from Jira', async () => {
  const acs = [{ acId: 'AC1', check: { type: 'field_equals', args: ['customfield_10050', 'required'] } }];
  const jira = fakeJira(issue(acs), { customfield_10050: { value: 'required' } });
  const ticket = await collectJira('BANK-31', jira.requestJira);
  assert.deepEqual(ticket.fields, { customfield_10050: 'required' });
  assert.equal(runAcCheck({ ticket }, acs[0].check).status, 'pass');
  assert.equal(jira.paths.length, 2);
});

test('F5: no field_equals check, no second read', async () => {
  const jira = fakeJira(issue([]), {});
  const ticket = await collectJira('BANK-31', jira.requestJira);
  assert.deepEqual(ticket.fields, {});
  assert.equal(jira.paths.length, 1);
});

test('F5: a field Jira does not return is unknown, not a failure', () => {
  const check = { type: 'field_equals', args: ['customfield_404', 'x'] };
  assert.equal(runAcCheck({ ticket: { key: 'BANK-31', fields: {} } }, check).status, 'unknown');
  assert.equal(runAcCheck({ ticket: { key: 'BANK-31' } }, check).status, 'unknown');
});
