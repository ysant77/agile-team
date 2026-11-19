import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { appendAudit } from './audit-store.js';
import { canonical, sha256 } from './audit.js';
import { createOnce, currentAccountId } from './action-guard.js';
import { readFinding } from './discovery.js';
import { applyDecision, formatDecision, parseDecision } from './decision.js';
import { admitClaim } from './claim-intake.js';
import { readLatestCommit } from './github.js';
import { addComment, createIssue, getComment } from './jira.js';
import { malformedAcLines, normaliseAcs, parseAcLines } from './ticket-spec.js';
import { lintRequirement } from './lint.js';
import { adfToText, checkStoryPoints, parseClaim } from './text.js';

// Rovo action: create a work item and set story points. Rules (docs/ACTIONS.md): every input is
// checked before any Jira call; Jira checks the user's create permission (the call is made as the
// user); the same draft from the same person within 24 hours creates one work item (idempotency
// key in KVS); each creation writes the audit event ticket.created. The user's confirmation of
// the draft is the Rovo agent's step; the code cannot see the chat (limit, docs/ACTIONS.md).
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,9}$/;
export const ISSUE_TYPES = ['Task', 'Story', 'Bug'];
const CREATE_PENDING_MS = 10 * 60 * 1000;
const CREATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function createTicket(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'no input' };
  const projectKey = String(payload.projectKey ?? '').trim().toUpperCase();
  if (!PROJECT_KEY.test(projectKey)) return { ok: false, error: 'projectKey must be a Jira project key, for example BANK' };
  const issueType = payload.issueType === undefined || payload.issueType === null || payload.issueType === '' ? 'Task' : String(payload.issueType).trim();
  if (!ISSUE_TYPES.includes(issueType)) return { ok: false, error: `issueType must be one of ${ISSUE_TYPES.join(', ')}` };
  const storyPoints = checkStoryPoints(payload.storyPoints);
  const malformed = malformedAcLines(payload.acceptanceCriteria);
  if (malformed.length) {
    return {
      ok: false,
      error: 'Every acceptance criterion must be one line "AC1 | statement | check", for example ' +
        '"AC1 | balance never below 0.00 | test_passes(test_{TOKEN}_balance_never_negative)". ' +
        `Fix these lines and call again: ${malformed.join(' / ')}`,
    };
  }
  const grounding = ticketGrounding(payload);
  if (grounding) return { ok: false, error: grounding };
  // A ticket from a discovery finding (Mode B): the finding must exist and name a defect. The
  // ticket names it and is labelled "unconfirmed" until a CI report shows the reproducer fails on
  // base. Removing the label is a person's step after a reproduced verdict.
  let finding = null;
  if (payload.findingId !== undefined && payload.findingId !== null && payload.findingId !== '') {
    finding = await readFinding(payload.findingId, { store: kvs });
    if (!finding) return { ok: false, error: `there is no finding ${String(payload.findingId).slice(0, 40)}; record one with record-finding first` };
    if (finding.kind !== 'defect') return { ok: false, error: `finding ${finding.findingId} found no defect, so no bug ticket is created from it` };
  }
  const by = await currentAccountId();
  if (!by) return { ok: false, error: 'Jira did not say who is asking, so no work item is created' };
  const description = String(payload.description ?? '');
  const draft = {
    projectKey,
    summary: String(payload.summary ?? '').trim(),
    description: finding ? `${description}\n\n${findingNote(finding)}` : description,
    issueType,
    storyPoints,
    acceptanceCriteria: normaliseAcs(parseAcLines(payload.acceptanceCriteria), projectKey),
    ...(finding ? { findingId: finding.findingId, labels: ['unconfirmed'] } : {}),
  };
  // One work item per draft and person: a retried or repeated call returns the first result.
  const onceKey = `ticket-create:${sha256(canonical({ by, ...draft }))}`;
  const now = Date.now();
  if (!(await createOnce(kvs, onceKey, { state: 'pending', at: now }))) {
    const prior = await kvs.get(onceKey);
    if (prior?.state === 'done' && now - prior.at < CREATE_WINDOW_MS) {
      return { ok: true, key: prior.key, duplicate: true, note: `This draft was already created as ${prior.key}; no second work item.` };
    }
    if (prior?.state === 'pending' && now - prior.at < CREATE_PENDING_MS) {
      return { ok: false, error: 'the same draft is being created now; check Jira before you try again' };
    }
    await kvs.set(onceKey, { state: 'pending', at: now }); // an old or stale entry
  }
  let result;
  try {
    result = await createIssue(draft);
  } catch (error) {
    await kvs.delete(onceKey);
    throw error;
  }
  console.log('create-ticket result', JSON.stringify(result));
  if (!result.ok) {
    await kvs.delete(onceKey); // nothing was created: the person may try again
    return result;
  }
  await kvs.set(onceKey, { state: 'done', key: result.key, at: now });
  const audit = await appendAudit({ actor: by, event: 'ticket.created', data: {
    key: result.key, projectKey, issueType, storyPoints, acHash: sha256(canonical(draft.acceptanceCriteria)),
    ...(finding ? { findingId: finding.findingId } : {}) } });
  return { ...result, auditSeq: audit.seq };
}

function findingNote(f) {
  const lines = [`Finding ${f.findingId} (unconfirmed): ${f.hypothesis}`];
  if (f.reproducer) lines.push(`Proposed reproducer: ${f.reproducer.testName} in ${f.reproducer.file}; it must fail on base. ${f.reproducer.asserts}`);
  return lines.join('\n');
}

// Every number, unit or threshold in a ticket must come from the user's request; otherwise the
// ticket states an open question instead (owner rule, 13 Nov). Returns an error text or null.
// Known limit: the agent supplies "request", and the code cannot read the user's chat. An agent
// that adds a number to "request" passes this check. The check stops a number that is in the
// draft only; the user's confirmation of the draft is the control for the request text. The
// lint-requirement action has the same limit.
export function ticketGrounding(payload) {
  const request = String(payload?.request ?? '').trim();
  if (!request) return 'Pass the user\'s request in their own words as "request", so the numbers can be checked.';
  const draft = {
    summary: payload.summary ?? '',
    description: String(payload.description ?? '').replace(/\\n/g, '\n'),
    acceptanceCriteria: parseAcLines(payload.acceptanceCriteria),
  };
  const bad = lintRequirement(draft, [request]).findings.filter((f) => f.rule === 'ungrounded-number');
  if (!bad.length) return null;
  return `These numbers are not in the request: ${bad.map((f) => f.message.split(' ')[0]).join(', ')}. ` +
    'Do not invent a number, unit or threshold. Remove it, or write "Open question: <what is missing>" in the description and ask the user.';
}

// Rovo action: read the latest commit of a public repository through egress.
export async function readGithubCommit(payload) {
  const result = await readLatestCommit(payload?.repository);
  console.log('read-github-commit result', JSON.stringify(result));
  return result;
}

// Trigger: a comment that starts with "claim:" queues a verification job.
// One concurrency key keeps verdicts (and audit appends) in order.
const verifyQueue = new Queue({ key: 'verify-queue' });

export async function onComment(event) {
  const issueKey = event?.issue?.key;
  const commentId = event?.comment?.id;
  if (!issueKey || !commentId) {
    console.log('comment event without issue or comment id');
    return;
  }
  const comment = await getComment(issueKey, commentId);
  if (comment?.author?.accountType === 'app') return; // ignore our own comments
  const text = adfToText(comment.body);
  const decision = parseDecision(text);
  if (decision) {
    // A comment event can be delivered twice: one comment records one decision (finding E3).
    const seen = `decision-seen:${issueKey}:${commentId}`;
    if (!(await createOnce(kvs, seen, { at: new Date().toISOString() }))) {
      console.log('decision comment already recorded', issueKey, commentId);
      return;
    }
    try {
      await recordDecision(issueKey, decision, { by: comment.author?.accountId ?? null, at: new Date().toISOString() });
    } catch (error) {
      await kvs.delete(seen); // not recorded: a later delivery may try again
      throw error;
    }
    return;
  }
  const claim = parseClaim(text);
  if (!claim) return;
  const admitted = await admitClaim({ issueKey, commentId, authorId: comment?.author?.accountId }, kvs);
  if (!admitted.ok) {
    console.log('claim not queued', issueKey, admitted.reason);
    return;
  }
  await verifyQueue.push({
    // The claimant: a sign-off by the same person does not count.
    body: { issueKey, claim: { id: `${issueKey}:${commentId}`, type: claim.type, text: claim.detail, by: comment?.author?.accountId ?? null } },
    concurrency: { key: 'verify', limit: 1 },
  });
  console.log('claim queued', issueKey, claim.type);
}

// A human's "decision: PR<n> because ..." comment on an open arbitration case.
async function recordDecision(issueKey, parsed, meta) {
  const key = `case:${issueKey}`;
  const result = applyDecision(await kvs.get(key), parsed, meta);
  if (!result.ok) {
    await addComment(issueKey, `Decision not recorded: ${result.error}.`);
    return;
  }
  await kvs.set(key, result.kase);
  const audit = await appendAudit({ actor: meta.by ?? 'unknown', event: 'decision', data: { issueKey, ...result.record } });
  await addComment(issueKey, `${formatDecision(issueKey, result.record)}\nAudit seq ${audit.seq}.`);
  console.log('decision recorded', issueKey, result.record.side);
}

export { lintRequirementAction } from './lint-action.js';
export {
  listRepoFilesAction, readCiResultsAction, readRepoFileAction, recordFindingAction, startInvestigationAction,
} from './discovery-actions.js';
export { openCase, recordOpinion } from './case-actions.js';
export { getVerdicts } from './verdicts-action.js';
export { getPrDiff, recordReview } from './review-actions.js';
