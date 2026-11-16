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

  const load = () => invoke('getPanel').then(setData);
  useEffect(() => {
    load();
  }, []);

  if (!data) return <Text>Loading…</Text>;
  const acs = data.spec?.acceptanceCriteria ?? [];

  const approve = async () => {
    const result = await invoke('approve', { reason });
    setMessage(result.ok ? { appearance: 'success', text: `Approved. Audit seq ${result.auditSeq}.` } : { appearance: 'error', text: result.error });
    if (result.ok) load();
  };

  return (
    <Stack space="space.200">
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
