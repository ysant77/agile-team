import { verifyClaim } from './verify-claim.js';

// Async consumer: up to the configured timeout; one event per claim. An error is thrown on
// purpose so the queue retries; verifyClaim records each step, so a retry posts one verdict.
export async function handler(event) {
  const { issueKey, claim } = event.body ?? event;
  if (!issueKey || !claim?.type) {
    console.log('verify event without issue or claim');
    return;
  }
  await verifyClaim({ issueKey, claim });
}
