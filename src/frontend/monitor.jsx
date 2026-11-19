import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button, DynamicTable, Heading, Inline, Lozenge, SectionMessage, Stack, Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const APPEARANCE = { supported: 'success', contradicted: 'removed', cannot_verify: 'moved' };

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => invoke('getMonitor').then(setData).catch((e) => setError(String(e?.message ?? e)));
  useEffect(() => {
    load();
  }, []);

  if (error) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!data) return <Text>Loading…</Text>;

  return (
    <Stack space="space.300">
      <Heading as="h2">Agile team monitor</Heading>
      <Heading as="h3">Audit chain</Heading>
      {data.chain.ok ? (
        <SectionMessage appearance="success">
          <Text>Chain verified to seq {data.chain.headSeq ?? '-'} ({data.chain.length} events). Head hash {String(data.chain.head).slice(0, 16)}.</Text>
        </SectionMessage>
      ) : (
        <SectionMessage appearance="error">
          <Text>Chain check failed at seq {data.chain.at}: {data.chain.reason}.</Text>
        </SectionMessage>
      )}
      {data.truncated && <Text>The page read only the first 2000 events.</Text>}

      <Heading as="h3">Runs (tickets with claims)</Heading>
      <DynamicTable
        head={{ cells: [
          { key: 'k', content: 'Ticket' }, { key: 'o', content: 'Scripted or live' }, { key: 't', content: 'Twin' },
          { key: 's', content: 'Skill' }, { key: 'c', content: 'Claims, in order' }, { key: 'r', content: 'Reward' },
        ] }}
        rows={data.tickets.map((t) => ({
          key: t.issueKey,
          cells: [
            { key: 'k', content: t.issueKey },
            { key: 'o', content: t.origin ?? 'unknown' },
            { key: 't', content: t.twin ?? '-' },
            { key: 's', content: t.skill ?? 'general' },
            { key: 'c', content: (
              <Inline space="space.050">
                {t.claims.map((c) => (
                  <Lozenge key={c.seq} appearance={APPEARANCE[c.result] ?? 'default'}>{`${c.type}: ${c.state === 'held' ? 'held by review' : c.result.replace('_', ' ')} (seq ${c.seq})`}</Lozenge>
                ))}
              </Inline>
            ) },
            { key: 'r', content: t.reward === null ? 'open' : String(t.reward) },
          ],
        }))}
        emptyView="No verdicts yet."
      />

      <Heading as="h3">Human decisions on arbitration cases</Heading>
      <DynamicTable
        head={{ cells: [
          { key: 'k', content: 'Ticket' }, { key: 'd', content: 'Decision' }, { key: 'b', content: 'By (account id)' },
          { key: 'c', content: 'Code decision' }, { key: 'o', content: 'Opinion' }, { key: 'a', content: 'PR author check' },
          { key: 's', content: 'Audit seq' },
        ] }}
        rows={data.decisions.map((d) => ({
          key: String(d.seq),
          cells: [
            { key: 'k', content: d.issueKey },
            { key: 'd', content: `${d.side}${d.overridesFailedGate ? ' (failed a gate)' : ''}` },
            { key: 'b', content: d.by ?? 'unknown' },
            { key: 'c', content: d.agreesWithCode === null ? 'none' : d.agreesWithCode ? 'agrees' : 'overridden' },
            { key: 'o', content: d.agreesWithOpinion === null ? 'none' : d.agreesWithOpinion ? 'agrees' : 'differs' },
            { key: 'a', content: d.authorCheck === 'passed' ? 'not a PR author' : 'not compared (no account link)' },
            { key: 's', content: String(d.seq) },
          ],
        }))}
        emptyView="No human decisions yet."
      />
      <Text>The claimant of the latest claim cannot record a decision. A PR author is refused only when GITHUB_ACCOUNTS links the decider; otherwise the table says "not compared". The table shows the author's account id.</Text>

      <Heading as="h3">Assignment posterior per twin and skill</Heading>
      <Text>{`Recorded outcomes: ${data.outcomes}. Reward r = 0.4 x on_time + 0.6 x quality; decay 0.95; Beta(1, 1) prior.`}</Text>
      <DynamicTable
        head={{ cells: [
          { key: 's', content: 'Skill' }, { key: 't', content: 'Twin' }, { key: 'm', content: 'Posterior mean' },
          { key: 'a', content: 'alpha / beta' }, { key: 'n', content: 'Outcomes' },
        ] }}
        rows={data.posteriors.map((p) => ({
          key: `${p.twin}|${p.skill}`,
          cells: [
            { key: 's', content: p.skill }, { key: 't', content: p.twin }, { key: 'm', content: String(p.mean) },
            { key: 'a', content: `${p.alpha} / ${p.beta}` }, { key: 'n', content: String(p.outcomes) },
          ],
        }))}
        emptyView="No closed tickets with a twin yet."
      />
      <Stack space="space.050">
        {data.notes.map((n) => <Text key={n}>{n}</Text>)}
      </Stack>
      <Inline><Button onClick={load}>Refresh</Button></Inline>
      <Text>{`Read at ${data.readAt.slice(0, 19).replace('T', ' ')} UTC.`}</Text>
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
