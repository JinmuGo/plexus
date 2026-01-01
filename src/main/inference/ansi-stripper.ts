import stripAnsi from 'strip-ansi'

// Common spinner characters used by CLI tools
const SPINNER_CHARS = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
  '◐',
  '◓',
  '◑',
  '◒',
  '⣾',
  '⣽',
  '⣻',
  '⢿',
  '⡿',
  '⣟',
  '⣯',
  '⣷',
]

// Control characters and cursor movement sequences to remove
const CONTROL_PATTERNS = [
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[\?25[lh]/g, // Hide/show cursor
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[[\d;]*[HfABCDEFGJKST]/g, // Cursor movement
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[\d*[ABCD]/g, // Arrow key sequences
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[2K/g, // Clear line
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[0K/g, // Clear to end of line
  /\r/g, // Carriage return (used for progress updates)
]

export interface StrippedOutput {
  // Clean text without ANSI codes
  text: string
  // Original text with ANSI codes preserved
  original: string
  // Whether spinner activity was detected
  hasSpinner: boolean
  // Extracted progress percentage if any
  progress: number | null
}

/**
 * Strip ANSI codes and control sequences from terminal output
 */
export function stripOutput(input: string): StrippedOutput {
  const original = input

  // First pass: use strip-ansi library
  let text = stripAnsi(input)

  // Second pass: remove additional control sequences
  for (const pattern of CONTROL_PATTERNS) {
    text = text.replace(pattern, '')
  }

  // Detect spinner characters
  const hasSpinner = SPINNER_CHARS.some(char => input.includes(char))

  // Try to extract progress percentage
  const progressMatch = text.match(/(\d{1,3})%/)
  const progress = progressMatch ? parseInt(progressMatch[1], 10) : null

  // Clean up multiple spaces and normalize whitespace
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    text,
    original,
    hasSpinner,
    progress,
  }
}

/**
 * Extract the last N lines from stripped output
 */
export function getLastLines(text: string, n: number): string[] {
  const lines = text.split('\n').filter(line => line.trim().length > 0)
  return lines.slice(-n)
}

/**
 * Check if text contains any of the given patterns
 */
export function matchesAnyPattern(
  text: string,
  patterns: RegExp[]
): RegExp | null {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return pattern
    }
  }
  return null
}
