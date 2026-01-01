/**
 * Main Process Utilities
 *
 * Common utility functions used across the main process.
 */

/**
 * Generate a unique ID using timestamp and random string.
 * Used for database records and internal identifiers.
 *
 * @returns A unique string ID (e.g., "lxyz123-abc456def")
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Format tool input for display purposes.
 * Handles common tool types like Bash, Read, Edit, etc.
 *
 * @param toolName - Name of the tool
 * @param toolInput - Tool input object
 * @param maxLength - Maximum length for the result (default: 100)
 * @returns Formatted string representation
 */
export function formatToolInput(
  toolName: string | undefined,
  toolInput: Record<string, unknown> | undefined,
  maxLength = 100
): string {
  if (!toolInput) return ''

  // Handle common tool types
  switch (toolName?.toLowerCase()) {
    case 'bash': {
      const command = toolInput.command as string | undefined
      return command ? truncate(command, maxLength) : ''
    }
    case 'read': {
      const filePath = toolInput.file_path as string | undefined
      return filePath ? `Reading ${truncate(filePath, maxLength - 8)}` : ''
    }
    case 'write': {
      const filePath = toolInput.file_path as string | undefined
      return filePath ? `Writing ${truncate(filePath, maxLength - 8)}` : ''
    }
    case 'edit': {
      const filePath = toolInput.file_path as string | undefined
      return filePath ? `Editing ${truncate(filePath, maxLength - 8)}` : ''
    }
    case 'glob': {
      const pattern = toolInput.pattern as string | undefined
      return pattern ? `Pattern: ${truncate(pattern, maxLength - 9)}` : ''
    }
    case 'grep': {
      const pattern = toolInput.pattern as string | undefined
      return pattern ? `Search: ${truncate(pattern, maxLength - 8)}` : ''
    }
    case 'task': {
      const description = toolInput.description as string | undefined
      return description ? truncate(description, maxLength) : ''
    }
    case 'webfetch': {
      const url = toolInput.url as string | undefined
      return url ? truncate(url, maxLength) : ''
    }
    case 'websearch': {
      const query = toolInput.query as string | undefined
      return query ? truncate(query, maxLength) : ''
    }
    default: {
      // For unknown tools, try to extract meaningful info
      const keys = Object.keys(toolInput)
      if (keys.length === 0) return ''

      // Try common field names
      for (const key of [
        'command',
        'query',
        'path',
        'file_path',
        'url',
        'description',
        'message',
      ]) {
        const value = toolInput[key]
        if (typeof value === 'string' && value.length > 0) {
          return truncate(value, maxLength)
        }
      }

      // Fallback to first string value
      for (const key of keys) {
        const value = toolInput[key]
        if (typeof value === 'string' && value.length > 0) {
          return truncate(value, maxLength)
        }
      }

      return ''
    }
  }
}

/**
 * Truncate a string to a maximum length with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return `${str.slice(0, maxLength - 1)}…`
}
