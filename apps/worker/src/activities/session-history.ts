import { messages, createPgClient, eq, desc } from '@agentsy/db';

let db: ReturnType<typeof createPgClient> | undefined;

function getDb() {
  if (db) return db;
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  db = createPgClient(url);
  return db;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

/**
 * Activity: Load the last N messages from a session for multi-turn context.
 */
export async function loadSessionHistory(
  sessionId: string,
  maxMessages: number = 20,
): Promise<SessionMessage[]> {
  const database = getDb();

  const rows = await database
    .select({
      role: messages.role,
      content: messages.content,
      toolCallId: messages.toolCallId,
      messageOrder: messages.messageOrder,
    })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.messageOrder))
    .limit(maxMessages);

  // Reverse to get chronological order
  return rows.reverse().map((r) => ({
    role: r.role as 'user' | 'assistant' | 'tool',
    content: r.content,
    toolCallId: r.toolCallId ?? undefined,
  }));
}
