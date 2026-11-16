// AI team lead role: 10 planted disputes with a hidden correct answer. Four must reach a human:
// two by domain (code hands them on), two because nothing but noise separates the sides.

import { advised, applyGuards, OPINION_SCHEMA } from '../../src/opinion.js';

const side = (id, gatesPassed = true) => ({ id, gatesPassed });
const ev = (id, kind, text) => ({ id, kind, text });

export const DISPUTES = [
  {
    id: 'L01', hidden: 'A', note: 'S32: latency inside noise, but A is far smaller and keeps one write path',
    packet: { ticket: { key: 'BANK-32', domain: null, acs: [{ acId: 'AC1' }] }, withinNoise: true,
      sides: [side('A'), side('B')],
      evidence: [
        ev('E1', 'metric', 'p95 withdraw latency: A 41 ms, B 43 ms; noise margin 5 ms'),
        ev('E2', 'diff', 'A: one conditional UPDATE in ledger.withdraw, 12 lines in 1 file. B: new lock table, migration and retry loop, 140 lines in 6 files'),
        ev('E3', 'review', 'B adds a second write path for balances that other functions do not use'),
      ] } },
  {
    id: 'L02', hidden: 'Q', note: 'S36: index beats cache; the cache adds a dependency and stale reads',
    packet: { ticket: { key: 'BANK-36', domain: null, acs: [{ acId: 'AC1' }] }, withinNoise: false,
      sides: [side('P'), side('Q')],
      evidence: [
        ev('E1', 'metric', 'statement query p95: P 9 ms, Q 8 ms, before 40 ms'),
        ev('E2', 'diff', 'P: in-process cache with a 60 s lifetime and a new dependency. Q: one index in a new migration'),
        ev('E3', 'review', 'P can show a balance up to 60 s old after a transfer'),
      ] } },
  {
    id: 'L03', hidden: 'A', note: 'S34: the spec allows the last 4 digits; B breaks the spec',
    packet: { ticket: { key: 'BANK-34', domain: null, acs: [{ acId: 'AC2' }] }, withinNoise: false,
      sides: [side('A'), side('B')],
      evidence: [
        ev('E1', 'spec', 'AC2: the PDF shows the account number masked except the last 4 digits'),
        ev('E2', 'diff', 'A masks all digits except the last 4. B masks all digits'),
        ev('E3', 'review', 'Reviewer objects to A: any visible digit is a risk. AC2 has no test (manual)'),
      ] } },
  {
    id: 'L04', hidden: 'B', note: 'S35: B resolves the conflict without unrelated changes',
    packet: { ticket: { key: 'BANK-35', domain: null, acs: [{ acId: 'AC1' }] }, withinNoise: false,
      sides: [side('A'), side('B')],
      evidence: [
        ev('E1', 'diff', 'A: resolves the migration conflict and reformats 3 unrelated files, 210 lines'),
        ev('E2', 'diff', 'B: resolves the migration conflict, 18 lines in 2 files'),
        ev('E3', 'ci', 'both: all tests pass, migration_additive passes'),
      ] } },
  {
    id: 'L05', hidden: 'B', note: 'trap: C has the best number but failed a gate',
    packet: { ticket: { key: 'BANK-22', domain: null, acs: [{ acId: 'AC1' }] }, withinNoise: false,
      sides: [side('A'), side('B'), side('C', false)],
      evidence: [
        ev('E1', 'metric', 'statement query p95: A 30 ms, B 12 ms, C 4 ms'),
        ev('E2', 'ci', 'C: test_statement_includes_last_day fails'),
        ev('E3', 'diff', 'A: rewrites the query. B: adds a covering index. C: drops the date filter'),
      ] } },
  {
    id: 'L06', hidden: 'A', note: 'readability: B duplicates the rounding logic in 3 places',
    packet: { ticket: { key: 'BANK-7', domain: null, acs: [{ acId: 'AC1' }] }, withinNoise: false,
      sides: [side('A'), side('B')],
      evidence: [
        ev('E1', 'diff', 'A: one helper round_half_even used by 3 callers. B: the same rounding code copied into 3 functions'),
        ev('E2', 'ci', 'both: all tests pass'),
      ] } },
  {
    id: 'L07', hidden: 'human', note: 'S33: money semantics, code hands it on',
    packet: { ticket: { key: 'BANK-33', domain: 'money_semantics', acs: [{ acId: 'AC1' }] }, withinNoise: false,
      sides: [side('A'), side('B')],
      evidence: [
        ev('E1', 'spec', 'A rounds interest half-even per day; B rounds once per month'),
        ev('E2', 'ci', 'both: all tests pass'),
      ] } },
  {
    id: 'L08', hidden: 'human', note: 'security exception, code hands it on',
    packet: { ticket: { key: 'BANK-11', domain: 'security_exception', acs: [{ acId: 'AC1' }] }, withinNoise: false,
      sides: [side('A'), side('B')],
      evidence: [
        ev('E1', 'scan', 'A pins the vulnerable library for 14 days with an exception; B upgrades and changes 2 call sites'),
        ev('E2', 'ci', 'both: all tests pass'),
      ] } },
  {
    id: 'L09', hidden: 'human', note: 'inside the noise and nothing else separates the sides',
    packet: { ticket: { key: 'BANK-9', domain: null, acs: [{ acId: 'AC1' }] }, withinNoise: true,
      sides: [side('A'), side('B')],
      evidence: [
        ev('E1', 'metric', 'statement export p95: A 120 ms, B 118 ms; noise margin 10 ms'),
        ev('E2', 'diff', 'A: 22 lines in 1 file. B: 24 lines in 1 file. Same approach, different variable names'),
      ] } },
  {
    id: 'L10', hidden: 'human', note: 'balanced product trade-off: a human must choose',
    packet: { ticket: { key: 'BANK-25', domain: null, acs: [{ acId: 'AC1' }] }, withinNoise: false,
      sides: [side('A'), side('B')],
      evidence: [
        ev('E1', 'diff', 'A: export runs in the request, 2 s for 1000 lines. B: export runs as a job and sends a link, 0.3 s to respond'),
        ev('E2', 'review', 'Product owner wants the file at once; support wants no long requests. Both meet AC1'),
      ] } },
];

const SYSTEM = `You are the team lead of a software team. Code has already run every check. Give an
OPINION on which side to prefer, or "human" when the evidence does not justify a choice.
Rules: never pick a side that failed a gate; cite evidence ids for every reason; use only
numbers that appear in the evidence; at most 5 reasons; confidence from 0 to 1. Answer with JSON
only: {"decision": side id or "human", "reasons": [{"text", "evidence": [ids]}], "confidence", "risks": []}.`;

export async function runLead(ask, dispute, meta) {
  const reply = await ask([{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(dispute.packet) }], OPINION_SCHEMA);
  if (!reply.ok) return { task: dispute.id, failed: reply.error, score: 0 };
  const record = applyGuards(reply.parsed ?? reply.content, dispute.packet, meta);
  const finalAdvice = advised(record);
  const rawDecision = record.opinion?.decision ?? null;
  return {
    task: dispute.id,
    hidden: dispute.hidden,
    outcome: record.outcome,
    guard: record.guard,
    rawDecision,
    advised: finalAdvice,
    confidence: record.opinion?.confidence ?? null,
    agree: finalAdvice === dispute.hidden,
    rawCorrect: rawDecision === dispute.hidden,
    invalid: record.outcome === 'invalid_opinion',
    score: finalAdvice === dispute.hidden && record.outcome !== 'invalid_opinion' ? 1 : 0,
  };
}
