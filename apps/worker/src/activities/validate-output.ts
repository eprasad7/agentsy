import { runOutputValidation, type ValidationResult } from '../guardrails/output-validators.js';

export interface ValidateOutputInput {
  output: string;
  validators?: Array<{ type: string; config?: unknown }>;
}

/**
 * Activity: Run output validators on the agent's final response.
 */
export async function validateOutput(input: ValidateOutputInput): Promise<ValidationResult> {
  return runOutputValidation(
    input.output,
    input.validators as Parameters<typeof runOutputValidation>[1],
  );
}
