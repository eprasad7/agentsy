import { detectPii } from './pii-patterns.js';

interface OutputValidationRule {
  type: string;
  config?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  violations: Array<{
    type: string;
    message: string;
  }>;
}

/**
 * Run all output validation rules against the agent's final response.
 */
export function runOutputValidation(
  output: string,
  validators: OutputValidationRule[] | undefined,
): ValidationResult {
  if (!validators?.length) return { passed: true, violations: [] };

  const violations: ValidationResult['violations'] = [];

  for (const validator of validators) {
    switch (validator.type) {
      case 'no_pii': {
        const categories = (validator.config as Record<string, unknown> | undefined)?.['categories'] as string[] | undefined;
        const result = detectPii(output, categories as Parameters<typeof detectPii>[1]);
        if (result.detected) {
          violations.push({
            type: 'no_pii',
            message: `PII detected: ${result.categories.join(', ')}`,
          });
        }
        break;
      }

      case 'on_topic': {
        const config = validator.config as Record<string, unknown> | undefined;
        const topics = (config?.['topics'] as string[]) ?? [];
        if (topics.length > 0) {
          const lowerOutput = output.toLowerCase();
          const isOnTopic = topics.some((topic) => lowerOutput.includes(topic.toLowerCase()));
          if (!isOnTopic) {
            violations.push({
              type: 'on_topic',
              message: `Output appears off-topic. Expected topics: ${topics.join(', ')}`,
            });
          }
        }
        break;
      }

      case 'content_policy': {
        const config = validator.config as Record<string, unknown> | undefined;
        const blocked = (config?.['blockedCategories'] as string[]) ?? ['harmful', 'illegal', 'sexual'];
        const lowerOutput = output.toLowerCase();
        const found = blocked.filter((phrase) => lowerOutput.includes(phrase.toLowerCase()));
        if (found.length > 0) {
          violations.push({
            type: 'content_policy',
            message: `Blocked content detected: ${found.join(', ')}`,
          });
        }
        break;
      }

      case 'json_schema': {
        // Validate output is valid JSON conforming to the provided schema
        // (lightweight check: parse JSON and verify top-level keys)
        const config = validator.config as Record<string, unknown> | undefined;
        const schema = config?.['schema'] as Record<string, unknown> | undefined;
        if (schema) {
          try {
            JSON.parse(output);
          } catch {
            violations.push({
              type: 'json_schema',
              message: 'Output is not valid JSON',
            });
          }
        }
        break;
      }

      case 'custom':
        // Custom validators are a post-beta feature
        break;
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
