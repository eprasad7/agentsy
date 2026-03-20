import type { GraderDefinition, GraderContext } from '../types.js';

export interface LlmJudgeOptions {
  rubric: string;
  scale?: string;
  includeInput?: boolean;
  includeExpectedOutput?: boolean;
  promptTemplate?: string;
  model?: string;
  apiKey?: string;
}

const DEFAULT_TEMPLATE = `You are an expert evaluator. Score the following agent response on a scale of 0.0 to 1.0.

Rubric: {{rubric}}
Scale: {{scale}}

Input: {{input}}
{{#if expected_output}}Expected output: {{expected_output}}{{/if}}
Agent output: {{output}}

Respond with ONLY a JSON object: { "score": <number>, "reasoning": "<explanation>" }`;

export function llmJudge(opts: LlmJudgeOptions): GraderDefinition {
  const template = opts.promptTemplate ?? DEFAULT_TEMPLATE;
  const scale = opts.scale ?? '0.0 = completely wrong, 0.5 = partially correct, 1.0 = perfect';
  const includeInput = opts.includeInput ?? true;
  const includeExpectedOutput = opts.includeExpectedOutput ?? true;
  const model = opts.model ?? 'claude-sonnet-4-20250514';

  return {
    name: 'llm_judge',
    type: 'llm_judge',
    config: opts as unknown as Record<string, unknown>,
    async grade(context: GraderContext) {
      const expectedStr = resolveExpectedString(context.expectedOutput);
      const inputStr = resolveInputString(context.input);

      let prompt = template
        .replace('{{rubric}}', opts.rubric)
        .replace('{{scale}}', scale)
        .replace('{{output}}', context.output);

      if (includeInput) {
        prompt = prompt.replace('{{input}}', inputStr);
      } else {
        prompt = prompt.replace('{{input}}', '[hidden]');
      }

      // Handle conditional expected_output block
      if (includeExpectedOutput && expectedStr) {
        prompt = prompt
          .replace('{{#if expected_output}}', '')
          .replace('{{/if}}', '')
          .replace('{{expected_output}}', expectedStr);
      } else {
        prompt = prompt.replace(/\{\{#if expected_output\}\}.*?\{\{\/if\}\}/s, '');
      }

      // Try Anthropic first, fall back to OpenAI
      const anthropicKey = opts.apiKey ?? process.env['ANTHROPIC_API_KEY'];
      const openaiKey = process.env['OPENAI_API_KEY'];

      let responseText: string;

      if (anthropicKey && model.startsWith('claude')) {
        responseText = await callAnthropic(prompt, model, anthropicKey);
      } else if (openaiKey) {
        responseText = await callOpenAI(prompt, model.startsWith('claude') ? 'gpt-4o' : model, openaiKey);
      } else {
        return {
          score: 0,
          name: 'llm_judge',
          graderType: 'llm_judge',
          reasoning: 'No API key configured for LLM judge (set ANTHROPIC_API_KEY or OPENAI_API_KEY)',
        };
      }

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*"score"[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          score: 0,
          name: 'llm_judge',
          graderType: 'llm_judge',
          reasoning: `Could not parse JSON from LLM response: ${responseText.slice(0, 200)}`,
        };
      }

      try {
        const parsed = JSON.parse(jsonMatch[0]) as { score: number; reasoning?: string };
        const score = Math.max(0, Math.min(1, parsed.score));

        return {
          score: Number(score.toFixed(4)),
          name: 'llm_judge',
          graderType: 'llm_judge',
          reasoning: parsed.reasoning ?? 'No reasoning provided',
        };
      } catch {
        return {
          score: 0,
          name: 'llm_judge',
          graderType: 'llm_judge',
          reasoning: `Failed to parse LLM judge response as JSON`,
        };
      }
    },
  };
}

async function callAnthropic(prompt: string, model: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return data.content.find((c) => c.type === 'text')?.text ?? '';
}

async function callOpenAI(prompt: string, model: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}

function resolveExpectedString(expected: GraderContext['expectedOutput']): string | undefined {
  if (expected === undefined || expected === null) return undefined;
  if (typeof expected === 'string') return expected;
  if ('text' in expected && expected.type === 'text') return expected.text;
  return JSON.stringify(expected);
}

function resolveInputString(input: GraderContext['input']): string {
  if (typeof input === 'string') return input;
  if ('text' in input && input.type === 'text') return input.text;
  return JSON.stringify(input);
}
