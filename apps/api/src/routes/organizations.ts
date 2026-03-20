import { organizations, organizationMembers } from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DbClient } from '../lib/db.js';
import { getDb } from '../lib/request-db.js';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  billing_email: z.string().email().optional(),
});

export function organizationRoutes(app: FastifyInstance, db: DbClient): void {
  // GET /v1/organization — current org
  app.get('/v1/organization', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);

    const result = await d
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .limit(1);

    if (!result[0]) throw notFound('Organization not found');

    const org = result[0];
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      billing_email: org.billingEmail,
      created_at: org.createdAt.toISOString(),
      updated_at: org.updatedAt.toISOString(),
    };
  });

  // PATCH /v1/organization — update org (admin only)
  app.patch('/v1/organization', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);

    // Check admin role
    if (request.userRole && request.userRole !== 'admin') {
      throw forbidden('Only admins can update organization settings');
    }

    const body = updateOrgSchema.parse(request.body);

    const updates: Record<string, unknown> = {};
    if (body.name) updates['name'] = body.name;
    if (body.billing_email) updates['billingEmail'] = body.billing_email;

    if (Object.keys(updates).length === 0) {
      throw validationError('No fields to update');
    }

    const result = await d
      .update(organizations)
      .set(updates)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .returning();

    const org = result[0]!;
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      billing_email: org.billingEmail,
      created_at: org.createdAt.toISOString(),
      updated_at: org.updatedAt.toISOString(),
    };
  });
}

export function memberRoutes(app: FastifyInstance, db: DbClient): void {
  // GET /v1/organization/members
  app.get('/v1/organization/members', async (request) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);

    const members = await d
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.orgId, orgId));

    return {
      data: members.map((m) => ({
        id: m.id,
        user_id: m.userId,
        role: m.role,
        created_at: m.createdAt.toISOString(),
      })),
    };
  });

  // POST /v1/organization/members/invite (admin only)
  app.post('/v1/organization/members/invite', async (request, reply) => {
    const orgId = request.orgId!;
    const d = getDb(request, db);

    if (request.userRole && request.userRole !== 'admin') {
      throw forbidden('Only admins can invite members');
    }

    const inviteSchema = z.object({
      email: z.string().email(),
      role: z.enum(['admin', 'member']).default('member'),
    });
    const body = inviteSchema.parse(request.body);

    // Create a pending member record
    // In production, this would also send an invite email with a token
    const id = newId('mem');
    await d.insert(organizationMembers).values({
      id,
      orgId,
      userId: `pending:${body.email}`, // Placeholder until user accepts invite
      role: body.role,
    });

    reply.status(201);
    return {
      id,
      email: body.email,
      role: body.role,
      status: 'invited',
    };
  });

  // PATCH /v1/organization/members/:id (admin only: role change)
  app.patch<{ Params: { id: string } }>(
    '/v1/organization/members/:id',
    async (request) => {
      const orgId = request.orgId!;
      const d = getDb(request, db);

      if (request.userRole && request.userRole !== 'admin') {
        throw forbidden('Only admins can change member roles');
      }

      const roleSchema = z.object({
        role: z.enum(['admin', 'member']),
      });
      const body = roleSchema.parse(request.body);

      const result = await d
        .update(organizationMembers)
        .set({ role: body.role })
        .where(
          and(
            eq(organizationMembers.id, request.params.id),
            eq(organizationMembers.orgId, orgId),
          ),
        )
        .returning();

      if (!result.length) throw notFound('Member not found');

      const m = result[0]!;
      return {
        id: m.id,
        user_id: m.userId,
        role: m.role,
        created_at: m.createdAt.toISOString(),
      };
    },
  );

  // DELETE /v1/organization/members/:id
  app.delete<{ Params: { id: string } }>(
    '/v1/organization/members/:id',
    async (request) => {
      const orgId = request.orgId!;
      const d = getDb(request, db);
      const memberId = request.params.id;

      if (request.userRole && request.userRole !== 'admin') {
        throw forbidden('Only admins can remove members');
      }

      const result = await d
        .delete(organizationMembers)
        .where(
          and(eq(organizationMembers.id, memberId), eq(organizationMembers.orgId, orgId)),
        )
        .returning({ id: organizationMembers.id });

      if (!result.length) throw notFound('Member not found');
      return { deleted: true };
    },
  );
}
