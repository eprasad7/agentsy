import type { Session, Message, PaginatedResponse } from '../types.js';
import type { AgentsyHttpClient } from '../client.js';

export class SessionsResource {
  constructor(private readonly http: AgentsyHttpClient) {}

  async create(agentId: string, metadata?: Record<string, unknown>): Promise<Session> {
    return this.http.post<Session>(`/v1/agents/${agentId}/sessions`, { metadata });
  }

  async list(agentId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Session>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    return this.http.get(`/v1/agents/${agentId}/sessions${qs ? `?${qs}` : ''}`);
  }

  async messages(sessionId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Message>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    return this.http.get(`/v1/sessions/${sessionId}/messages${qs ? `?${qs}` : ''}`);
  }

  async delete(sessionId: string): Promise<void> {
    await this.http.delete(`/v1/sessions/${sessionId}`);
  }
}
