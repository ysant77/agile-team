import { readLatestCommit } from './github.js';
import { addComment, createIssue, getComment } from './jira.js';
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

// Trigger: a comment that starts with "claim:" gets an acknowledgement with GitHub evidence.
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

  const evidence = await readLatestCommit();
  const line = evidence.ok
    ? `GitHub evidence (spike): ${evidence.repository} ${evidence.sha.slice(0, 7)} at ${evidence.date}.`
    : `GitHub evidence: cannot verify (HTTP ${evidence.status}).`;
  await addComment(
    issueKey,
    `Team lead verifier received claim "${claim.type}" on ${issueKey}.\n${line}\nVerdict: not computed in the spike.`,
  );
  console.log('claim handled', issueKey, claim.type, evidence.ok);
}
