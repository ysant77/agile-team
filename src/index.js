import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { appendAudit } from './audit-store.js';
import { applyDecision, formatDecision, parseDecision } from './decision.js';
import { admitClaim } from './claim-intake.js';
import { readLatestCommit } from './github.js';
import { addComment, createIssue, getComment } from './jira.js';
import { malformedAcLines, normaliseAcs, parseAcLines } from './ticket-spec.js';
import { lintRequirement } from './lint.js';
import { adfToText, checkStoryPoints, parseClaim } from './text.js';

// Rovo action: create a work item and set story points.
export async function createTicket(payload) {
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
  const result = await createIssue({
    projectKey: String(payload.projectKey).trim().toUpperCase(),
    summary: String(payload.summary).trim(),
    description: String(payload.description ?? ''),
    issueType: payload.issueType,
    storyPoints,
    acceptanceCriteria: normaliseAcs(
      parseAcLines(payload.acceptanceCriteria),
      String(payload.projectKey).trim().toUpperCase(),
    ),
  });
  console.log('create-ticket result', JSON.stringify(result));
  return result;
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
    await recordDecision(issueKey, decision, { by: comment.author?.accountId ?? null, at: new Date().toISOString() });
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
    body: { issueKey, claim: { id: `${issueKey}:${commentId}`, type: claim.type, text: claim.detail } },
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
export { openCase, recordOpinion } from './case-actions.js';
export { getVerdicts } from './verdicts-action.js';
