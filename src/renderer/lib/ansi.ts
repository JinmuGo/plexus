/**
 * Strip ANSI escape codes from terminal output
 * Handles color codes, cursor movements, and other control sequences
 */

// Comprehensive ANSI escape code patterns
const ANSI_PATTERNS = [
  // Standard ANSI escape sequences (colors, styles)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[[0-9;]*m/g,
  // Cursor movement and positioning
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[[0-9;]*[HABCDEFGJKSTfsu]/g,
  // Hide/show cursor
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[\?25[lh]/g,
  // Alternative screen buffer
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[\?1049[lh]/g,
  // Mouse tracking
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[\?1000[lh]/g,
  // Bracketed paste mode
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[\?2004[lh]/g,
  // OSC sequences (title, etc)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\][^\x07]*\x07/g,
  // Generic CSI sequences
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b\[[0-9;?]*[a-zA-Z]/g,
  // Single character escapes
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x1b[DME78]/g,
  // Carriage return (move to start of line)
  /\r/g,
  // Bell character
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x07/g,
  // Backspace sequences
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI stripping
  /\x08/g,
]

/**
 * Strip all ANSI escape codes from a string
 */
export function stripAnsi(text: string): string {
  let result = text
  for (const pattern of ANSI_PATTERNS) {
    result = result.replace(pattern, '')
  }
  // Clean up extra whitespace but preserve intentional newlines
  return result.replace(/^\s+$/gm, '')
}
