import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export function registerRequestLogger(app: FastifyInstance): void {
  app.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done) => {
    const duration = reply.elapsedTime;
    request.log.info({
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      duration_ms: Math.round(duration),
      org_id: (request as { orgId?: string }).orgId ?? null,
    });
    done();
  });
}
