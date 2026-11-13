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

// One chat turn. `format` is a JSON schema for structured output. The answer is streamed, so
// the response headers arrive at once: Node's fetch otherwise gives up waiting for headers after
// 300 s, which failed slow models on long answers. The whole turn still has `timeoutMs`.
export async function chat({ model, messages, format, timeoutMs = 900_000, numCtx = 16_384 }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        format,
        stream: true,
        think: thinkSetting(model),
        keep_alive: '10m',
        options: { temperature: 0, seed: 7, num_ctx: numCtx },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`/api/chat: HTTP ${res.status} ${await res.text()}`);
    let content = '';
    let last = {};
    let buffer = '';
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const part = JSON.parse(line);
        if (part.error) throw new Error(part.error);
        content += part.message?.content ?? '';
        if (part.done) last = part;
      }
    }
    const evalS = (last.eval_duration ?? 0) / 1e9;
    return {
      ok: true,
      content,
      outputTokens: last.eval_count ?? 0,
      tokensPerS: evalS > 0 ? (last.eval_count ?? 0) / evalS : null,
      loadS: (last.load_duration ?? 0) / 1e9,
      wallS: (Date.now() - started) / 1000,
    };
  } catch (error) {
    const timeout = error.name === 'AbortError';
    return { ok: false, error: timeout ? 'timeout' : String(error.message ?? error), wallS: (Date.now() - started) / 1000 };
  } finally {
    clearTimeout(timer);
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
