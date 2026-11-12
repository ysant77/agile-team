// Minimal Ollama client for the role bake-off. Local server only; no paid service.

export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';

async function call(path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Models that need a reasoning level instead of think=false.
const THINK = { 'gpt-oss': 'low' };

export function thinkSetting(model) {
  const family = Object.keys(THINK).find((f) => model.startsWith(f));
  return family ? THINK[family] : false;
}

// One chat turn. `format` is a JSON schema for structured output.
export async function chat({ model, messages, format, timeoutMs = 600_000, numCtx = 16_384 }) {
  const started = Date.now();
  try {
    const r = await call('/api/chat', {
      model,
      messages,
      format,
      stream: false,
      think: thinkSetting(model),
      keep_alive: '10m',
      options: { temperature: 0, seed: 7, num_ctx: numCtx },
    }, timeoutMs);
    const evalS = (r.eval_duration ?? 0) / 1e9;
    return {
      ok: true,
      content: r.message?.content ?? '',
      outputTokens: r.eval_count ?? 0,
      tokensPerS: evalS > 0 ? (r.eval_count ?? 0) / evalS : null,
      loadS: (r.load_duration ?? 0) / 1e9,
      wallS: (Date.now() - started) / 1000,
    };
  } catch (error) {
    const timeout = error.name === 'AbortError';
    return { ok: false, error: timeout ? 'timeout' : String(error.message ?? error), wallS: (Date.now() - started) / 1000 };
  }
}

export async function loaded() {
  const r = await call('/api/ps', null, 10_000);
  return (r.models ?? []).map((m) => ({ name: m.name, sizeBytes: m.size, vramBytes: m.size_vram }));
}

export async function unload(model) {
  await call('/api/generate', { model, keep_alive: 0 }, 60_000);
}

export async function digest(model) {
  const r = await call('/api/tags', null, 10_000);
  return (r.models ?? []).find((m) => m.name === model)?.digest ?? null;
}

export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return { ok: true, value: JSON.parse(match[0]), repaired: true };
      } catch { /* fall through */ }
    }
    return { ok: false, value: null };
  }
}
