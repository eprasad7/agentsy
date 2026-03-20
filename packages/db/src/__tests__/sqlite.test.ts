import { newId } from '@agentsy/shared';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';

import * as schema from '../sqlite-schema';

describe('SQLite dev mode', () => {
  const createDb = () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        external_auth_id TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        billing_email TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime()),
        updated_at TEXT NOT NULL DEFAULT (datetime()),
        deleted_at TEXT
      );

      CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime()),
        updated_at TEXT NOT NULL DEFAULT (datetime()),
        deleted_at TEXT
      );

      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id),
        agent_id TEXT NOT NULL REFERENCES agents(id),
        version_id TEXT,
        session_id TEXT,
        parent_run_id TEXT,
        environment_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        input TEXT NOT NULL,
        output TEXT,
        error TEXT,
        total_tokens_in INTEGER NOT NULL DEFAULT 0,
        total_tokens_out INTEGER NOT NULL DEFAULT 0,
        total_cost_usd REAL NOT NULL DEFAULT 0,
        duration_ms INTEGER,
        model TEXT,
        temporal_workflow_id TEXT,
        trace_id TEXT,
        metadata TEXT DEFAULT '{}',
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime()),
        updated_at TEXT NOT NULL DEFAULT (datetime())
      );
    `);

    return db;
  };

  it('creates and reads organizations', () => {
    const db = createDb();
    const id = newId('org');

    db.insert(schema.organizations)
      .values({
        id,
        name: 'Test Org',
        slug: 'test-org',
        externalAuthId: 'ext_123',
      })
      .run();

    const result = db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, id))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Test Org');
    expect(result[0]?.plan).toBe('free');
  });

  it('creates agents with org reference', () => {
    const db = createDb();
    const orgId = newId('org');
    const agentId = newId('ag');

    db.insert(schema.organizations)
      .values({
        id: orgId,
        name: 'Test Org',
        slug: 'test-org',
        externalAuthId: 'ext_123',
      })
      .run();

    db.insert(schema.agents)
      .values({
        id: agentId,
        orgId,
        name: 'My Agent',
        slug: 'my-agent',
        description: 'A test agent',
      })
      .run();

    const result = db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.orgId, orgId))
      .all();

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('My Agent');
  });

  it('creates runs with JSONB input', () => {
    const db = createDb();
    const orgId = newId('org');
    const agentId = newId('ag');
    const runId = newId('run');

    db.insert(schema.organizations)
      .values({ id: orgId, name: 'Org', slug: 'org', externalAuthId: 'ext' })
      .run();
    db.insert(schema.agents)
      .values({ id: agentId, orgId, name: 'Agent', slug: 'agent' })
      .run();
    db.insert(schema.runs)
      .values({
        id: runId,
        orgId,
        agentId,
        environmentId: 'env_test',
        input: { type: 'text', text: 'Hello' },
        status: 'queued',
      })
      .run();

    const result = db.select().from(schema.runs).where(eq(schema.runs.id, runId)).all();

    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('queued');
  });
});
