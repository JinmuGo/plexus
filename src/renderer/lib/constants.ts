/**
 * Renderer Constants
 *
 * Shared constants used across renderer components and stores.
 */

/**
 * Phase priority for sorting sessions.
 * Lower number = higher priority (needs more attention).
 */
export const PHASE_PRIORITY: Record<string, number> = {
  waitingForApproval: 0, // Needs user decision
  processing: 1, // Actively processing
  waitingForInput: 2, // Waiting for user input
  compacting: 3, // Context compaction in progress
  idle: 4, // Ready/completed
  ended: 5, // Session ended
}

/**
 * Compare sessions by phase priority (for sorting).
 * Returns negative if a has higher priority, positive if b has higher priority.
 */
export function compareByPhasePriority(phaseA: string, phaseB: string): number {
  const priorityA = PHASE_PRIORITY[phaseA] ?? 99
  const priorityB = PHASE_PRIORITY[phaseB] ?? 99
  return priorityA - priorityB
}
