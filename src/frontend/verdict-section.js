// The verdict section of the issue panel (src/verdict-view.js gives the view model). Written with
// React.createElement, not JSX, and given the UI Kit components as an argument, so a unit test
// can build the element tree and read every text a person sees (test/panel-render.test.js).

import React from 'react';

const h = React.createElement;

export function VerdictSection({ view, ui }) {
  const { Heading, Inline, Lozenge, SectionMessage, Stack, Text } = ui;
  if (!view) {
    return h(Stack, { space: 'space.100' },
      h(Heading, { as: 'h3' }, 'Verdict'),
      h(Text, null, 'No verdict yet. Comment "claim: fixed" or "claim: done" to verify.'));
  }
  const at = (view.meta.at ?? '').slice(0, 16).replace('T', ' ');
  const lines = (prefix, list) => list.map((line) => h(Text, { key: `${prefix}-${line}` }, line));
  return h(Stack, { space: 'space.100' },
    h(Heading, { as: 'h3' }, 'Verdict'),
    h(Inline, { space: 'space.100' },
      h(Lozenge, { appearance: view.tone, isBold: true }, view.label),
      h(Text, null, `${view.meta.claim ?? 'claim'} · head ${view.meta.head ?? 'unknown'} · ${at}`)),
    h(Text, { weight: 'bold' }, view.headline),
    h(Text, null, `Why: ${view.why}`),
    h(Heading, { as: 'h4' }, 'Evidence levels'),
    ...(view.levels ?? []).map((l) => h(Text, { key: `l-${l.level}` }, `${l.level}: ${l.status}. ${l.detail}`)),
    h(Heading, { as: 'h4' }, 'What was proved'),
    ...(view.proved.length === 0 ? [h(Text, { key: 'p-none' }, 'Nothing was proved.')] : lines('p', view.proved)),
    ...(view.failed.length > 0 ? [h(Heading, { as: 'h4', key: 'f-head' }, 'What failed'), ...lines('f', view.failed)] : []),
    h(Heading, { as: 'h4' }, 'What was not checked'),
    ...lines('n', view.notChecked),
    h(SectionMessage, { appearance: 'information' }, h(Text, null, view.meaning)),
    // The model's advice is apart from the verdict and is not counted (src/review-advice.js).
    ...(view.advice ? [h(Heading, { as: 'h4', key: 'a-head' }, view.advice.heading), h(Text, { key: 'a-note' }, view.advice.note), ...lines('a', view.advice.lines)] : []),
    h(Heading, { as: 'h4' }, 'Human decision'),
    h(Text, null, view.human),
    h(Text, null, `Verdict set by code (checker ${view.meta.checker ?? 'unknown'}). Agents explain it; only a person decides.`));
}
