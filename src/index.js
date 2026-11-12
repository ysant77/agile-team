import { Queue } from '@forge/events';
import { readLatestCommit } from './github.js';
import { createIssue, getComment } from './jira.js';
import { parseAcLines } from './ticket-spec.js';
import { adfToText, checkStoryPoints, parseClaim } from './text.js';

// Rovo action: create a work item and set story points.
export async function createTicket(payload) {
  const storyPoints = checkStoryPoints(payload.storyPoints);
  const result = await createIssue({
    projectKey: String(payload.projectKey).trim().toUpperCase(),
    summary: String(payload.summary).trim(),
    description: String(payload.description ?? ''),
    issueType: payload.issueType,
    storyPoints,
    acceptanceCriteria: parseAcLines(payload.acceptanceCriteria),
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
  await verifyQueue.push({
    body: { issueKey, claim: { id: `${issueKey}:${commentId}`, type: claim.type, text: claim.detail } },
    concurrency: { key: 'verify', limit: 1 },
  });
  console.log('claim queued', issueKey, claim.type);
}
