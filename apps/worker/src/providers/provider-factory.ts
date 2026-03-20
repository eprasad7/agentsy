import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { detectProvider } from './model-registry.js';

/**
 * Create a Vercel AI SDK language model instance from a model string.
 */
export function createModel(model: string): LanguageModel {
  const provider = detectProvider(model);

  if (provider === 'anthropic') {
    const anthropic = createAnthropic({});
    return anthropic(model) as LanguageModel;
  }

  const openai = createOpenAI({});
  return openai(model) as LanguageModel;
}
