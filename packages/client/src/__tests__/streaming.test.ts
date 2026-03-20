import { describe, it, expect } from 'vitest';
import { parseSSEStream } from '../streaming.js';

function createMockResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]!));
        index++;
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('parseSSEStream', () => {
  it('parses single event', async () => {
    const response = createMockResponse([
      'event: run.started\ndata: {"run_id":"run_123","agent_id":"ag_456"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('run.started');
  });

  it('parses multiple events', async () => {
    const response = createMockResponse([
      'event: step.text_delta\ndata: {"delta":"Hello"}\n\n' +
      'event: step.text_delta\ndata: {"delta":" world"}\n\n' +
      'event: run.completed\ndata: {"run_id":"run_123"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe('step.text_delta');
    expect(events[2]?.type).toBe('run.completed');
  });

  it('handles chunked delivery', async () => {
    const response = createMockResponse([
      'event: step.text_',
      'delta\ndata: {"delta":"Hi"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('step.text_delta');
  });

  it('stops on [DONE] sentinel', async () => {
    const response = createMockResponse([
      'event: step.text_delta\ndata: {"delta":"Hi"}\n\n' +
      'event: done\ndata: [DONE]\n\n' +
      'event: step.text_delta\ndata: {"delta":"ignored"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
  });

  it('skips malformed JSON', async () => {
    const response = createMockResponse([
      'event: step.text_delta\ndata: not-json\n\n' +
      'event: step.text_delta\ndata: {"delta":"ok"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('step.text_delta');
  });
});
