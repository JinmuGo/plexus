/**
 * Shared React Hooks
 *
 * This folder contains reusable hooks for the renderer process.
 * Add common hooks here and re-export them from this index file.
 */

// Note: Keyboard shortcuts are now handled by the new system in lib/keyboard/
// See: useScopedShortcuts, useGlobalShortcuts from 'renderer/lib/keyboard'

// Project navigation
export { useProjects, filterSessionsByProject } from './use-projects'
export type { Project } from './use-projects'
