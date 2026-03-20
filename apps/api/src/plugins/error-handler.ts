import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

const ERROR_BASE_URL = 'https://api.agentsy.com/errors';

interface ApiErrorBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    detail: string,
    public readonly fieldErrors?: Array<{ field: string; message: string; code: string }>,
  ) {
    super(detail);
    this.name = 'ApiError';
  }

  toBody(instance?: string): ApiErrorBody {
    return {
      type: `${ERROR_BASE_URL}/${this.code}`,
      title: this.title,
      status: this.status,
      detail: this.message,
      ...(instance && { instance }),
      ...(this.fieldErrors?.length && { errors: this.fieldErrors }),
    };
  }
}

export function badRequest(detail: string): ApiError {
  return new ApiError(400, 'bad-request', 'Bad Request', detail);
}

export function unauthorized(detail = 'Missing or invalid authentication'): ApiError {
  return new ApiError(401, 'unauthorized', 'Unauthorized', detail);
}

export function forbidden(detail = 'Insufficient permissions'): ApiError {
  return new ApiError(403, 'forbidden', 'Forbidden', detail);
}

export function notFound(detail = 'Resource not found'): ApiError {
  return new ApiError(404, 'not-found', 'Not Found', detail);
}

export function conflict(detail: string): ApiError {
  return new ApiError(409, 'conflict', 'Conflict', detail);
}

export function validationError(
  detail: string,
  errors?: Array<{ field: string; message: string; code: string }>,
): ApiError {
  return new ApiError(422, 'validation-error', 'Validation Error', detail, errors);
}

export function rateLimitExceeded(detail = 'Rate limit exceeded'): ApiError {
  return new ApiError(429, 'rate-limit-exceeded', 'Rate Limit Exceeded', detail);
}

function zodToFieldErrors(err: ZodError): Array<{ field: string; message: string; code: string }> {
  return err.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ApiError) {
      return reply
        .status(error.status)
        .header('content-type', 'application/problem+json')
        .send(error.toBody(request.url));
    }

    if (error instanceof ZodError) {
      const apiErr = validationError('Request body failed validation', zodToFieldErrors(error));
      return reply
        .status(422)
        .header('content-type', 'application/problem+json')
        .send(apiErr.toBody(request.url));
    }

    // Fastify validation errors (schema validation)
    const fastifyErr = error as { statusCode?: number; validation?: unknown };
    if (fastifyErr.statusCode === 400 && fastifyErr.validation) {
      const apiErr = badRequest(error.message);
      return reply
        .status(400)
        .header('content-type', 'application/problem+json')
        .send(apiErr.toBody(request.url));
    }

    // Unknown errors
    request.log.error(error);
    const body: ApiErrorBody = {
      type: `${ERROR_BASE_URL}/internal-error`,
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred',
    };
    return reply.status(500).header('content-type', 'application/problem+json').send(body);
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const body: ApiErrorBody = {
      type: `${ERROR_BASE_URL}/not-found`,
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${request.url} not found`,
      instance: request.url,
    };
    return reply.status(404).header('content-type', 'application/problem+json').send(body);
  });
}
