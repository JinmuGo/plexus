import { memo } from 'react'
import { motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { cn } from 'renderer/lib/utils'
import type { HistoryMessage } from 'shared/history-types'

interface SystemMessageProps {
  message: HistoryMessage
}

export const SystemMessage = memo(function SystemMessage({
  message,
}: SystemMessageProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-center py-2"
      initial={{ opacity: 0, y: 8 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
          'bg-muted/30 border border-border/30',
          'text-[11px] text-muted-foreground/70'
        )}
      >
        <Info className="w-3 h-3" />
        <span>{message.content}</span>
      </div>
    </motion.div>
  )
})
