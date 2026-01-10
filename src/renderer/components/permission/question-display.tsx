/**
 * Question Display Component
 *
 * Read-only display for AskUserQuestion tool results.
 * Claude Code does not support programmatic answers to this tool (Issue #12605),
 * so we only display the question and options for user awareness.
 */

import { MessageCircleQuestion, Terminal } from 'lucide-react'
import type { QuestionContext } from 'shared/hook-types'

interface QuestionDisplayProps {
  question: QuestionContext
  compact?: boolean
}

export function QuestionDisplay({
  question,
  compact = false,
}: QuestionDisplayProps) {
  if (compact) {
    // Compact mode for popover: just show the question text
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate italic">"{question.question}"</span>
      </div>
    )
  }

  // Full mode for dashboard: show question with options
  return (
    <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border/50">
      {/* Header */}
      {question.header && (
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {question.header}
        </div>
      )}

      {/* Question */}
      <div className="flex gap-2">
        <MessageCircleQuestion className="h-4 w-4 shrink-0 mt-0.5 text-status-thinking" />
        <p className="text-sm">{question.question}</p>
      </div>

      {/* Options */}
      {question.options && question.options.length > 0 && (
        <div className="pl-6 space-y-1.5">
          {question.options.map((option, index) => (
            <div
              className="flex items-start gap-2 text-sm"
              key={`${question.toolUseId}-option-${option.slice(0, 20)}`}
            >
              <span className="text-muted-foreground shrink-0">
                {index + 1}.
              </span>
              <span className="text-foreground/80">{option}</span>
            </div>
          ))}
        </div>
      )}

      {/* Terminal hint */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/30">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Please respond in the terminal
        </span>
      </div>
    </div>
  )
}
