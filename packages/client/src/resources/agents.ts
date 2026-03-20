import type { AgentsyHttpClient } from '../client.js';
import { parseSSEStream } from '../streaming.js';
import type { RunRequest, RunResponse, RunStreamEvent } from '../types.js';

export class AgentsResource {
  constructor(private readonly http: AgentsyHttpClient) {}

  /**
   * Run an agent synchronously and return the completed result.
   */
  async run(agentIdOrSlug: string, input: string | RunRequest): Promise<RunResponse> {
    const body = typeof input === 'string'
      ? { input, stream: false }
      : { ...input, stream: false };

    return this.http.post<RunResponse>(`/v1/agents/${agentIdOrSlug}/run`, body);
  }

  /**
   * Run an agent with SSE streaming. Returns an async iterable of events.
   */
  async *stream(agentIdOrSlug: string, input: string | RunRequest): AsyncGenerator<RunStreamEvent> {
    const body = typeof input === 'string'
      ? { input, stream: true }
      : { ...input, stream: true };

    const response = await this.http.rawPost(`/v1/agents/${agentIdOrSlug}/run`, body);
    yield* parseSSEStream(response);
  }

  /**
   * Start an async agent run. Returns immediately with run ID for polling.
   */
  async runAsync(agentIdOrSlug: string, input: string | RunRequest): Promise<{ id: string; poll_url: string }> {
    const body = typeof input === 'string'
      ? { input, async: true }
      : { ...input, async: true };

    return this.http.post(`/v1/agents/${agentIdOrSlug}/run`, body);
  }
}
