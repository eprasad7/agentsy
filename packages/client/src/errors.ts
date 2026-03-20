export class AgentsyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AgentsyError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class AuthenticationError extends AgentsyError {
  constructor(message = 'Invalid or missing API key') {
    super(401, 'unauthorized', message);
    this.name = 'AuthenticationError';
  }
}

export class ForbiddenError extends AgentsyError {
  constructor(message = 'Forbidden') {
    super(403, 'forbidden', message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AgentsyError {
  constructor(message = 'Resource not found') {
    super(404, 'not_found', message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AgentsyError {
  readonly fieldErrors?: Array<{ field: string; message: string; code: string }>;

  constructor(message: string, fieldErrors?: Array<{ field: string; message: string; code: string }>) {
    super(422, 'validation_error', message);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class RateLimitError extends AgentsyError {
  readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(429, 'rate_limit_exceeded', message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ServerError extends AgentsyError {
  constructor(message = 'Internal server error') {
    super(500, 'internal_error', message);
    this.name = 'ServerError';
  }
}

/**
 * Create the appropriate error from an HTTP response.
 */
export function createErrorFromResponse(status: number, body: Record<string, unknown>): AgentsyError {
  const detail = (body['detail'] as string) ?? (body['message'] as string) ?? 'Unknown error';
  const code = (body['type'] as string)?.split('/').pop() ?? 'unknown';

  switch (status) {
    case 401: return new AuthenticationError(detail);
    case 403: return new ForbiddenError(detail);
    case 404: return new NotFoundError(detail);
    case 422: return new ValidationError(detail, body['errors'] as ValidationError['fieldErrors']);
    case 429: return new RateLimitError(detail, Number(body['retry_after'] ?? 60));
    default:
      if (status >= 500) return new ServerError(detail);
      return new AgentsyError(status, code, detail);
  }
}
