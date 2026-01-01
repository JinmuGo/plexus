import type { AgentStatus } from 'shared/types'
import { stripOutput, getLastLines } from './ansi-stripper'
import {
  type AgentProfile,
  type StatusPattern,
  getProfileByType,
  claudeCodeProfile,
} from './profiles/claude-code'

/**
 * Status detection result
 */
export interface DetectionResult {
  status: AgentStatus
  confidence: number // 0-1 confidence score
  matchedPattern: string | null
  rawOutput: string
  cleanOutput: string
}

/**
 * Status detector configuration
 */
export interface DetectorConfig {
  // Number of recent lines to analyze
  recentLinesCount: number
  // Minimum confidence threshold
  minConfidence: number
  // Debounce time in ms before status change
  debounceMs: number
}

const DEFAULT_CONFIG: DetectorConfig = {
  recentLinesCount: 10,
  minConfidence: 0.5,
  debounceMs: 100,
}

/**
 * Status detector for agent output analysis
 */
export class StatusDetector {
  private profile: AgentProfile
  private config: DetectorConfig
  private currentStatus: AgentStatus = 'idle'
  private outputBuffer: string[] = []
  private lastDetectionTime = 0

  constructor(
    agentType: string = 'claude-code',
    config: Partial<DetectorConfig> = {}
  ) {
    this.profile = getProfileByType(agentType) ?? claudeCodeProfile
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Process new output and detect status
   */
  detect(output: string): DetectionResult {
    const stripped = stripOutput(output)
    const cleanOutput = stripped.text

    // Add to buffer
    this.outputBuffer.push(cleanOutput)

    // Keep only recent lines in buffer
    if (this.outputBuffer.length > 100) {
      this.outputBuffer = this.outputBuffer.slice(-50)
    }

    // Get recent text for analysis
    const recentText = this.outputBuffer
      .slice(-this.config.recentLinesCount)
      .join('\n')

    // Detect status from patterns
    const detection = this.detectFromPatterns(recentText, stripped.hasSpinner)

    // Apply debounce for status changes
    const now = Date.now()
    if (
      detection.status !== this.currentStatus &&
      now - this.lastDetectionTime > this.config.debounceMs &&
      detection.confidence >= this.config.minConfidence
    ) {
      this.currentStatus = detection.status
      this.lastDetectionTime = now
    }

    return {
      ...detection,
      status: this.currentStatus,
      rawOutput: output,
      cleanOutput,
    }
  }

  /**
   * Detect status based on pattern matching
   */
  private detectFromPatterns(
    text: string,
    hasSpinner: boolean
  ): Omit<DetectionResult, 'rawOutput' | 'cleanOutput'> {
    let bestMatch: {
      status: AgentStatus
      pattern: StatusPattern
      matchedText: string
    } | null = null

    // Check all patterns in the profile
    for (const patternDef of this.profile.patterns) {
      for (const regex of patternDef.patterns) {
        const match = text.match(regex)
        if (match) {
          if (!bestMatch || patternDef.priority > bestMatch.pattern.priority) {
            bestMatch = {
              status: patternDef.status,
              pattern: patternDef,
              matchedText: match[0],
            }
          }
        }
      }
    }

    // If spinner detected and no higher priority match, it's thinking
    if (hasSpinner && (!bestMatch || bestMatch.pattern.priority < 70)) {
      return {
        status: 'thinking',
        confidence: 0.8,
        matchedPattern: 'spinner',
      }
    }

    if (bestMatch) {
      // Calculate confidence based on priority
      const confidence = Math.min(1, bestMatch.pattern.priority / 100)
      return {
        status: bestMatch.status,
        confidence,
        matchedPattern: bestMatch.matchedText,
      }
    }

    // Default to current status with low confidence
    return {
      status: this.currentStatus,
      confidence: 0.3,
      matchedPattern: null,
    }
  }

  /**
   * Get current detected status
   */
  getCurrentStatus(): AgentStatus {
    return this.currentStatus
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.currentStatus = 'idle'
    this.outputBuffer = []
    this.lastDetectionTime = 0
  }

  /**
   * Get recent output buffer
   */
  getRecentOutput(lines: number = 5): string[] {
    return getLastLines(this.outputBuffer.join('\n'), lines)
  }
}

/**
 * Create a status detector for the given agent type
 */
export function createStatusDetector(
  agentType: string = 'claude-code',
  config?: Partial<DetectorConfig>
): StatusDetector {
  return new StatusDetector(agentType, config)
}
