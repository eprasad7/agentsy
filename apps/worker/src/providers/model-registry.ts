import type { VersionModelSpec } from '@agentsy/db';
import { CAPABILITY_CLASS_MODELS } from '@agentsy/shared';

/**
 * Resolve a model spec to a concrete model string.
 */
export function resolveModel(spec: VersionModelSpec | null, modelField: string): string {
  // Direct model string (most common)
  if (!spec || spec.type === 'direct') return modelField;

  // Capability class
  const classKey = spec.class === 'reasoning' ? 'powerful' : spec.class;
  const provider = spec.provider ?? 'anthropic';
  const classModels = CAPABILITY_CLASS_MODELS[classKey as keyof typeof CAPABILITY_CLASS_MODELS];
  if (!classModels) throw new Error(`Unknown capability class: ${spec.class}`);

  const resolved = classModels[provider as keyof typeof classModels];
  if (!resolved) throw new Error(`No model for provider "${provider}" in class "${spec.class}"`);
  return resolved;
}

/**
 * Detect provider from a model string.
 */
export function detectProvider(model: string): 'anthropic' | 'openai' {
  if (model.startsWith('claude-') || model.startsWith('claude ')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
  return 'anthropic'; // default
}
