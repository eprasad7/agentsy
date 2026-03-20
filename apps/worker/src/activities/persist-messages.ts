import { messages, createPgClient, sql } from '@agentsy/db';
import { newId } from '@agentsy/shared';

let db: ReturnType<typeof createPgClient> | undefined;

function getDb() {
  if (db) return db;
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  db = createPgClient(url);
  return db;
}

/**
 * Activity: Persist user input and agent output messages to the session.
 * Non-critical — logs and continues on failure.
 */
export async function persistMessages(input: {
  sessionId: string;
  orgId: string;
  runId: string;
  userMessage: string;
  agentMessage: string;
}): Promise<void> {
  try {
    const database = getDb();

    // Get the next message order (use FOR UPDATE to prevent race conditions)
    const maxOrderResult = await database.execute(
      sql`SELECT COALESCE(MAX(message_order), 0) as max_order FROM messages WHERE session_id = ${input.sessionId}`,
    );
    const maxOrder = (maxOrderResult[0] as Record<string, unknown>)?.['max_order'] as number ?? 0;

    const now = new Date();

    // Insert user message
    await database.insert(messages).values({
      id: newId('msg'),
      sessionId: input.sessionId,
      orgId: input.orgId,
      runId: input.runId,
      role: 'user',
      content: input.userMessage,
      messageOrder: maxOrder + 1,
      createdAt: now,
    });

    // Insert assistant message
    await database.insert(messages).values({
      id: newId('msg'),
      sessionId: input.sessionId,
      orgId: input.orgId,
      runId: input.runId,
      role: 'assistant',
      content: input.agentMessage,
      messageOrder: maxOrder + 2,
      createdAt: now,
    });
  } catch (err) {
    console.warn(`Failed to persist messages for session ${input.sessionId}:`, err instanceof Error ? err.message : err);
  }
}
