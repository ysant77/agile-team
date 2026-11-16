// One source of truth for every agent tool (DESIGN 9l). The Forge manifest, the skills, the MCP
// tools and the local twins' tool list must agree with this file; tests check the manifest and
// the skill tables, and the bake-off builds the local tool list from it.

export const TOOL_SPECS = {
  'lint-requirement': {
    kind: 'read',
    purpose: 'Checks a draft requirement by fixed rules and returns findings.',
    use: 'Before showing a ticket draft, and when a user asks whether a requirement is checkable.',
    avoid: 'Do not use it to create or change a ticket.',
    args: {
      request: { type: 'string', required: true, description: "The user's request in their own words." },
      summary: { type: 'string', required: true, description: 'Draft one-line summary.' },
      description: { type: 'string', required: true, description: 'Draft description.' },
      acceptanceCriteria: { type: 'string', required: false, description: 'Lines "AC1 | statement | check".' },
    },
    good: { args: { request: 'Make statements faster', summary: 'Faster statements', description: 'Improve statement speed' }, why: 'It lints the draft against the request.' },
    bad: { args: { summary: 'Faster statements' }, why: 'The request and description are missing, so numbers cannot be checked.' },
  },
  'create-ticket': {
    kind: 'write',
    purpose: 'Creates a Jira work item with ACs and story points.',
    use: 'Only after the user confirmed the draft in this conversation.',
    avoid: 'Never before the user confirms. Never with a number, unit or threshold that is not in the request.',
    args: {
      request: { type: 'string', required: true, description: "The user's request in their own words." },
      projectKey: { type: 'string', required: true, description: 'The Jira project key, for example BANK.' },
      summary: { type: 'string', required: true, description: 'One-line summary.' },
      description: { type: 'string', required: true, description: 'Description with ACs.' },
      storyPoints: { type: 'number', required: true, description: 'One of 1, 2, 3, 5, 8, 13.' },
      acceptanceCriteria: { type: 'string', required: false, description: 'Lines "AC1 | statement | check".' },
      issueType: { type: 'string', required: false, description: 'Task, Story or Bug.' },
    },
    good: { args: { request: 'Statement misses the last day', projectKey: 'BANK', summary: 'Include the last day in statements', description: 'A customer sees deposits of the last day.', storyPoints: 2 }, why: 'After confirmation, with only numbers from the request.' },
    bad: { args: { request: 'Login should be faster', projectKey: 'BANK', summary: 'Login in 3 s', description: 'Loads in 3 s on 3G.', storyPoints: 3 }, why: 'Invents 3 s and 3G, and no confirmation.' },
  },
  'read-github-commit': {
    kind: 'read',
    purpose: 'Reads the latest commit of a public GitHub repository.',
    use: 'When the user asks about the latest commit of a repository.',
    avoid: 'Do not use it for verdicts or pull requests.',
    args: { repository: { type: 'string', required: false, description: 'owner/name, for example octocat/Hello-World.' } },
    good: { args: { repository: 'ysant77/yms-bank-demo' }, why: 'The repository the user named.' },
    bad: { args: { repository: 'BANK-4' }, why: 'An issue key is not a repository.' },
  },
  'get-verdicts': {
    kind: 'read',
    purpose: "Returns the verifier's verdicts, the arbitration case and the audit head for one work item.",
    use: 'When a user asks whether work is done, why a claim failed, or which pull request won.',
    avoid: 'Do not use it to change anything.',
    args: {
      issueKey: { type: 'string', required: true, description: 'The work item, for example BANK-4.' },
      limit: { type: 'number', required: false, description: 'How many of the latest verdicts, 1 to 20.' },
    },
    good: { args: { issueKey: 'BANK-4' }, why: 'The key the user named.' },
    bad: { args: { issueKey: 'PR 7' }, why: 'A pull request is not a work item key.' },
  },
  'open-case': {
    kind: 'write',
    purpose: 'Opens an arbitration case for two or three pull requests on one ticket and runs the fixed rule.',
    use: 'When two or three pull requests compete for one ticket.',
    avoid: 'Do not use it for one pull request, or to record a decision.',
    args: {
      issueKey: { type: 'string', required: true, description: 'The work item, for example BANK-32.' },
      prNumbers: { type: 'string', required: true, description: 'Two or three numbers, for example "12, 14".' },
      question: { type: 'string', required: false, description: 'winner, design, readability or manual_ac.' },
      domain: { type: 'string', required: false, description: 'Empty, or a high-stake domain that a human decides.' },
      metric: { type: 'string', required: false, description: 'The pre-registered CI report metric.' },
    },
    good: { args: { issueKey: 'BANK-32', prNumbers: '5, 7' }, why: 'Two pull requests on one ticket.' },
    bad: { args: { issueKey: 'BANK-32', prNumbers: '5' }, why: 'One pull request is no case.' },
  },
  'record-opinion': {
    kind: 'write',
    purpose: "Records the AI team lead's opinion on an open case. Code checks it; it never decides.",
    use: 'Only when open-case says an opinion is allowed.',
    avoid: 'Never for a side that failed a gate, never with ids or numbers that are not in the evidence.',
    args: {
      issueKey: { type: 'string', required: true, description: 'The work item with an open case.' },
      opinion: { type: 'string', required: true, description: 'One JSON object: decision, reasons with evidence ids, confidence, risks.' },
    },
    good: { args: { issueKey: 'BANK-32', opinion: '{"decision":"PR5","reasons":[{"text":"PR5 changes 12 lines (E2).","evidence":["E2"]}],"confidence":0.8,"risks":[]}' }, why: 'Cites evidence ids; numbers from the evidence.' },
    bad: { args: { issueKey: 'BANK-32', opinion: '{"decision":"PR9","reasons":[],"confidence":1}' }, why: 'PR9 is not a side, and no reasons.' },
  },
  'get-pr-diff': {
    kind: 'read',
    purpose: "Returns one pull request's patch hunks with hunk ids and line ranges, the ticket's ACs and the verifier's verdict.",
    use: 'Before a code review: when the verdict is cannot_verify, an AC is manual(), a case asks about design or readability, or a user asks.',
    avoid: 'Do not use it to decide whether work is done; get-verdicts reports the verdict.',
    args: {
      issueKey: { type: 'string', required: true, description: 'The work item, for example BANK-4.' },
      prNumber: { type: 'number', required: true, description: 'One pull request number, for example 61.' },
      trigger: { type: 'string', required: false, description: 'cannot_verify, manual_ac, design, readability or request.' },
    },
    good: { args: { issueKey: 'BANK-4', prNumber: 61, trigger: 'cannot_verify' }, why: 'The work item and the pull request the verdict names.' },
    bad: { args: { issueKey: 'PR 61', prNumber: 4 }, why: 'The key and the pull request number are swapped.' },
  },
  'record-review': {
    kind: 'write',
    purpose: 'Records a code review marked "not verified": findings tied to hunk ids, risks and proposed checks. Code checks it; it never decides.',
    use: 'Once after get-pr-diff, for the same work item and pull request.',
    avoid: 'Never with a verdict or an approval, never with a hunk id, line, AC id or number that is not in the get-pr-diff result.',
    args: {
      issueKey: { type: 'string', required: true, description: 'The work item, for example BANK-4.' },
      prNumber: { type: 'number', required: true, description: 'The pull request that get-pr-diff read.' },
      review: { type: 'string', required: true, description: 'One JSON object: findings, risks, proposedChecks.' },
    },
    good: { args: { issueKey: 'BANK-4', prNumber: 61, review: '{"findings":[{"hunk":"P61:H1","file":"src/bank/accounts.py","line":41,"text":"The lock in P61:H1 covers the balance check and the debit."}],"risks":[],"proposedChecks":[{"testName":"test_BANK4_concurrent_withdrawals_20_threads","file":"tests/test_concurrency.py","ac":"AC2","asserts":"20 threads withdraw at the same time.","failsBeforeFix":true}]}' }, why: 'Hunk id, line and AC from the packet; a new test for the manual AC.' },
    bad: { args: { issueKey: 'BANK-4', prNumber: 61, review: '{"approve":true,"findings":[{"hunk":"H1","file":"x","line":1,"text":"LGTM"}]}' }, why: 'Approves, and H1 is not a hunk id.' },
  },
};

// The local twins' tool list for Ollama's `tools` field, built from the specs.
export function ollamaTools(keys) {
  return keys.map((key) => {
    const s = TOOL_SPECS[key];
    const properties = Object.fromEntries(Object.entries(s.args).map(([name, a]) => [name, { type: a.type, description: a.description }]));
    const required = Object.entries(s.args).filter(([, a]) => a.required).map(([name]) => name);
    return {
      type: 'function',
      function: {
        name: key,
        description: `${s.purpose} Use: ${s.use} Avoid: ${s.avoid}`,
        parameters: { type: 'object', properties, required },
      },
    };
  });
}
