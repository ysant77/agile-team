// The sign-off section of the issue panel (src/sign-off.js gives the model). Written with
// React.createElement and given the UI Kit components as an argument, so a unit test can read
// every text a person sees (test/panel-sign-off.test.js).

import React from 'react';

const h = React.createElement;

export function SignOffSection({ panel, reason, onReason, onSignOff, error, ui }) {
  if (!panel) return null;
  const { Button, Heading, Inline, SectionMessage, Stack, Text, TextArea } = ui;
  const s = panel.signed;
  const open = panel.needed && !(s && s.current);
  return h(Stack, { space: 'space.100' },
    h(Heading, { as: 'h3' }, 'Sign-off of the merged change'),
    s ? h(Text, { key: 'signed' }, `Signed off by ${s.by} for commit ${s.sha7} on ${s.date}. Audit seq ${s.auditSeq}.${s.current ? '' : ' This is not the merged commit of the latest claim.'}`) : null,
    open && panel.mergeSha ? h(Text, { key: 'commit' }, `Merged commit ${panel.mergeSha.slice(0, 7)}. The person who made the claim cannot sign off.`) : null,
    open && !panel.mergeSha ? h(Text, { key: 'nocommit' }, 'The latest "done" claim has no merged commit yet.') : null,
    error ? h(SectionMessage, { key: 'error', appearance: 'error' }, h(Text, null, error)) : null,
    open ? h(Stack, { key: 'form', space: 'space.100' },
      h(TextArea, { placeholder: 'Reason for the sign-off (at least 5 characters)', value: reason, onChange: (e) => onReason(e.target.value) }),
      h(Inline, null, h(Button, { appearance: 'primary', onClick: onSignOff, isDisabled: String(reason ?? '').trim().length < 5 || !panel.mergeSha }, 'Sign off the merged change'))) : null);
}
