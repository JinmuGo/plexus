/**
 * Shared React Hooks
 *
 * This folder contains reusable hooks for the renderer process.
 * Add common hooks here and re-export them from this index file.
 */

// Re-export keyboard shortcuts hook from its dedicated folder
export { useKeyboardShortcuts } from '../use-keyboard-shortcuts'

// Project navigation
export { useProjects, filterSessionsByProject } from './use-projects'
export type { Project } from './use-projects'
