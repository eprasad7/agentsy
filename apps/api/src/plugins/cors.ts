import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

export async function registerCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://app.agentsy.com',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit-Requests',
      'X-RateLimit-Remaining-Requests',
      'X-RateLimit-Reset-Requests',
      'X-RateLimit-Limit-Tokens',
      'X-RateLimit-Remaining-Tokens',
      'X-RateLimit-Reset-Tokens',
    ],
  });
}
