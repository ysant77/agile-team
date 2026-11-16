import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { admitClaim } from './claim-intake.js';
import { readLatestCommit } from './github.js';
import { createIssue, getComment } from './jira.js';
import { malformedAcLines, normaliseAcs, parseAcLines } from './ticket-spec.js';
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
  const claim = parseClaim(adfToText(comment.body));
  if (!claim) return;
  const admitted = await admitClaim({ issueKey, commentId }, kvs);
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

export { lintRequirementAction } from './lint-action.js';
