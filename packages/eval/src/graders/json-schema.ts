import type { GraderDefinition, GraderContext } from '../types.js';

/**
 * Validate that the output is valid JSON conforming to a JSON Schema.
 * Uses basic structural validation — not a full JSON Schema validator.
 */
export function jsonSchemaGrader(schema: Record<string, unknown>): GraderDefinition {
  return {
    name: 'json_schema',
    type: 'json_schema',
    config: { schema },
    grade(context: GraderContext) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(context.output);
      } catch {
        return {
          score: 0.0,
          name: 'json_schema',
          graderType: 'json_schema',
          reasoning: 'Output is not valid JSON',
        };
      }

      const errors = validateJsonSchema(parsed, schema, '');
      if (errors.length === 0) {
        return {
          score: 1.0,
          name: 'json_schema',
          graderType: 'json_schema',
          reasoning: 'Output conforms to schema',
        };
      }

      return {
        score: 0.0,
        name: 'json_schema',
        graderType: 'json_schema',
        reasoning: `Schema violations: ${errors.join('; ')}`,
      };
    },
  };
}

function validateJsonSchema(value: unknown, schema: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  const type = schema['type'] as string | undefined;

  if (type) {
    const actualType = getJsonType(value);
    if (type === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`${path || 'root'}: expected integer, got ${actualType}`);
        return errors;
      }
    } else if (actualType !== type) {
      errors.push(`${path || 'root'}: expected ${type}, got ${actualType}`);
      return errors;
    }
  }

  if (type === 'object' || (!type && typeof value === 'object' && value !== null && !Array.isArray(value))) {
    const obj = value as Record<string, unknown>;
    const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
    const required = schema['required'] as string[] | undefined;

    if (required) {
      for (const key of required) {
        if (!(key in obj)) {
          errors.push(`${path || 'root'}: missing required property "${key}"`);
        }
      }
    }

    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in obj) {
          errors.push(...validateJsonSchema(obj[key], propSchema, `${path}.${key}`));
        }
      }
    }
  }

  if (type === 'array' && Array.isArray(value)) {
    const items = schema['items'] as Record<string, unknown> | undefined;
    if (items) {
      for (let i = 0; i < value.length; i++) {
        errors.push(...validateJsonSchema(value[i], items, `${path}[${i}]`));
      }
    }
    const minItems = schema['minItems'] as number | undefined;
    const maxItems = schema['maxItems'] as number | undefined;
    if (minItems !== undefined && value.length < minItems) {
      errors.push(`${path || 'root'}: array has ${value.length} items, minimum is ${minItems}`);
    }
    if (maxItems !== undefined && value.length > maxItems) {
      errors.push(`${path || 'root'}: array has ${value.length} items, maximum is ${maxItems}`);
    }
  }

  if (type === 'string' && typeof value === 'string') {
    const minLength = schema['minLength'] as number | undefined;
    const maxLength = schema['maxLength'] as number | undefined;
    if (minLength !== undefined && value.length < minLength) {
      errors.push(`${path || 'root'}: string length ${value.length} is less than minimum ${minLength}`);
    }
    if (maxLength !== undefined && value.length > maxLength) {
      errors.push(`${path || 'root'}: string length ${value.length} is greater than maximum ${maxLength}`);
    }
  }

  const enumValues = schema['enum'] as unknown[] | undefined;
  if (enumValues && !enumValues.includes(value)) {
    errors.push(`${path || 'root'}: value not in enum ${JSON.stringify(enumValues)}`);
  }

  return errors;
}

function getJsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
