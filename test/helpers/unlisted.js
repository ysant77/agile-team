// Replays of evidence recorded before the report hash markers (and, for most, before the pinned
// block), or of hand-made GitHub doubles without them. These tests check other rules, so they run
// as the app ran when the evidence was recorded: no repository listed, pinned block and report
// provenance advisory. Importing this module sets that for the test file (each file runs in its
// own process). The listed behaviour is tested in pinned-per-repo, report-provenance, judge-path
// and evidence-levels, and by arm C on sets 1 to 4.

import { VERIFY_CONFIG } from '../../src/verify-claim.js';

VERIFY_CONFIG.pinnedRequiredRepos = [];
VERIFY_CONFIG.provenanceRequiredRepos = [];
