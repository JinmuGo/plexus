/**
 * Slash Command Service
 *
 * Manages Claude Code slash commands stored in ~/.claude/commands/
 * Creates, lists, and deletes markdown-based command files.
 */

import { devLog } from '../lib/utils'
import { app } from 'electron'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import type {
  SlashCommand,
  SavedSlashCommand,
  BashTemplateType,
} from 'shared/history-types'
import { getBashTemplate, BASH_TEMPLATE_LABELS } from '../constants/commands'

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get the Claude commands directory path
 */
function getCommandsDir(): string {
  return join(app.getPath('home'), '.claude', 'commands')
}

/**
 * Get the path for a specific command file
 */
function getCommandPath(name: string): string {
  return join(getCommandsDir(), `${name}.md`)
}

/**
 * Validate command name (alphanumeric, hyphens, underscores only)
 */
function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 50
}

// ============================================================================
// Command File Generation
// ============================================================================

/**
 * Generate markdown content for a slash command
 */
function generateCommandMarkdown(command: SlashCommand): string {
  const lines: string[] = []

  // Frontmatter
  lines.push('---')
  lines.push(`description: ${command.description}`)
  lines.push('---')
  lines.push('')

  // Arguments placeholder
  lines.push('$ARGUMENTS')
  lines.push('')

  // Bash script (optional)
  if (command.bashScript?.trim()) {
    lines.push('```bash')
    lines.push(command.bashScript.trim())
    lines.push('```')
    lines.push('')
  }

  // Prompt content
  lines.push(command.content)

  return lines.join('\n')
}

/**
 * Parse markdown file to extract command data
 */
function parseCommandMarkdown(
  content: string,
  _name: string
): Omit<SlashCommand, 'name'> | null {
  try {
    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!frontmatterMatch) {
      return null
    }

    const frontmatter = frontmatterMatch[1]
    const descriptionMatch = frontmatter.match(/description:\s*(.+)/)
    const description = descriptionMatch ? descriptionMatch[1].trim() : ''

    // Remove frontmatter and $ARGUMENTS
    let body = content
      .replace(/^---\n[\s\S]*?\n---\n*/, '')
      .replace(/^\$ARGUMENTS\n*/m, '')
      .trim()

    // Extract bash script if present
    let bashScript: string | undefined
    const bashMatch = body.match(/```bash\n([\s\S]*?)\n```/)
    if (bashMatch) {
      bashScript = bashMatch[1].trim()
      body = body.replace(/```bash\n[\s\S]*?\n```\n*/, '').trim()
    }

    return {
      description,
      content: body,
      bashScript,
    }
  } catch (error) {
    devLog.error('Failed to parse command markdown:', error)
    return null
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Save a slash command to ~/.claude/commands/
 */
export async function saveSlashCommand(command: SlashCommand): Promise<void> {
  if (!isValidCommandName(command.name)) {
    throw new Error(
      'Invalid command name. Use only letters, numbers, hyphens, and underscores (max 50 chars).'
    )
  }

  const dir = getCommandsDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o755 })
  }

  const path = getCommandPath(command.name)
  const markdown = generateCommandMarkdown(command)

  writeFileSync(path, markdown, { encoding: 'utf-8', mode: 0o644 })
  devLog.info(`Slash command saved: ${command.name}`)
}

/**
 * List all slash commands
 */
export async function listSlashCommands(): Promise<SavedSlashCommand[]> {
  const dir = getCommandsDir()
  if (!existsSync(dir)) {
    return []
  }

  const commands: SavedSlashCommand[] = []
  const files = readdirSync(dir)

  for (const file of files) {
    if (!file.endsWith('.md')) continue

    const name = file.replace('.md', '')
    const path = join(dir, file)

    try {
      const content = readFileSync(path, 'utf-8')
      const parsed = parseCommandMarkdown(content, name)
      if (parsed) {
        const stats = statSync(path)
        commands.push({
          name,
          ...parsed,
          createdAt: stats.birthtimeMs,
          updatedAt: stats.mtimeMs,
        })
      }
    } catch (error) {
      devLog.warn(`Failed to read command file: ${file}`, error)
    }
  }

  // Sort by updated time (newest first)
  return commands.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Get a single slash command by name
 */
export async function getSlashCommand(
  name: string
): Promise<SavedSlashCommand | null> {
  const path = getCommandPath(name)
  if (!existsSync(path)) {
    return null
  }

  try {
    const content = readFileSync(path, 'utf-8')
    const parsed = parseCommandMarkdown(content, name)
    if (parsed) {
      const stats = statSync(path)
      return {
        name,
        ...parsed,
        createdAt: stats.birthtimeMs,
        updatedAt: stats.mtimeMs,
      }
    }
  } catch (error) {
    devLog.error(`Failed to get command: ${name}`, error)
  }

  return null
}

/**
 * Delete a slash command
 */
export async function deleteSlashCommand(name: string): Promise<boolean> {
  const path = getCommandPath(name)
  if (!existsSync(path)) {
    return false
  }

  try {
    unlinkSync(path)
    devLog.info(`Slash command deleted: ${name}`)
    return true
  } catch (error) {
    devLog.error(`Failed to delete command: ${name}`, error)
    return false
  }
}

/**
 * Check if a command with the given name exists
 */
export async function commandExists(name: string): Promise<boolean> {
  return existsSync(getCommandPath(name))
}

/**
 * Get bash template content by type
 */
export function getBashTemplateContent(type: BashTemplateType): string {
  return getBashTemplate(type)
}

/**
 * Get all bash template labels for UI
 */
export function getBashTemplateOptions(): Array<{
  value: BashTemplateType
  label: string
}> {
  return (
    Object.entries(BASH_TEMPLATE_LABELS) as Array<[BashTemplateType, string]>
  ).map(([value, label]) => ({ value, label }))
}
