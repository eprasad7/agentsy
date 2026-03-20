import type { RunStreamEvent } from '@agentsy/shared';

export type SSEEvent = RunStreamEvent & {
  /** Event sequence ID from the server (for Last-Event-ID reconnection). */
  id?: number;
};

/**
 * Parse an SSE stream into typed RunStreamEvent objects.
 * Returns an async iterable that yields events as they arrive.
 *
 * Handles:
 * - event: / data: / id: lines per SSE spec (RFC 6202)
 * - Multi-line data: fields (concatenated with newlines)
 * - Comment lines (: prefix) — ignored
 * - [DONE] sentinel for OpenAI compat
 * - Chunked delivery (partial lines buffered)
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';
  let currentId: number | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        // Comment line — ignore
        if (line.startsWith(':')) continue;

        if (line.startsWith('id: ')) {
          const parsed = parseInt(line.slice(4).trim(), 10);
          if (!isNaN(parsed)) currentId = parsed;
        } else if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          // Multi-line data support: concatenate with newlines
          currentData += (currentData ? '\n' : '') + line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          // Empty line = end of event
          if (currentData === '[DONE]') {
            return;
          }
          try {
            const data = JSON.parse(currentData) as Record<string, unknown>;
            const event = { type: currentEvent, ...data } as unknown as SSEEvent;
            if (currentId !== undefined) event.id = currentId;
            yield event;
          } catch {
            // Skip malformed events
          }
          currentEvent = '';
          currentData = '';
          currentId = undefined;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
