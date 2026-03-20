// Workflow registry — Phase 0 ships a noop so the worker bundle is valid; Phase 2 adds real workflows.

/**
 * Placeholder workflow so `bundleWorkflowCode` produces a non-empty bundle.
 * Not invoked by production code in Phase 0.
 */
export async function phase0NoopWorkflow(): Promise<void> {
  // intentionally empty
}
