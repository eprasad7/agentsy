import type { LanguageModel } from 'ai';
import { createModel } from './provider-factory.js';

interface FallbackOptions {
  primaryModel: string;
  fallbackModel?: string | null;
  maxRetries?: number;
  retryDelays?: number[];
}

/**
 * Execute an LLM call with retry and optional fallback to a different provider.
 */
export async function callWithFallback<T>(
  fn: (model: LanguageModel) => Promise<T>,
  options: FallbackOptions,
): Promise<T> {
  const { primaryModel, fallbackModel, maxRetries = 2, retryDelays = [1000, 4000] } = options;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const model = createModel(primaryModel);
      return await fn(model);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = retryDelays[attempt] ?? 4000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (fallbackModel) {
    try {
      const model = createModel(fallbackModel);
      return await fn(model);
    } catch (err) {
      throw new Error(
        `Both primary (${primaryModel}) and fallback (${fallbackModel}) failed. ` +
        `Primary: ${lastError?.message}. Fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  throw lastError ?? new Error(`LLM call failed after ${maxRetries + 1} attempts`);
}
