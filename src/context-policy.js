// Read-only code context for a model, decided by code. The model asks for a call (a tool name and
// arguments); this module allows or refuses it. It never reads a file's content, never writes,
// never runs a shell and never uses the network: a caller reads only after an "allow".
//
// Rules:
// - Only the tools in CONTEXT_TOOLS, with exactly their arguments and types.
// - Every path is resolved, symlinks too, and must stay inside the given repository root.
// - Secret files and folders are refused (.git, .env*, keys, credentials; see SECRET_PARTS).
// - A file over the size limit is refused.
// - Every decision is logged with its reason.
// - A tool that is not on the list is refused. Its name and argument keys are kept as a proposal
//   for a person; nothing is installed or downloaded.
//
// Not wired into the reviewer: that is a reviewer change and needs the arm D regression and a new
// blind set first.

import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const CONTEXT_TOOLS = {
  read_file: { args: { path: { type: 'path', required: true } }, needs: 'file' },
  list_dir: { args: { path: { type: 'path', required: false } }, needs: 'folder' },
  search_symbol: { args: { name: { type: 'identifier', required: true }, path: { type: 'path', required: false } }, needs: 'folder' },
};

export const DEFAULT_MAX_BYTES = 200_000;

// Names that write, run a command or use the network. Refused with their own reason.
const WRITE_LIKE = /(write|edit|delete|remove|rm|move|rename|create|put|post|patch|push|commit|exec|shell|run|spawn|command|http|fetch|url|download|upload|install|curl|wget|net)/i;

// A path part (any folder or the file) that matches one of these is a secret.
const SECRET_PARTS = [
  /^\.git$/, /^\.env($|\.)/i, /\.pem$/i, /\.key$/i, /^id_(rsa|dsa|ecdsa|ed25519)/i, /credential/i,
  /\.(p12|pfx|jks|keystore|kdbx|asc|gpg)$/i, /^\.(ssh|aws|gnupg|docker)$/i, /^\.(npmrc|pypirc|netrc|pgpass)$/i,
  /^secrets?($|\.)/i, /token/i, /\.tfstate$/i,
];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]{0,127}$/;

function secretPart(rel) {
  return rel.split(sep).find((part) => SECRET_PARTS.some((re) => re.test(part))) ?? null;
}

function checkArgs(spec, args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return 'arguments must be an object';
  for (const key of Object.keys(args)) if (!Object.hasOwn(spec.args, key)) return `unknown argument ${key}`;
  for (const [key, a] of Object.entries(spec.args)) {
    if (!Object.hasOwn(args, key)) {
      if (a.required) return `${key} is required`;
      continue;
    }
    const v = args[key];
    if (a.type === 'path' && (typeof v !== 'string' || !v.trim() || v.includes('\0'))) return `${key} must be a string path`;
    if (a.type === 'identifier' && (typeof v !== 'string' || !IDENTIFIER.test(v))) return `${key} must be an identifier`;
  }
  return null;
}

// Resolves a requested path against the root. Returns { rel } or { error }.
function resolvePath(rootReal, requested, needs, maxBytes) {
  const asked = resolve(rootReal, requested);
  const askedRel = relative(rootReal, asked);
  if (askedRel.startsWith('..') || isAbsolute(askedRel)) return { error: 'path is outside the repository' };
  let real;
  try {
    real = realpathSync(asked);
  } catch {
    // A missing path inside the repository. A missing path through a symlink out of it is
    // reported the same way only after the parts that exist are checked.
    return { error: 'path not found' };
  }
  const rel = relative(rootReal, real);
  if (rel.startsWith('..') || isAbsolute(rel)) return { error: 'path is outside the repository (after symlinks)' };
  for (const r of [askedRel, rel]) {
    const part = secretPart(r);
    if (part) return { error: part === '.git' ? 'path is inside .git' : `path is a secret file or folder (${part})` };
  }
  const st = statSync(real);
  if (needs === 'file') {
    if (!st.isFile()) return { error: 'path is not a file' };
    if (st.size > maxBytes) return { error: `file is over the size limit (${st.size} > ${maxBytes} bytes)` };
  }
  if (needs === 'folder' && !st.isDirectory()) return { error: 'path is not a folder' };
  return { rel: rel || '.' };
}

// call: { tool, args }; opts: { root, log (array or function), maxBytes }.
export function decideContextCall(call, { root, log, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const tool = call?.tool;
  const args = call?.args;
  const record = (decision) => {
    const entry = { at: new Date().toISOString(), tool: typeof tool === 'string' ? tool : null, ...decision };
    if (Array.isArray(log)) log.push(entry);
    else if (typeof log === 'function') log(entry);
    return entry;
  };
  if (typeof tool !== 'string' || !Object.hasOwn(CONTEXT_TOOLS, tool)) {
    if (typeof tool === 'string' && WRITE_LIKE.test(tool)) {
      return record({ allow: false, reason: `${tool} is a write, shell or network tool; only read-only context calls are allowed` });
    }
    const argKeys = args && typeof args === 'object' && !Array.isArray(args) ? Object.keys(args).sort() : [];
    return record({
      allow: false,
      reason: `${tool} is not on the allow-list (${Object.keys(CONTEXT_TOOLS).join(', ')})`,
      proposal: { tool: String(tool), argKeys, status: 'for a person to review' },
    });
  }
  const spec = CONTEXT_TOOLS[tool];
  const argError = checkArgs(spec, args);
  if (argError) return record({ allow: false, reason: argError });
  let rootReal;
  try {
    rootReal = realpathSync(root);
  } catch {
    return record({ allow: false, reason: 'repository root not found' });
  }
  const resolved = resolvePath(rootReal, args.path ?? '.', spec.needs, maxBytes);
  if (resolved.error) return record({ allow: false, reason: resolved.error });
  return record({
    allow: true,
    reason: `${tool} on ${resolved.rel}: inside the repository, not a secret${spec.needs === 'file' ? ', under the size limit' : ''}`,
    path: resolved.rel,
    ...(args.name ? { name: args.name } : {}),
  });
}
