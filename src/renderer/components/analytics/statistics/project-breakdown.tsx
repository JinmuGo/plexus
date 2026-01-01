/**
 * ProjectBreakdown - Project usage statistics visualization
 *
 * Displays a horizontal bar chart of projects sorted by session count.
 * Uses glassmorphism and refined industrial design.
 */

import { motion } from 'framer-motion'
import { Folder, MessageSquare } from 'lucide-react'
import type { ProjectUsageStats } from 'shared/history-types'
import { AgentIcon } from 'renderer/components/ui/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from 'renderer/components/ui/tooltip'
import { cn } from 'renderer/lib/utils'

interface ProjectBreakdownProps {
  projects: ProjectUsageStats[]
  maxItems?: number
  className?: string
}

export function ProjectBreakdown({
  projects,
  maxItems = 5,
  className = '',
}: ProjectBreakdownProps) {
  const displayProjects = projects.slice(0, maxItems)
  const maxSessions = Math.max(...projects.map(p => p.sessionCount), 1)

  // Format relative time
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return `${Math.floor(days / 7)}w ago`
  }

  if (projects.length === 0) {
    return (
      <div
        className={cn(
          'glass-surface rounded-xl p-5 flex items-center justify-center h-56',
          'text-muted-foreground text-sm',
          className
        )}
      >
        No project data available
      </div>
    )
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn('glass-surface rounded-xl p-5', className)}
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold tracking-tight">Projects</h3>
        <span className="text-xs text-muted-foreground font-medium">
          Top {displayProjects.length} by usage
        </span>
      </div>

      <TooltipProvider delayDuration={100}>
        <div className="space-y-4">
          {displayProjects.map((project, index) => {
            const barWidth = (project.sessionCount / maxSessions) * 100

            return (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                initial={{ opacity: 0, x: -10 }}
                key={project.projectRoot}
                transition={{ duration: 0.25, delay: index * 0.05 }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="group cursor-default">
                      {/* Project info row */}
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Folder className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="truncate font-medium text-foreground group-hover:text-primary transition-colors">
                            {project.projectName}
                          </span>
                          <AgentIcon
                            agent={project.favoriteAgent}
                            className="flex-shrink-0 opacity-70"
                            size={12}
                          />
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground text-xs flex-shrink-0">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {project.totalMessages}
                          </span>
                          <span className="font-mono tabular-nums">
                            {project.sessionCount}
                          </span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${barWidth}%` }}
                          className="h-full bg-gradient-to-r from-chart-1 to-chart-2 rounded-full"
                          initial={{ width: 0 }}
                          transition={{
                            duration: 0.5,
                            delay: index * 0.05 + 0.1,
                            ease: 'easeOut',
                          }}
                        />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs" side="top">
                    <div className="space-y-1.5">
                      <p className="font-semibold">{project.projectName}</p>
                      <div className="text-background/70 space-y-0.5">
                        <p>
                          {project.sessionCount} sessions ·{' '}
                          {project.totalMessages} messages
                        </p>
                        <p>Last used: {formatRelativeTime(project.lastUsed)}</p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            )
          })}
        </div>
      </TooltipProvider>

      {projects.length > maxItems && (
        <p className="text-xs text-muted-foreground mt-5 text-center font-medium">
          +{projects.length - maxItems} more projects
        </p>
      )}
    </motion.div>
  )
}
