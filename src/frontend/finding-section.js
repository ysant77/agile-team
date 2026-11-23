// The discovery finding section of the issue panel (src/finding-view.js gives the view). Written
// with React.createElement and given the UI Kit components as an argument, so a unit test can read
// every text a person sees (test/panel-finding.test.js).

import React from 'react';

const h = React.createElement;

export function FindingSection({ view, findingRef, onRef, onShow, error, ui }) {
  const { Button, Heading, Inline, SectionMessage, Stack, Text, Textfield } = ui;
  const v = view;
  const list = (name, items) => `${name}: ${items.length ? items.join(', ') : 'none'}`;
  return h(Stack, { space: 'space.100' },
    h(Heading, { as: 'h3' }, 'Discovery finding'),
    h(Text, null, 'A finding from the investigation of a symptom. It stays unconfirmed until a CI report shows that its reproducer fails on base.'),
    h(Textfield, { placeholder: 'Finding id (F-...)', value: findingRef, onChange: (e) => onRef(e.target.value) }),
    h(Inline, null, h(Button, { onClick: onShow, isDisabled: !String(findingRef ?? '').trim() }, 'Show finding')),
    error ? h(SectionMessage, { key: 'error', appearance: 'error' }, h(Text, null, error)) : null,
    v ? h(Stack, { key: 'finding', space: 'space.050' },
      h(Text, { key: 'title' }, v.title),
      h(Text, { key: 'symptom' }, `Symptom: ${v.symptom}`),
      h(Text, { key: 'hypothesis' }, `Hypothesis: ${v.hypothesis}`),
      h(Text, { key: 'rules' }, list('Rule cited', v.ruleCitations)),
      h(Text, { key: 'code' }, list('Code cited', v.codeCitations)),
      v.reproducer ? h(Text, { key: 'repro' }, `Reproducer: ${v.reproducer}`) : null,
      v.severity ? h(Text, { key: 'severity' }, v.severity) : null,
      v.noRuleNote ? h(Text, { key: 'norule' }, v.noRuleNote) : null,
      v.ruleQuestion ? h(SectionMessage, { key: 'question', appearance: 'warning' }, h(Text, null, v.ruleQuestion)) : null,
      ...v.openQuestions.map((q, i) => h(Text, { key: `q${i}` }, `Open question: ${q}`)),
      h(Text, { key: 'read' }, v.readAt)) : null);
}
