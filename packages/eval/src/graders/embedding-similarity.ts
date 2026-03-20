import type { GraderDefinition, GraderContext } from '../types.js';

export interface EmbeddingSimilarityOptions {
  threshold?: number;
  model?: string;
  apiKey?: string;
}

export function embeddingSimilarity(opts: EmbeddingSimilarityOptions = {}): GraderDefinition {
  const threshold = opts.threshold ?? 0.8;
  const model = opts.model ?? 'text-embedding-3-small';

  return {
    name: 'embedding_similarity',
    type: 'embedding_similarity',
    config: opts as unknown as Record<string, unknown>,
    async grade(context: GraderContext) {
      const expected = resolveExpectedString(context.expectedOutput);
      if (expected === undefined) {
        return {
          score: 0,
          name: 'embedding_similarity',
          graderType: 'embedding_similarity',
          reasoning: 'No expected output provided',
        };
      }

      const apiKey = opts.apiKey ?? process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        return {
          score: 0,
          name: 'embedding_similarity',
          graderType: 'embedding_similarity',
          reasoning: 'OPENAI_API_KEY not configured for embedding similarity',
        };
      }

      const [embA, embB] = await Promise.all([
        getEmbedding(context.output, model, apiKey),
        getEmbedding(expected, model, apiKey),
      ]);

      const similarity = cosineSimilarity(embA, embB);
      const score = similarity >= threshold ? 1.0 : similarity / threshold;

      return {
        score: Number(score.toFixed(4)),
        name: 'embedding_similarity',
        graderType: 'embedding_similarity',
        reasoning: `Cosine similarity: ${similarity.toFixed(4)} (threshold: ${threshold})`,
        metadata: { similarity, threshold },
      };
    },
  };
}

async function getEmbedding(text: string, model: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: text, model }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0]!.embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  return dotProduct / magnitude;
}

function resolveExpectedString(expected: GraderContext['expectedOutput']): string | undefined {
  if (expected === undefined || expected === null) return undefined;
  if (typeof expected === 'string') return expected;
  if ('text' in expected && expected.type === 'text') return expected.text;
  return JSON.stringify(expected);
}
