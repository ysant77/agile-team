import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, DynamicTable, Heading, Inline, Lozenge, SectionMessage, Stack, Text, TextArea, Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { VerdictSection } from './verdict-section.js';
import { SignOffSection } from './sign-off-section.js';
import { FindingSection } from './finding-section.js';
import { DraftSection } from './draft-section.js';
import { acEditorText } from '../ticket-spec.js';

const APPEARANCE = { supported: 'success', contradicted: 'removed', cannot_verify: 'moved' };

function App() {
  const [data, setData] = useState(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(null);
  const [adoptReason, setAdoptReason] = useState('');
  const [testName, setTestName] = useState('');
  const [testReason, setTestReason] = useState('');
  const [signReason, setSignReason] = useState('');
  const [signError, setSignError] = useState(null);
  const [acText, setAcText] = useState(null);
  const [prRef, setPrRef] = useState('');
  const [prReason, setPrReason] = useState('');
  const [findingRef, setFindingRef] = useState('');
  const [finding, setFinding] = useState(null);
  const [findingError, setFindingError] = useState(null);

  const [drafts, setDrafts] = useState([]);
  const [draftError, setDraftError] = useState(null);

  const load = () => invoke('getPanel').then(setData);
  const loadDrafts = () => invoke('getTicketDrafts').then((r) => setDrafts(r?.drafts ?? []));
  useEffect(() => {
    load();
    loadDrafts();
  }, []);

  if (!data) return <Text>Loading…</Text>;

  // A stored ticket draft is created or rejected only by the person who drafted it.
  const createDraft = async (draftId) => {
    const result = await invoke('confirmTicketDraft', { draftId });
    setDraftError(result.ok ? null : result.error);
    if (result.ok) setMessage({ appearance: 'success', text: `${result.duplicate ? 'Already created' : 'Created'}: ${result.key}.` });
    loadDrafts();
  };
  const rejectDraftNow = async (draftId) => {
    const result = await invoke('rejectTicketDraft', { draftId });
    setDraftError(result.ok ? null : result.error);
    loadDrafts();
  };
  const acs = data.spec?.acceptanceCriteria ?? [];

  const adopt = async (prNumber, testName) => {
    const result = await invoke('adoptCheck', { prNumber, testName, reason: adoptReason });
    setMessage(result.ok ? { appearance: 'success', text: `Check adopted. Audit seq ${result.auditSeq}. Comment the claim again to verify.` } : { appearance: 'error', text: result.error });
    if (result.ok) load();
  };

  const approve = async () => {
    const result = await invoke('approve', { reason });
    setMessage(result.ok ? { appearance: 'success', text: `Approved. Audit seq ${result.auditSeq}.` } : { appearance: 'error', text: result.error });
    if (result.ok) load();
  };

  // A person other than the claimant approves the removal or change of one old test. Only this
  // action counts for the verifier, not a list in the issue property.
  const approveTest = async (kind) => {
    const result = await invoke('approveTest', { kind, test: testName, reason: testReason });
    setMessage(result.ok ? { appearance: 'success', text: `Test ${kind} approved. Audit seq ${result.auditSeq}. Comment the claim again to verify.` } : { appearance: 'error', text: result.error });
    if (result.ok) { setTestName(''); setTestReason(''); }
  };

  // A person other than the claimant signs off the merged commit of the latest done claim. The
  // commit comes from that verdict; a refusal is shown in the section.
  const signOff = async () => {
    const result = await invoke('signOff', { reason: signReason });
    setSignError(result.ok ? null : result.error);
    setMessage(result.ok ? { appearance: 'success', text: `Signed off. Audit seq ${result.auditSeq}. Comment the claim again to verify.` } : null);
    if (result.ok) { setSignReason(''); load(); }
  };

  // A stored discovery finding, by its id (src/finding-view.js). Read only.
  const showFinding = async () => {
    const result = await invoke('getFinding', { findingId: findingRef });
    setFinding(result.ok ? result.view : null);
    setFindingError(result.ok ? null : result.error);
  };

  // Fresh-site path: a person types the AC lines and saves them; the app writes them and records
  // them with an audit event (src/ac-editor.js).
  const saveAcs = async () => {
    const result = await invoke('saveAcs', { text: acText ?? acEditorText(acs) });
    setMessage(result.ok ? { appearance: 'success', text: `${result.count} AC(s) saved and recorded. Audit seq ${result.acsAuditSeq}.` } : { appearance: 'error', text: result.error });
    if (result.ok) { setAcText(null); load(); }
  };

  // Fresh-site path: a person links the work item's PR; a claim counts the link only when the
  // claimant did not make it (src/pr-link.js).
  const linkPr = async () => {
    const result = await invoke('linkPr', { pr: prRef, reason: prReason });
    setMessage(result.ok ? { appearance: 'success', text: `PR #${result.prNumber} linked. Audit seq ${result.auditSeq}.` } : { appearance: 'error', text: result.error });
    if (result.ok) { setPrRef(''); setPrReason(''); load(); }
  };

  const recordAcs = async () => {
    const result = await invoke('recordAcs', {});
    setMessage(result.ok ? { appearance: 'success', text: `ACs recorded. Audit seq ${result.auditSeq}.` } : { appearance: 'error', text: result.error });
  };

  const view = data.view;
  return (
    <Stack space="space.200">
      <VerdictSection view={view} ui={{ Heading, Inline, Lozenge, SectionMessage, Stack, Text }} />
      <Heading as="h3">Acceptance criteria</Heading>
      {acs.length === 0 ? (
        <SectionMessage appearance="warning"><Text>No acceptance criteria with checks. A "done" claim will be contradicted.</Text></SectionMessage>
      ) : (
        <DynamicTable
          head={{ cells: [{ key: 'id', content: 'AC' }, { key: 's', content: 'Statement' }, { key: 'c', content: 'Check' }] }}
          rows={acs.map((a) => ({
            key: a.acId,
            cells: [
              { key: 'id', content: a.acId },
              { key: 's', content: a.statement },
              { key: 'c', content: `${a.check.type}(${(a.check.args ?? []).join(', ')})` },
            ],
          }))}
        />
      )}
      <Heading as="h3">Edit the acceptance criteria</Heading>
      <Text>One line for each AC: "AC1 | statement | test_passes(test_name)". Saving records them in your name.</Text>
      <Stack space="space.100">
        <TextArea value={acText ?? acEditorText(acs)} onChange={(e) => setAcText(e.target.value)} />
        <Inline><Button appearance="primary" onClick={saveAcs} isDisabled={!(acText ?? acEditorText(acs)).trim()}>Save and record</Button></Inline>
      </Stack>
      <Heading as="h3">Linked pull request</Heading>
      {data.prLink ? (
        <Text>PR #{data.prLink.prNumber}, linked by {data.prLink.by} (audit seq {data.prLink.auditSeq}){data.prLink.count > 1 ? `; ${data.prLink.count} links, the latest counts` : ''}. A claim counts it only when the claimant did not make it.</Text>
      ) : (
        <Text>No linked PR. A claim finds a PR whose title or branch names the work item key.</Text>
      )}
      <Stack space="space.100">
        <Textfield placeholder="PR number or GitHub URL" value={prRef} onChange={(e) => setPrRef(e.target.value)} />
        <TextArea placeholder="Reason (at least 5 characters)" value={prReason} onChange={(e) => setPrReason(e.target.value)} />
        <Inline><Button onClick={linkPr} isDisabled={!prRef.trim() || prReason.trim().length < 5}>Link PR</Button></Inline>
      </Stack>
      <Heading as="h3">Approval</Heading>
      {data.approval ? (
        <Text>Approved on {data.approval.at.slice(0, 10)}: {data.approval.reason}</Text>
      ) : (
        <Stack space="space.100">
          <TextArea placeholder="Reason for approval (at least 5 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Inline><Button appearance="primary" onClick={approve} isDisabled={reason.trim().length < 5}>Approve requirement</Button></Inline>
        </Stack>
      )}
      <Inline><Button onClick={recordAcs}>Record these ACs</Button></Inline>
      <SignOffSection panel={data.signoff} reason={signReason} onReason={setSignReason} onSignOff={signOff} error={signError}
        ui={{ Button, Heading, Inline, SectionMessage, Stack, Text, TextArea }} />
      <Heading as="h3">Approve an old test change</Heading>
      <Text>A person other than the claimant approves the removal or change of one old test. The issue property does not count.</Text>
      <Stack space="space.100">
        <Textfield placeholder="Test name, for example test_transfer_errors" value={testName} onChange={(e) => setTestName(e.target.value)} />
        <TextArea placeholder="Reason (at least 5 characters)" value={testReason} onChange={(e) => setTestReason(e.target.value)} />
        <Inline space="space.100">
          <Button onClick={() => approveTest('removal')} isDisabled={!testName.trim() || testReason.trim().length < 5}>Approve removal</Button>
          <Button onClick={() => approveTest('change')} isDisabled={!testName.trim() || testReason.trim().length < 5}>Approve change</Button>
        </Inline>
      </Stack>
      {message && <SectionMessage appearance={message.appearance}><Text>{message.text}</Text></SectionMessage>}
      <Heading as="h3">Reviews (not verified)</Heading>
      {(data.reviews ?? []).length === 0 ? (
        <Text>No reviews. Ask the Agile Code Reviewer when a check cannot decide.</Text>
      ) : (
        <Stack space="space.100">
          {[...data.reviews].reverse().slice(0, 5).map((r) => (
            <Box key={`${r.prNumber}-${r.at}`}>
              <Inline space="space.100">
                <Lozenge appearance={r.outcome === 'review' ? 'new' : 'removed'}>{r.outcome === 'review' ? 'review, not verified' : 'no valid review'}</Lozenge>
                <Text>PR #{r.prNumber} · {r.at.slice(0, 16).replace('T', ' ')}</Text>
              </Inline>
              {(r.review?.findings ?? []).map((f) => <Text key={`${f.hunk}-${f.line}`}>{f.hunk} {f.file}:{f.line}: {f.text}</Text>)}
              {(r.review?.risks ?? []).map((x) => <Text key={x}>Risk: {x}</Text>)}
              {(r.review?.proposedChecks ?? []).map((c) => (
                <Inline key={c.testName} space="space.100">
                  <Text>Proposed check for {c.ac}: {c.testName}. It must assert: {c.asserts}</Text>
                  {r.outcome === 'review' && <Button onClick={() => adopt(r.prNumber, c.testName)} isDisabled={adoptReason.trim().length < 5}>Adopt check</Button>}
                </Inline>
              ))}
            </Box>
          ))}
          <TextArea placeholder="Reason to adopt a proposed check (at least 5 characters)" value={adoptReason} onChange={(e) => setAdoptReason(e.target.value)} />
        </Stack>
      )}
      <Heading as="h3">Verdicts</Heading>
      {data.verdicts.length === 0 ? (
        <Text>No claims yet. Comment "claim: fixed" or "claim: done" to verify.</Text>
      ) : (
        <Stack space="space.100">
          {[...data.verdicts].reverse().slice(0, 10).map((v) => (
            <Box key={`${v.claimId}-${v.at}`}>
              <Inline space="space.100">
                <Lozenge appearance={APPEARANCE[v.result] ?? 'default'}>{v.result.replace('_', ' ')}</Lozenge>
                <Text>{v.type} · {v.at.slice(0, 16).replace('T', ' ')}</Text>
              </Inline>
              <Text>{v.reason}</Text>
            </Box>
          ))}
        </Stack>
      )}
      <DraftSection drafts={drafts} onCreate={createDraft} onReject={rejectDraftNow} error={draftError}
        ui={{ Box, Button, Heading, Inline, SectionMessage, Stack, Text }} />
      <FindingSection view={finding} findingRef={findingRef} onRef={setFindingRef} onShow={showFinding} error={findingError}
        ui={{ Button, Heading, Inline, SectionMessage, Stack, Text, Textfield }} />
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
