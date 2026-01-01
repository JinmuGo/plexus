import type {
  HistoryMessage,
  ToolExecution,
  ThinkingBlock,
} from 'shared/history-types'

export type TimelineItem =
  | { type: 'message'; data: HistoryMessage }
  | { type: 'tool'; data: ToolExecution }
  | { type: 'thinking'; data: ThinkingBlock }

export interface MessageStyleConfig {
  // Visual style
  showAvatar?: boolean
  compact?: boolean
  // Interaction
  showCopyButton?: boolean
  showExpandButton?: boolean
  // Callbacks
  onCopy?: (text: string, id: string) => void
}
