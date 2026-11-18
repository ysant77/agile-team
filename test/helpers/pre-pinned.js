// Recorded evidence from before the bank's pinned step (scripts/pinned.py, bank main 60f141e)
// has no pinned block. With VERIFY_CONFIG.pinnedRequired true, such a report is cannot_verify,
// which is right for a live claim. Tests that replay those recordings to test other rules use
// this configuration, so they keep testing what they were written for.
import { VERIFY_CONFIG } from '../../src/verify-claim.js';

export const PRE_PINNED_CONFIG = { ...VERIFY_CONFIG, pinnedRequired: false };
