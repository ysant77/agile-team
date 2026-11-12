// Pure helpers. No Forge imports, so they run under `node --test`.

export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text ?? '';
  const parts = (node.content ?? []).map(adfToText);
  const block = ['paragraph', 'heading', 'listItem', 'codeBlock'].includes(node.type);
  return parts.join('') + (block ? '\n' : '');
}

export function textToAdf(text) {
  return {
    type: 'doc',
    version: 1,
    content: String(text)
      .split('\n')
      .map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
      })),
  };
}

// A claim comment starts with "claim:" followed by a claim word, for example "claim: fixed".
const CLAIM_RE = /^\s*claim:\s*([a-z_]+)\b(.*)$/is;

export function parseClaim(text) {
  const match = CLAIM_RE.exec(text ?? '');
  if (!match) return null;
  return { type: match[1].toLowerCase(), detail: match[2].trim() };
}

const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export function parseRepository(value, fallback = 'octocat/Hello-World') {
  const repo = (value ?? '').trim() || fallback;
  if (!REPO_RE.test(repo)) throw new Error(`Invalid repository name: ${repo}`);
  return repo;
}

export const STORY_POINT_VALUES = [1, 2, 3, 5, 8, 13];

export function checkStoryPoints(value) {
  const points = Number(value);
  if (!STORY_POINT_VALUES.includes(points)) {
    throw new Error(`Story points must be one of ${STORY_POINT_VALUES.join(', ')}; got ${value}`);
  }
  return points;
}
