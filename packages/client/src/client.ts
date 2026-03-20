import type { AgentsyClientConfig } from './types.js';
import { createErrorFromResponse } from './errors.js';
import { AgentsResource } from './resources/agents.js';
import { RunsResource } from './resources/runs.js';
import { SessionsResource } from './resources/sessions.js';

const DEFAULT_BASE_URL = 'https://api.agentsy.com';
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_DELAYS = [1_000, 2_000, 4_000];

export class AgentsyClient {
  readonly agents: AgentsResource;
  readonly runs: RunsResource;
  readonly sessions: SessionsResource;

  private readonly http: AgentsyHttpClient;

  constructor(config: AgentsyClientConfig) {
    this.http = new AgentsyHttpClient(config);
    this.agents = new AgentsResource(this.http);
    this.runs = new RunsResource(this.http);
    this.sessions = new SessionsResource(this.http);
  }
}

export class AgentsyHttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(config: AgentsyClientConfig) {
    if (!config.apiKey) throw new Error('apiKey is required');
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  /**
   * Raw POST that returns the Response object (for streaming).
   */
  async rawPost(path: string, body: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw createErrorFromResponse(response.status, errorBody);
    }

    return response;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
          const error = createErrorFromResponse(response.status, errorBody);

          // Only retry on 429 and 5xx
          if (response.status === 429 || response.status >= 500) {
            lastError = error;
            if (attempt < this.maxRetries) {
              await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt] ?? 4_000));
              continue;
            }
          }

          throw error;
        }

        if (response.status === 204) return undefined as T;
        return await response.json() as T;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error(`Request timed out after ${this.timeout}ms`);
        } else if (err instanceof Error && 'status' in err) {
          // Already an AgentsyError — don't retry
          throw err;
        } else {
          lastError = err instanceof Error ? err : new Error(String(err));
        }

        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt] ?? 4_000));
        }
      }
    }

    throw lastError ?? new Error('Request failed');
  }
}
