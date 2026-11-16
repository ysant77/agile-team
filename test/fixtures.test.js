import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { arbitrate } from '../src/arbitration.js';
import { nextEvent, verifyChain } from '../src/audit.js';
import { propose, reward, seededRng } from '../src/assignment.js';
import { lintRequirement } from '../src/lint.js';
import { adoptProposal, applyReviewGuards, buildReviewPacket } from '../src/review.js';
import { verify } from '../src/verifier/verdict.js';

const dir = new URL('../fixtures/', import.meta.url);
const defaults = JSON.parse(readFileSync(new URL('_defaults.json', dir), 'utf8'));

function merge(base, over) {
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? merge(out[k], v) : v;
  return out;
}

const WF = defaults.baseWorkflowFiles;
// Reports in fixtures may omit workflow_files; they then match the base (unchanged workflows).
function withWorkflowFiles(report) {
  return report && !report.workflow_files ? { ...report, workflow_files: WF } : report;
}

const runners = {
  verify(step) {
    const ctx = merge(defaults, step.context);
    for (const key of ['report', 'baseReport', 'mergeReport']) ctx[key] = withWorkflowFiles(ctx[key]);
    // Fixtures record no comment times: the report comment is taken as written at the start of
    // the first pinned run, inside the window the verifier accepts.
    if (!step.context.reportComment) {
      const run = (ctx.workflowRuns ?? []).find((r) => r.headSha === ctx.pr?.headSha);
      if (run) ctx.reportComment = { createdAt: run.createdAt, updatedAt: run.createdAt };
    }
    const verdict = verify(step.claim, ctx);
    assert.equal(verdict.result, step.expect.result, verdict.reason);
    for (const text of step.expect.reasonIncludes ?? []) {
      assert.ok(verdict.reason.includes(text), `reason "${verdict.reason}" lacks "${text}"`);
    }
  },
  arbitrate(step) {
    const d = arbitrate(step.ticket, step.sides);
    assert.equal(d.decidedBy, step.expect.decidedBy, d.reason);
    assert.equal(d.winner, step.expect.winner ?? null, d.reason);
  },
  lint(step) {
    const r = lintRequirement(step.draft, step.sources ?? []);
    assert.equal(r.pass, step.expect.pass, JSON.stringify(r.findings));
    for (const rule of step.expect.rules ?? []) {
      assert.ok(r.findings.some((f) => f.rule === rule), `missing finding ${rule}`);
    }
  },
  assign(step) {
    const proposals = propose(step.tickets, step.twins, seededRng(step.seed ?? 1));
    for (const [ticket, twin] of Object.entries(step.expect.assignments)) {
      const p = proposals.find((x) => x.ticket === ticket);
      assert.equal(p?.twin ?? null, twin, p?.reason);
    }
  },
  reward(step) {
    assert.equal(reward(step.input), step.expect.r);
  },
  audit(step) {
    let prev = null;
    const events = step.events.map((e) => (prev = nextEvent(prev, e)));
    if (step.tamper) events[step.tamper.index].data = step.tamper.data;
    assert.equal(verifyChain(events).ok, step.expect.ok);
  },
  // DESIGN 14a: code checks the review; the review never reaches a verdict.
  review(step, fixture) {
    const input = typeof step.packet === 'string' ? fixture.packets[step.packet] : step.packet;
    const record = applyReviewGuards(step.review, buildReviewPacket(input));
    assert.equal(record.outcome, step.expect.outcome, JSON.stringify(record.reasons));
    if (step.expect.guard) assert.equal(record.guard, step.expect.guard);
  },
  // A human adopts a proposed check: the AC now names the test, and the verifier decides.
  adopt(step) {
    const ctx = merge(defaults, step.context);
    ctx.report = withWorkflowFiles(ctx.report);
    ctx.ticket = adoptProposal(ctx.ticket, step.proposal);
    const verdict = verify(step.claim, ctx);
    assert.equal(verdict.result, step.expect.result, verdict.reason);
    for (const text of step.expect.reasonIncludes ?? []) assert.ok(verdict.reason.includes(text), verdict.reason);
  },
  agent(step) {
    assert.ok(typeof step.expect.refuses === 'boolean', 'agent steps state whether the agent refuses');
  },
};

const files = readdirSync(dir).filter((f) => /^S\d{2}\.json$/.test(f)).sort();

for (const file of files) {
  const fixture = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  fixture.steps.forEach((step, i) => {
    test(`${fixture.scenario} step ${i + 1} (${step.kind}): ${fixture.title}`, () => {
      const run = runners[step.kind];
      assert.ok(run, `unknown step kind ${step.kind}`);
      run(step, fixture);
    });
  });
}
