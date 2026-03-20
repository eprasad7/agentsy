import { describe, it, expect } from 'vitest';
import { resolveModel, detectProvider } from '../providers/model-registry.js';

describe('resolveModel', () => {
  it('returns direct model string as-is', () => {
    expect(resolveModel({ type: 'direct', model: 'claude-sonnet-4' }, 'claude-sonnet-4')).toBe('claude-sonnet-4');
  });

  it('returns model field when spec is null', () => {
    expect(resolveModel(null, 'gpt-4o')).toBe('gpt-4o');
  });

  it('resolves balanced+anthropic to claude-sonnet-4', () => {
    expect(resolveModel({ type: 'class', class: 'balanced', provider: 'anthropic' }, '')).toBe('claude-sonnet-4');
  });

  it('resolves fast+openai to gpt-4o-mini', () => {
    expect(resolveModel({ type: 'class', class: 'fast', provider: 'openai' }, '')).toBe('gpt-4o-mini');
  });

  it('resolves powerful+anthropic to claude-opus-4', () => {
    expect(resolveModel({ type: 'class', class: 'reasoning', provider: 'anthropic' }, '')).toBe('claude-opus-4');
  });

  it('defaults to anthropic provider when none specified', () => {
    expect(resolveModel({ type: 'class', class: 'balanced' }, '')).toBe('claude-sonnet-4');
  });
});

describe('detectProvider', () => {
  it('detects Anthropic for claude models', () => {
    expect(detectProvider('claude-sonnet-4')).toBe('anthropic');
    expect(detectProvider('claude-opus-4')).toBe('anthropic');
  });

  it('detects OpenAI for gpt and o-series models', () => {
    expect(detectProvider('gpt-4o')).toBe('openai');
    expect(detectProvider('gpt-4o-mini')).toBe('openai');
    expect(detectProvider('o3')).toBe('openai');
  });

  it('defaults to anthropic for unknown models', () => {
    expect(detectProvider('some-custom-model')).toBe('anthropic');
  });
});
