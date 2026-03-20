import type { AgentsyHttpClient } from '../client.js';
import type { RunResponse, RunStep, PaginatedResponse } from '../types.js';

export class RunsResource {
  constructor(private readonly http: AgentsyHttpClient) {}

  async get(runId: string): Promise<RunResponse> {
    return this.http.get<RunResponse>(`/v1/runs/${runId}`);
  }

  async list(params?: { agent_id?: string; status?: string; limit?: number; cursor?: string }): Promise<PaginatedResponse<RunResponse>> {
    const query = new URLSearchParams();
    if (params?.agent_id) query.set('agent_id', params.agent_id);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    return this.http.get(`/v1/runs${qs ? `?${qs}` : ''}`);
  }

  async steps(runId: string): Promise<PaginatedResponse<RunStep>> {
    return this.http.get(`/v1/runs/${runId}/steps`);
  }

  async cancel(runId: string): Promise<{ id: string; status: string }> {
    return this.http.post(`/v1/runs/${runId}/cancel`, {});
  }

  /**
   * Poll a run until it reaches a terminal state.
   */
  async poll(runId: string, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<RunResponse> {
    const timeout = opts?.timeoutMs ?? 300_000;
    const interval = opts?.intervalMs ?? 1_000;
    const start = Date.now();
    const terminalStatuses = ['completed', 'failed', 'cancelled', 'timeout'];

    // Check immediately first (no sleep before first check)
    const initial = await this.get(runId);
    if (terminalStatuses.includes(initial.status)) return initial;

    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, interval));
      const run = await this.get(runId);
      if (terminalStatuses.includes(run.status)) {
        return run;
      }
    }

    // One final check after timeout (handles race where run completes during last sleep)
    const final = await this.get(runId);
    if (terminalStatuses.includes(final.status)) return final;

    throw new Error(`Run ${runId} did not complete within ${timeout}ms`);
  }
}
