import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, DynamicTable, Heading, Inline, Lozenge, SectionMessage, Stack, Text, TextArea,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const APPEARANCE = { supported: 'success', contradicted: 'removed', cannot_verify: 'moved' };

function App() {
  const [data, setData] = useState(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(null);
  const [adoptReason, setAdoptReason] = useState('');

  const load = () => invoke('getPanel').then(setData);
  useEffect(() => {
    load();
  }, []);

  if (!data) return <Text>Loading…</Text>;
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

  const view = data.view;
  return (
    <Stack space="space.200">
      <Heading as="h3">Verdict</Heading>
      {!view ? (
        <Text>No verdict yet. Comment "claim: fixed" or "claim: done" to verify.</Text>
      ) : (
        <Stack space="space.100">
          <Inline space="space.100">
            <Lozenge appearance={view.tone} isBold>{view.label}</Lozenge>
            <Text>{view.meta.claim ?? 'claim'} · head {view.meta.head ?? 'unknown'} · {(view.meta.at ?? '').slice(0, 16).replace('T', ' ')}</Text>
          </Inline>
          <Text weight="bold">{view.headline}</Text>
          <Text>Why: {view.why}</Text>
          <Heading as="h4">What was proved</Heading>
          {view.proved.length === 0 ? <Text>Nothing was proved.</Text> : view.proved.map((line) => <Text key={`p-${line}`}>{line}</Text>)}
          {view.failed.length > 0 && <Heading as="h4">What failed</Heading>}
          {view.failed.map((line) => <Text key={`f-${line}`}>{line}</Text>)}
          <Heading as="h4">What was not checked</Heading>
          {view.notChecked.map((line) => <Text key={`n-${line}`}>{line}</Text>)}
          <SectionMessage appearance="information"><Text>{view.meaning}</Text></SectionMessage>
          <Heading as="h4">Human decision</Heading>
          <Text>{view.human}</Text>
          <Text>Verdict set by code (checker {view.meta.checker ?? 'unknown'}). Agents explain it; only a person decides.</Text>
        </Stack>
      )}
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
      <Heading as="h3">Approval</Heading>
      {data.approval ? (
        <Text>Approved on {data.approval.at.slice(0, 10)}: {data.approval.reason}</Text>
      ) : (
        <Stack space="space.100">
          <TextArea placeholder="Reason for approval (at least 5 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Inline><Button appearance="primary" onClick={approve} isDisabled={reason.trim().length < 5}>Approve requirement</Button></Inline>
        </Stack>
      )}
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
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
