import { newId } from '@agentsy/shared';

/**
 * Activity: Generate a prefixed ID. Used by workflows to create step IDs
 * before passing them to both streaming events and persistence.
 */
export async function generateStepId(): Promise<string> {
  return newId('stp');
}
