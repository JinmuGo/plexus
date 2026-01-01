export { stripOutput, getLastLines, matchesAnyPattern } from './ansi-stripper'
export type { StrippedOutput } from './ansi-stripper'

export {
  StatusDetector,
  createStatusDetector,
} from './status-detector'
export type { DetectionResult, DetectorConfig } from './status-detector'

export {
  claudeCodeProfile,
  getAvailableProfiles,
  getProfileByType,
} from './profiles/claude-code'
export type { AgentProfile, StatusPattern } from './profiles/claude-code'
