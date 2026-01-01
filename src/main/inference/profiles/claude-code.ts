import type { AgentStatus } from 'shared/types'

/**
 * Pattern definition for status detection
 */
export interface StatusPattern {
  status: AgentStatus
  patterns: RegExp[]
  priority: number // Higher priority wins when multiple match
}

/**
 * Agent profile configuration
 */
export interface AgentProfile {
  name: string
  displayName: string
  patterns: StatusPattern[]
}

/**
 * Claude Code specific patterns for status detection
 * Based on Claude Code CLI output analysis
 */
export const claudeCodeProfile: AgentProfile = {
  name: 'claude-code',
  displayName: 'Claude Code',
  patterns: [
    // Error patterns (highest priority)
    {
      status: 'error',
      priority: 100,
      patterns: [
        /Error:/i,
        /error\[/i,
        /Exception:/i,
        /FAILED/i,
        /fatal:/i,
        /panic:/i,
        /✗|✖|❌/,
        /Command failed/i,
        /Permission denied/i,
        /not found/i,
        /cannot find/i,
      ],
    },

    // Awaiting input patterns (high priority)
    {
      status: 'awaiting',
      priority: 90,
      patterns: [
        /\[y\/N\]/i,
        /\[Y\/n\]/i,
        /\(y\/n\)/i,
        /Press Enter/i,
        /Continue\?/i,
        /Confirm\?/i,
        /Do you want to/i,
        /Would you like to/i,
        /waiting for.*input/i,
        /⏺/, // Claude Code waiting indicator
        /\?$/m, // Lines ending with question mark
        /Enter.*:/i,
        /Password:/i,
        /> $/m, // Prompt waiting for input
      ],
    },

    // Tool use patterns
    {
      status: 'tool_use',
      priority: 80,
      patterns: [
        /Writing to/i,
        /Reading from/i,
        /Executing/i,
        /Running/i,
        /Creating file/i,
        /Deleting file/i,
        /Modifying/i,
        /Updating/i,
        /Installing/i,
        /Building/i,
        /Compiling/i,
        /Testing/i,
        /Fetching/i,
        /Downloading/i,
        /Uploading/i,
        /🔧|🛠️|⚙️/, // Tool emojis
        /\[Bash\]/i,
        /\[Read\]/i,
        /\[Write\]/i,
        /\[Edit\]/i,
        /\[Glob\]/i,
        /\[Grep\]/i,
        /\[Task\]/i,
      ],
    },

    // Thinking patterns
    {
      status: 'thinking',
      priority: 70,
      patterns: [
        /Thinking/i,
        /Processing/i,
        /Analyzing/i,
        /Generating/i,
        /Loading/i,
        /Searching/i,
        /Scanning/i,
        /Parsing/i,
        /Evaluating/i,
        /Computing/i,
        /🤔|💭/, // Thinking emojis
        /\.{3}$/, // Lines ending with ...
        /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/, // Spinner characters
      ],
    },

    // Idle/Success patterns (higher than thinking to catch completion signals)
    {
      status: 'idle',
      priority: 75,
      patterns: [
        /Done/i,
        /Complete/i,
        /Success/i,
        /Finished/i,
        /✓|✔|✅/,
        /All tasks completed/i,
        /Ready/i,
        /\$ $/m, // Shell prompt
      ],
    },
  ],
}

/**
 * Gemini CLI specific patterns for status detection
 * Fix #12: Added Gemini CLI profile for terminal output pattern recognition
 */
export const geminiCliProfile: AgentProfile = {
  name: 'gemini-cli',
  displayName: 'Gemini CLI',
  patterns: [
    // Error patterns (highest priority)
    {
      status: 'error',
      priority: 100,
      patterns: [
        /Error:/i,
        /error\[/i,
        /Exception:/i,
        /FAILED/i,
        /fatal:/i,
        /✗|✖|❌/,
        /Command failed/i,
        /Permission denied/i,
        /not found/i,
        /API error/i,
        /Rate limit/i,
      ],
    },

    // Awaiting input patterns (high priority)
    {
      status: 'awaiting',
      priority: 90,
      patterns: [
        /\[y\/N\]/i,
        /\[Y\/n\]/i,
        /\(y\/n\)/i,
        /Continue\?/i,
        /Approve\?/i,
        /Allow\?/i,
        /waiting for.*input/i,
        /\?$/m, // Lines ending with question mark
        /> $/m, // Prompt waiting for input
        /gemini>/i, // Gemini CLI prompt
      ],
    },

    // Tool use patterns
    {
      status: 'tool_use',
      priority: 80,
      patterns: [
        /Executing/i,
        /Running/i,
        /Writing/i,
        /Reading/i,
        /Creating/i,
        /Modifying/i,
        /🔧|🛠️|⚙️/, // Tool emojis
        /\[Tool\]/i,
        /\[Shell\]/i,
        /\[Function\]/i,
      ],
    },

    // Thinking patterns
    {
      status: 'thinking',
      priority: 70,
      patterns: [
        /Thinking/i,
        /Processing/i,
        /Generating/i,
        /Loading/i,
        /Analyzing/i,
        /🤔|💭/, // Thinking emojis
        /\.{3}$/, // Lines ending with ...
        /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/, // Spinner characters
      ],
    },

    // Idle/Success patterns
    {
      status: 'idle',
      priority: 75,
      patterns: [
        /Done/i,
        /Complete/i,
        /Success/i,
        /Finished/i,
        /✓|✔|✅/,
        /Ready/i,
      ],
    },
  ],
}

/**
 * Get all available agent profiles
 */
export function getAvailableProfiles(): AgentProfile[] {
  return [claudeCodeProfile, geminiCliProfile]
}

/**
 * Get profile by agent type
 */
export function getProfileByType(agentType: string): AgentProfile | undefined {
  const profiles = getAvailableProfiles()

  // Handle agent type to profile name mapping
  if (agentType === 'gemini') {
    return geminiCliProfile
  }
  if (agentType === 'claude') {
    return claudeCodeProfile
  }

  return profiles.find(p => p.name === agentType)
}
