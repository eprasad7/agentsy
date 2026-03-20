import { organizationMembers, organizations } from '@agentsy/db';
import { newId } from '@agentsy/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanOrgData, createTestDb, seedTestOrg, type TestDb } from './helpers.js';

describe('Organization & Member Endpoints (integration)', () => {
  let db: TestDb;
  let orgData: Awaited<ReturnType<typeof seedTestOrg>>;

  beforeAll(async () => {
    db = createTestDb();
    orgData = await seedTestOrg(db, 'org-test');
  });

  afterAll(async () => {
    await cleanOrgData(db, orgData.orgId);
  });

  it('reads organization by ID', async () => {
    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgData.orgId))
      .limit(1);

    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toContain('org-test');
    expect(result[0]!.plan).toBe('free');
  });

  it('updates organization name', async () => {
    await db
      .update(organizations)
      .set({ name: 'Updated Org Name' })
      .where(eq(organizations.id, orgData.orgId));

    const result = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgData.orgId))
      .limit(1);

    expect(result[0]!.name).toBe('Updated Org Name');
  });

  it('lists members for org', async () => {
    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.orgId, orgData.orgId));

    expect(members.length).toBeGreaterThanOrEqual(1);
    expect(members[0]!.role).toBe('admin');
  });

  it('invites a new member (creates pending record)', async () => {
    const memberId = newId('mem');
    await db.insert(organizationMembers).values({
      id: memberId,
      orgId: orgData.orgId,
      userId: 'pending:newuser@example.com',
      role: 'member',
    });

    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.orgId, orgData.orgId));

    expect(members.length).toBe(2);
    const pendingMember = members.find((m) => m.userId.startsWith('pending:'));
    expect(pendingMember).toBeDefined();
    expect(pendingMember!.role).toBe('member');
  });

  it('changes member role', async () => {
    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.orgId, orgData.orgId));

    const pendingMember = members.find((m) => m.userId.startsWith('pending:'));
    expect(pendingMember).toBeDefined();

    await db
      .update(organizationMembers)
      .set({ role: 'admin' })
      .where(eq(organizationMembers.id, pendingMember!.id));

    const updated = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(eq(organizationMembers.id, pendingMember!.id))
      .limit(1);

    expect(updated[0]!.role).toBe('admin');
  });

  it('removes a member', async () => {
    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.orgId, orgData.orgId));

    const pendingMember = members.find((m) => m.userId.startsWith('pending:'));
    expect(pendingMember).toBeDefined();

    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, pendingMember!.id));

    const remaining = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.orgId, orgData.orgId));

    expect(remaining.length).toBe(1);
    expect(remaining[0]!.userId).toBe(orgData.userId);
  });

  it('seeds 3 default environments on org creation', async () => {
    const { environments } = await import('@agentsy/db');
    const envs = await db
      .select()
      .from(environments)
      .where(eq(environments.orgId, orgData.orgId));

    expect(envs).toHaveLength(3);
    const names = envs.map((e) => e.name).sort();
    expect(names).toEqual(['development', 'production', 'staging']);
  });
});
