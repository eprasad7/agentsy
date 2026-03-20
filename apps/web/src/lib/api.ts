/**
 * Typed API client for the Agentsy dashboard.
 *
 * Reads NEXT_PUBLIC_API_URL from the environment. All methods throw an
 * ApiClientError on non-2xx responses with the server's error payload.
 */

// ── Error types ─────────────────────────────────────────────────────

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiClientError extends Error {
  status: number;
  payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
  }
}

// ── Response types ──────────────────────────────────────────────────

export interface CursorPage<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface DataWrapper<T> {
  data: T[];
}

// ── Domain types ────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  billing_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  key?: string; // Only on create response
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface Secret {
  id: string;
  name: string;
  key: string;
  environment: string;
  description: string | null;
  last_rotated_at: string | null;
  created_at: string;
}

export interface Environment {
  id: string;
  name: string;
  tool_allow_list: string[] | null;
  tool_deny_list: string[] | null;
  require_approval_for_write_tools: boolean;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  org_id: string;
  version: number;
  system_prompt: string;
  model: string;
  model_spec: unknown;
  fallback_model: string | null;
  tools_config: unknown;
  guardrails_config: unknown;
  model_params: unknown;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Run {
  id: string;
  agent_id: string;
  version_id: string | null;
  session_id: string | null;
  status: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | string | null;
  total_tokens_in: number | null;
  total_tokens_out: number | null;
  total_cost_usd: string | null;
  duration_ms: number | null;
  model: string | null;
  trace_id: string | null;
  metadata: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface RunStep {
  id: string;
  run_id: string;
  step_order: number;
  type: string;
  model: string | null;
  tool_name: string | null;
  input: Record<string, unknown> | string | null;
  output: Record<string, unknown> | string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: string | null;
  duration_ms: number | null;
  error: string | null;
  output_truncated: boolean;
  approval_status: string | null;
  approved_by: string | null;
  approval_wait_ms: number | null;
  metadata: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  agent_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

// ── Core client ─────────────────────────────────────────────────────

const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  // Try cookie first (Better Auth sets this), then localStorage fallback
  const match = document.cookie.match(/(?:^|; )auth_token=([^;]*)/);
  if (match) return decodeURIComponent(match[1]!);
  return localStorage.getItem("auth_token");
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let payload: ApiErrorPayload;
    try {
      payload = (await res.json()) as ApiErrorPayload;
    } catch {
      payload = { code: "UNKNOWN", message: res.statusText };
    }
    throw new ApiClientError(res.status, payload);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Resource namespaces ─────────────────────────────────────────────

export const apiClient = {
  // ── Agents ──────────────────────────────────────────────────────
  agents: {
    list(params?: { limit?: string; cursor?: string; order?: string }) {
      return request<CursorPage<Agent>>("GET", "/v1/agents", undefined, params);
    },
    get(agentId: string) {
      return request<Agent>("GET", `/v1/agents/${agentId}`);
    },
    create(body: { name: string; slug: string; description?: string }) {
      return request<Agent>("POST", "/v1/agents", body);
    },
    update(agentId: string, body: { name?: string; description?: string | null }) {
      return request<Agent>("PATCH", `/v1/agents/${agentId}`, body);
    },
    delete(agentId: string) {
      return request<void>("DELETE", `/v1/agents/${agentId}`);
    },
    versions(agentId: string, params?: { limit?: string; cursor?: string; order?: string }) {
      return request<CursorPage<AgentVersion>>(
        "GET",
        `/v1/agents/${agentId}/versions`,
        undefined,
        params,
      );
    },
    getVersion(agentId: string, versionId: string) {
      return request<AgentVersion>("GET", `/v1/agents/${agentId}/versions/${versionId}`);
    },
    createVersion(
      agentId: string,
      body: {
        system_prompt: string;
        model: string | { class: string; provider?: string };
        guardrails_config?: Record<string, unknown>;
        model_params?: Record<string, unknown>;
        description?: string;
      },
    ) {
      return request<AgentVersion>("POST", `/v1/agents/${agentId}/versions`, body);
    },
  },

  // ── Runs ────────────────────────────────────────────────────────
  runs: {
    list(params?: {
      limit?: string;
      cursor?: string;
      order?: string;
      agent_id?: string;
      status?: string;
      environment?: string;
      created_after?: string;
      created_before?: string;
    }) {
      return request<CursorPage<Run>>("GET", "/v1/runs", undefined, params);
    },
    get(runId: string) {
      return request<Run>("GET", `/v1/runs/${runId}`);
    },
    steps(runId: string, params?: { limit?: string; cursor?: string }) {
      return request<CursorPage<RunStep>>("GET", `/v1/runs/${runId}/steps`, undefined, params);
    },
    cancel(runId: string) {
      return request<void>("POST", `/v1/runs/${runId}/cancel`);
    },
    approve(runId: string, body?: { step_id?: string }) {
      return request<void>("POST", `/v1/runs/${runId}/approve`, body);
    },
    deny(runId: string, body?: { step_id?: string; reason?: string }) {
      return request<void>("POST", `/v1/runs/${runId}/deny`, body);
    },
  },

  // ── Sessions ────────────────────────────────────────────────────
  sessions: {
    list(agentId: string, params?: { limit?: string; cursor?: string }) {
      return request<CursorPage<Session>>(
        "GET",
        `/v1/agents/${agentId}/sessions`,
        undefined,
        params,
      );
    },
    create(agentId: string, body?: { title?: string }) {
      return request<Session>("POST", `/v1/agents/${agentId}/sessions`, body);
    },
    delete(agentId: string, sessionId: string) {
      return request<void>("DELETE", `/v1/agents/${agentId}/sessions/${sessionId}`);
    },
  },

  // ── Organization ────────────────────────────────────────────────
  organization: {
    get() {
      return request<Organization>("GET", "/v1/organization");
    },
    update(body: { name?: string; billing_email?: string }) {
      return request<Organization>("PATCH", "/v1/organization", body);
    },
    members() {
      return request<DataWrapper<Member>>("GET", "/v1/organization/members");
    },
    invite(body: { email: string; role?: string }) {
      return request<Member>("POST", "/v1/organization/members/invite", body);
    },
    updateRole(memberId: string, body: { role: string }) {
      return request<Member>("PATCH", `/v1/organization/members/${memberId}`, body);
    },
    removeMember(memberId: string) {
      return request<void>("DELETE", `/v1/organization/members/${memberId}`);
    },
  },

  // ── API Keys ────────────────────────────────────────────────────
  apiKeys: {
    list() {
      return request<DataWrapper<ApiKey>>("GET", "/v1/api-keys");
    },
    create(body: { name: string; expires_at?: string }) {
      return request<ApiKey>("POST", "/v1/api-keys", body);
    },
    revoke(keyId: string) {
      return request<void>("DELETE", `/v1/api-keys/${keyId}`);
    },
  },

  // ── Secrets ─────────────────────────────────────────────────────
  secrets: {
    list() {
      return request<DataWrapper<Secret>>("GET", "/v1/secrets");
    },
    create(body: {
      name: string;
      key: string;
      value: string;
      environment: string;
      description?: string;
    }) {
      return request<Secret>("POST", "/v1/secrets", body);
    },
    delete(secretId: string) {
      return request<void>("DELETE", `/v1/secrets/${secretId}`);
    },
  },

  // ── Environments ────────────────────────────────────────────────
  environments: {
    list() {
      return request<DataWrapper<Environment>>("GET", "/v1/environments");
    },
    update(
      envId: string,
      body: {
        tool_allow_list?: string[] | null;
        tool_deny_list?: string[] | null;
        require_approval_for_write_tools?: boolean;
      },
    ) {
      return request<Environment>("PATCH", `/v1/environments/${envId}`, body);
    },
  },
} as const;
