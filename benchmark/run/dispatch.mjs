// Checks for the arm D runner (arm_d.mjs). The model's tool calls are untrusted: a call reaches a
// tool only when its name is on the runner's list and its arguments match the tool spec
// (src/tool-specs.js of the reviewer checkout). The model server call has a time limit.

const TYPES = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
};

// Returns { ok: true } or { ok: false, error } with the first fault found.
export function checkToolCall(specs, allowed, name, args) {
  if (typeof name !== 'string' || !Object.hasOwn(specs, name)) return { ok: false, error: `unknown tool ${name}` };
  if (!allowed.includes(name)) return { ok: false, error: `tool not allowed in this run: ${name}` };
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: `${name}: arguments must be an object` };
  const spec = specs[name].args ?? {};
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(spec, key)) return { ok: false, error: `${name}: unknown argument ${key}` };
  }
  for (const [key, a] of Object.entries(spec)) {
    if (!Object.hasOwn(args, key)) {
      if (a.required) return { ok: false, error: `${name}: ${key} is required` };
      continue;
    }
    const isType = TYPES[a.type];
    if (!isType) return { ok: false, error: `${name}: the spec type ${a.type} of ${key} is not known to the runner` };
    if (!isType(args[key])) return { ok: false, error: `${name}: ${key} must be a ${a.type}` };
  }
  return { ok: true };
}

// fetch with a time limit; a slow or stuck model server stops the run with a clear error.
export async function fetchWithTimeout(url, init, ms) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error(`model server call timed out after ${ms} ms: ${url}`);
    throw e;
  }
}
