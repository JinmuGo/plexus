import { useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Sparkles, Copy, ChevronDown } from 'lucide-react'
import { cn } from 'renderer/lib/utils'
import { Button } from 'renderer/components/ui/button'
import { MarkdownContent } from 'renderer/components/ui/markdown-content'
import type { HistoryMessage } from 'shared/history-types'

const { App } = window

interface MessageBubbleProps {
  message: HistoryMessage
  isActive?: boolean
  showCopyButton?: boolean
  onCopy?: (text: string) => void
}

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Spring animation for smooth, premium feel
const messageSpring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
}

const expandSpring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 25,
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isActive = false,
  showCopyButton = true,
  onCopy,
}: MessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [fullContent, setFullContent] = useState<string | null>(null)
  const [isLoadingFull, setIsLoadingFull] = useState(false)

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  // Check if message has more content (truncated with ...)
  const hasMoreContent =
    message.contentPreview?.endsWith('...') ||
    (message.jsonlPath !== null && message.content.endsWith('...'))

  const loadFullContent = async () => {
    if (fullContent) {
      setIsExpanded(true)
      return
    }

    setIsLoadingFull(true)
    try {
      const result = await App.history.getFullContent(message.id)
      if (result.content) {
        setFullContent(result.content)
        setIsExpanded(true)
      }
    } catch (error) {
      console.error('Failed to load full content:', error)
    } finally {
      setIsLoadingFull(false)
    }
  }

  const displayContent =
    isExpanded && fullContent ? fullContent : message.content

  const handleCopy = () => {
    onCopy?.(displayContent)
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        'group flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={messageSpring}
    >
      {/* Status Indicator Dot / Avatar */}
      <div className="flex-shrink-0 pt-1">
        {isUser ? (
          <motion.div
            className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center',
              'bg-gradient-to-br from-primary/90 to-primary',
              'shadow-sm shadow-primary/20'
            )}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            whileHover={{ scale: 1.05 }}
          >
            <User className="w-3.5 h-3.5 text-primary-foreground" />
          </motion.div>
        ) : (
          <motion.div
            animate={isActive ? { scale: [1, 1.2, 1] } : {}}
            className={cn(
              'w-2 h-2 rounded-full mt-2',
              isActive
                ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                : 'bg-emerald-400/60'
            )}
            transition={{
              repeat: isActive ? Number.POSITIVE_INFINITY : 0,
              duration: 1.5,
            }}
          />
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          'flex-1 min-w-0 max-w-[85%]',
          isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'
        )}
      >
        {/* Role Label */}
        <div
          className={cn(
            'flex items-center gap-1.5 mb-1',
            isUser ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
            {isUser ? 'You' : 'Claude'}
          </span>
          {isAssistant && (
            <Sparkles className="w-2.5 h-2.5 text-emerald-400/70" />
          )}
        </div>

        {/* Message Bubble */}
        <motion.div
          className={cn(
            'relative rounded-2xl text-sm leading-relaxed',
            isUser
              ? [
                  'bg-primary/15 backdrop-blur-sm',
                  'border border-primary/20',
                  'px-4 py-3',
                ]
              : ['bg-transparent', 'text-foreground/90', 'pr-4']
          )}
          layout
          transition={expandSpring}
        >
          {/* Content */}
          {isUser ? (
            <div className="whitespace-pre-wrap break-words text-foreground">
              {displayContent}
            </div>
          ) : (
            <MarkdownContent
              className="text-foreground/90"
              content={displayContent}
            />
          )}

          {/* Expand/Collapse for long content */}
          <AnimatePresence>
            {hasMoreContent && (
              <motion.div
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2"
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 0, height: 0 }}
              >
                <Button
                  className={cn(
                    'h-6 text-[10px] gap-1 px-2',
                    isUser
                      ? 'text-primary hover:text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  disabled={isLoadingFull}
                  onClick={
                    isExpanded ? () => setIsExpanded(false) : loadFullContent
                  }
                  size="sm"
                  variant="ghost"
                >
                  <ChevronDown
                    className={cn(
                      'w-3 h-3 transition-transform',
                      isExpanded && 'rotate-180'
                    )}
                  />
                  {isLoadingFull
                    ? 'Loading...'
                    : isExpanded
                      ? 'Show less'
                      : 'Show full message'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Footer: Time + Copy */}
        <div
          className={cn(
            'flex items-center gap-2 mt-1.5',
            isUser ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">
            {formatTime(message.timestamp)}
          </span>

          {showCopyButton && (
            <motion.div
              animate={{ opacity: 1 }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              initial={{ opacity: 0 }}
            >
              <Button
                className="h-5 w-5 text-muted-foreground/50 hover:text-foreground"
                onClick={handleCopy}
                size="icon"
                variant="ghost"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
})
