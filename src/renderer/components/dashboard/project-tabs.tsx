/**
 * ProjectTabs Component
 *
 * Horizontal tab filter for projects, displayed at the top of the sessions view.
 * Uses pill-style tabs with glass morphism design.
 */

import { motion } from 'framer-motion'
import { Folder, Layers } from 'lucide-react'
import { Badge } from 'renderer/components/ui/badge'
import { ScrollArea, ScrollBar } from 'renderer/components/ui/scroll-area'
import { cn } from 'renderer/lib/utils'
import { useProjects } from 'renderer/lib/hooks'
import { useSelectedProject } from 'renderer/stores/ui-store'
import type { ClaudeSession } from 'shared/hook-types'

interface ProjectTabsProps {
  sessions: ClaudeSession[]
}

export function ProjectTabs({ sessions }: ProjectTabsProps) {
  const { selectedProjectId, setSelectedProject } = useSelectedProject()
  const projects = useProjects(sessions)

  // Total session count for "All" option
  const totalCount = sessions.length
  const totalHasApproval = sessions.some(s => s.phase === 'waitingForApproval')

  return (
    <div className="border-b px-4 py-2">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-1">
          {/* All Projects Tab */}
          <ProjectTab
            hasApproval={totalHasApproval}
            icon="all"
            isActive={selectedProjectId === null}
            name="All"
            onClick={() => setSelectedProject(null)}
            sessionCount={totalCount}
          />

          {/* Separator */}
          {projects.length > 0 && (
            <div className="flex items-center gap-2 mx-1">
              <div className="h-4 w-px bg-border" />
            </div>
          )}

          {/* Individual Project Tabs */}
          {projects.map(project => (
            <ProjectTab
              hasApproval={project.hasApproval}
              icon={project.id === 'no-project' ? 'none' : 'folder'}
              isActive={selectedProjectId === project.id}
              key={project.id}
              name={project.name}
              onClick={() => setSelectedProject(project.id)}
              sessionCount={project.sessionCount}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

interface ProjectTabProps {
  name: string
  sessionCount: number
  hasApproval: boolean
  isActive: boolean
  onClick: () => void
  icon: 'all' | 'folder' | 'none'
}

function ProjectTab({
  name,
  sessionCount,
  hasApproval,
  isActive,
  onClick,
  icon,
}: ProjectTabProps) {
  const IconComponent = icon === 'all' ? Layers : Folder

  return (
    <button
      className={cn(
        'relative flex items-center gap-2 px-3 py-2 rounded-lg',
        'text-base font-medium whitespace-nowrap',
        'transition-all duration-200',
        'cursor-pointer',
        // Default state
        'text-muted-foreground hover:text-foreground/80',
        // Active state
        isActive && 'text-foreground'
      )}
      onClick={onClick}
      type="button"
    >
      {/* Active indicator (pill background) */}
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-lg bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30"
          layoutId="activeProjectTab"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}

      {/* Icon */}
      <IconComponent
        className={cn(
          'size-4 relative z-10 transition-colors duration-200',
          isActive ? 'text-primary' : 'text-muted-foreground'
        )}
      />

      {/* Name */}
      <span className="relative z-10">{name}</span>

      {/* Count or Approval Badge */}
      {hasApproval ? (
        <Badge
          className="relative z-10 ml-0.5 text-[10px] px-1.5 py-0 font-bold"
          variant="approval"
        >
          {sessionCount}
        </Badge>
      ) : (
        <span
          className={cn(
            'relative z-10 text-xs tabular-nums',
            isActive ? 'text-foreground/60' : 'text-muted-foreground/60'
          )}
        >
          {sessionCount}
        </span>
      )}
    </button>
  )
}
