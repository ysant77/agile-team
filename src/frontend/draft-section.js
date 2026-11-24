// The ticket drafts that wait for the person who made them (src/ticket-draft.js). Written with
// React.createElement and given the UI Kit components as an argument, so a unit test can read
// every text a person sees (test/panel-drafts.test.js). The request text is shown beside the
// draft, so the person can compare what was asked with what will be created.

import React from 'react';

const h = React.createElement;

export function DraftSection({ drafts, onCreate, onReject, error, ui }) {
  const { Box, Button, Heading, Inline, SectionMessage, Stack, Text } = ui;
  if (!Array.isArray(drafts) || drafts.length === 0) return null;
  return h(Stack, { space: 'space.100' },
    h(Heading, { as: 'h3' }, 'Drafts waiting for you'),
    h(Text, null, 'The agent drafted these work items. A draft with a number, a currency or a money label is created only when you press Create here. Check each value against the request.'),
    error ? h(SectionMessage, { key: 'error', appearance: 'error' }, h(Text, null, error)) : null,
    ...drafts.map((d) => h(Box, { key: d.draftId },
      h(Text, { key: 'title' }, `${d.draft.projectKey} ${d.draft.issueType}: ${d.draft.summary}`),
      h(Text, { key: 'request' }, `Request: ${d.request}`),
      d.draft.description ? h(Text, { key: 'desc' }, `Description: ${d.draft.description}`) : null,
      ...(d.draft.acceptanceCriteria ?? []).map((a, i) => h(Text, { key: `ac${i}` }, `${a.acId ?? `AC${i + 1}`}: ${a.text}`)),
      h(Text, { key: 'why' }, `Needs your confirmation: it states ${d.why.join(' and ')}. Expires ${new Date(d.expiresAt).toISOString().slice(0, 16).replace('T', ' ')} UTC.`),
      h(Inline, { key: 'buttons', space: 'space.100' },
        h(Button, { appearance: 'primary', onClick: () => onCreate(d.draftId) }, 'Create'),
        h(Button, { onClick: () => onReject(d.draftId) }, 'Reject')))));
}
