import { verifyClaim } from './verify-claim.js';

// Async consumer: up to the configured timeout; one event per claim.
export async function handler(event) {
  const { issueKey, claim } = event.body ?? event;
  if (!issueKey || !claim?.type) {
    console.log('verify event without issue or claim');
    return;
  }
  await verifyClaim({ issueKey, claim });
}
