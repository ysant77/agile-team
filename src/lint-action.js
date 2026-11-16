import { lintRequirement } from './lint.js';
import { parseAcLines } from './ticket-spec.js';

// Rovo action: rule lint before the model rewrites. No model inside.
export async function lintRequirementAction(payload) {
  const draft = {
    summary: payload.summary ?? '',
    description: String(payload.description ?? '').replace(/\\n/g, '\n'),
    acceptanceCriteria: parseAcLines(payload.acceptanceCriteria),
  };
  const result = lintRequirement(draft, [payload.request ?? '']);
  console.log('lint result', JSON.stringify(result));
  return result;
}
