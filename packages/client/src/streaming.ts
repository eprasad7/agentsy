import type { RunStreamEvent } from '@agentsy/shared';

/**
 * Parse an SSE stream into typed RunStreamEvent objects.
 * Returns an async iterable that yields events as they arrive.
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<RunStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete last line

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          // Empty line = end of event
          if (currentData === '[DONE]') {
            return;
          }
          try {
            const data = JSON.parse(currentData) as Record<string, unknown>;
            yield { type: currentEvent, ...data } as unknown as RunStreamEvent;
          } catch {
            // Skip malformed events
          }
          currentEvent = '';
          currentData = '';
        }
        // Skip id: lines, comment lines (:), etc.
      }
    }
  } finally {
    reader.releaseLock();
  }
}
