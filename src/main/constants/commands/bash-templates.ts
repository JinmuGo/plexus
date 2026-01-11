/**
 * Bash Templates for Slash Commands
 *
 * Pre-defined bash script templates that can be included in Claude Code
 * slash commands to gather context before prompting.
 */

import type { BashTemplateType } from 'shared/history-types'

/**
 * Bash template definitions
 */
export const BASH_TEMPLATES: Record<
  Exclude<BashTemplateType, 'none' | 'custom'>,
  string
> = {
  /**
   * Basic git status and staged changes
   */
  git: `git status --short
git diff --staged --stat`,

  /**
   * Full git context including recent commits
   */
  gitFull: `git status --short
git diff --staged
git log --oneline -5`,

  /**
   * List files in current directory
   */
  files: `ls -la`,

  /**
   * TypeScript type check errors
   */
  typescript: `npx tsc --noEmit 2>&1 | head -50`,
}

/**
 * Template descriptions for UI display
 */
export const BASH_TEMPLATE_LABELS: Record<BashTemplateType, string> = {
  none: 'No Bash context',
  git: 'Git status & staged changes',
  gitFull: 'Full Git context (status, diff, log)',
  files: 'File listing',
  typescript: 'TypeScript errors',
  custom: 'Custom script',
}

/**
 * Get bash template content by type
 */
export function getBashTemplate(type: BashTemplateType): string {
  if (type === 'none' || type === 'custom') {
    return ''
  }
  return BASH_TEMPLATES[type] || ''
}
