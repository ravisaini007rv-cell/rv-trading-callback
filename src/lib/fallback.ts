import { MODELS, findModel, type ModelDef } from "./models";

/**
 * Free tiers fail: rate limits, cold providers, empty responses. Instead of
 * showing the user an error we walk a chain of alternatives automatically.
 *
 * Order: the model the user picked, then every other model whose credentials we
 * actually have, keyless ones last (they always work but are slower).
 */
export function buildChain(preferredId: string, keys: Record<string, string | undefined>) {
  const preferred = findModel(preferredId);
  const usable = (m: ModelDef) => !m.keyed || !!keys[m.provider]?.trim();

  const rest = MODELS.filter((m) => m.id !== preferred.id && usable(m)).sort((a, b) => {
    // keyed providers first (faster, higher quality), keyless as the safety net
    if (a.keyed !== b.keyed) return a.keyed ? -1 : 1;
    return 0;
  });

  // If the user's pick needs a key they don't have, don't even try it.
  const head = usable(preferred) ? [preferred] : [];
  return [...head, ...rest].slice(0, 4);
}

export const RATE_LIMIT_HINT =
  "All free providers are busy right now. Wait a few seconds, or add a free API key in Settings for much higher limits.";
