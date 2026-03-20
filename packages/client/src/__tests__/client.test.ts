import { describe, it, expect } from 'vitest';

import { AgentsyClient } from '../client.js';
import {
  AgentsyError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
  createErrorFromResponse,
} from '../errors.js';

describe('AgentsyClient', () => {
  it('requires apiKey', () => {
    expect(() => new AgentsyClient({ apiKey: '' })).toThrow('apiKey is required');
  });

  it('creates client with all resources', () => {
    const client = new AgentsyClient({ apiKey: 'sk-test' });
    expect(client.agents).toBeDefined();
    expect(client.runs).toBeDefined();
    expect(client.sessions).toBeDefined();
  });

  it('accepts custom baseUrl', () => {
    const client = new AgentsyClient({ apiKey: 'sk-test', baseUrl: 'http://localhost:3001' });
    expect(client).toBeDefined();
  });
});

describe('Error classes', () => {
  it('AuthenticationError has status 401', () => {
    const err = new AuthenticationError();
    expect(err.status).toBe(401);
    expect(err.code).toBe('unauthorized');
    expect(err).toBeInstanceOf(AgentsyError);
  });

  it('ForbiddenError has status 403', () => {
    const err = new ForbiddenError();
    expect(err.status).toBe(403);
  });

  it('NotFoundError has status 404', () => {
    const err = new NotFoundError();
    expect(err.status).toBe(404);
  });

  it('ValidationError has status 422 with field errors', () => {
    const err = new ValidationError('Bad input', [{ field: 'name', message: 'required', code: 'required' }]);
    expect(err.status).toBe(422);
    expect(err.fieldErrors).toHaveLength(1);
  });

  it('RateLimitError has retryAfter', () => {
    const err = new RateLimitError('Too many', 30);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(30);
  });

  it('ServerError has status 500', () => {
    const err = new ServerError();
    expect(err.status).toBe(500);
  });
});

describe('createErrorFromResponse', () => {
  it('creates correct error type per status', () => {
    expect(createErrorFromResponse(401, { detail: 'bad key' })).toBeInstanceOf(AuthenticationError);
    expect(createErrorFromResponse(403, { detail: 'nope' })).toBeInstanceOf(ForbiddenError);
    expect(createErrorFromResponse(404, { detail: 'gone' })).toBeInstanceOf(NotFoundError);
    expect(createErrorFromResponse(422, { detail: 'bad' })).toBeInstanceOf(ValidationError);
    expect(createErrorFromResponse(429, { detail: 'slow down', retry_after: 10 })).toBeInstanceOf(RateLimitError);
    expect(createErrorFromResponse(500, { detail: 'broken' })).toBeInstanceOf(ServerError);
    expect(createErrorFromResponse(502, { detail: 'gateway' })).toBeInstanceOf(ServerError);
  });

  it('uses detail from body', () => {
    const err = createErrorFromResponse(404, { detail: 'Agent not found' });
    expect(err.message).toBe('Agent not found');
  });
});
