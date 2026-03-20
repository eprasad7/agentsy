import { describe, it, expect } from 'vitest';
import { runOutputValidation } from '../guardrails/output-validators.js';
import { detectPii } from '../guardrails/pii-patterns.js';

describe('detectPii', () => {
  it('detects SSN', () => {
    const result = detectPii('My SSN is 123-45-6789');
    expect(result.detected).toBe(true);
    expect(result.categories).toContain('ssn');
  });

  it('detects credit card', () => {
    const result = detectPii('Card: 4111-1111-1111-1111');
    expect(result.detected).toBe(true);
    expect(result.categories).toContain('credit_card');
  });

  it('detects email', () => {
    const result = detectPii('Contact: user@example.com');
    expect(result.detected).toBe(true);
    expect(result.categories).toContain('email');
  });

  it('detects phone number', () => {
    const result = detectPii('Call (555) 123-4567');
    expect(result.detected).toBe(true);
    expect(result.categories).toContain('phone');
  });

  it('returns no detection for clean text', () => {
    const result = detectPii('The order was shipped yesterday.');
    expect(result.detected).toBe(false);
    expect(result.categories).toHaveLength(0);
  });

  it('respects category filter', () => {
    const result = detectPii('My SSN is 123-45-6789', ['email']);
    expect(result.detected).toBe(false);
  });
});

describe('runOutputValidation', () => {
  it('passes when no validators configured', () => {
    const result = runOutputValidation('Hello world', undefined);
    expect(result.passed).toBe(true);
  });

  it('passes when validators is empty array', () => {
    const result = runOutputValidation('Hello world', []);
    expect(result.passed).toBe(true);
  });

  it('detects PII with no_pii validator', () => {
    const result = runOutputValidation('Your SSN is 123-45-6789', [
      { type: 'no_pii' },
    ]);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.type).toBe('no_pii');
  });

  it('passes no_pii when text is clean', () => {
    const result = runOutputValidation('Order shipped!', [{ type: 'no_pii' }]);
    expect(result.passed).toBe(true);
  });

  it('detects off-topic content', () => {
    const result = runOutputValidation('The weather is nice today', [
      { type: 'on_topic', config: { topics: ['customer support', 'orders'] } },
    ]);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.type).toBe('on_topic');
  });

  it('passes on-topic content', () => {
    const result = runOutputValidation('Your orders have been shipped via shipping provider', [
      { type: 'on_topic', config: { topics: ['orders', 'shipping'] } },
    ]);
    expect(result.passed).toBe(true);
  });

  it('detects blocked content', () => {
    const result = runOutputValidation('This harmful content should be blocked', [
      { type: 'content_policy' },
    ]);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.type).toBe('content_policy');
  });

  it('detects multiple PII types in one output', () => {
    const result = runOutputValidation(
      'Contact: user@example.com, SSN: 123-45-6789',
      [{ type: 'no_pii' }],
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.message).toContain('email');
    expect(result.violations[0]?.message).toContain('ssn');
  });

  it('json_schema: rejects non-JSON output', () => {
    const result = runOutputValidation('This is plain text, not JSON', [
      { type: 'json_schema' as never, config: { schema: { type: 'object' } } },
    ]);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.type).toBe('json_schema');
  });

  it('json_schema: passes valid JSON output', () => {
    const result = runOutputValidation('{"name": "test", "value": 42}', [
      { type: 'json_schema' as never, config: { schema: { type: 'object' } } },
    ]);
    expect(result.passed).toBe(true);
  });

  it('runs multiple validators and reports all violations', () => {
    const result = runOutputValidation('SSN: 123-45-6789, this is harmful', [
      { type: 'no_pii' },
      { type: 'content_policy' },
    ]);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
    expect(result.violations.map((v) => v.type)).toContain('no_pii');
    expect(result.violations.map((v) => v.type)).toContain('content_policy');
  });
});
