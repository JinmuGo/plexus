/**
 * useProjects Hook
 *
 * Extracts unique projects from sessions for sidebar navigation.
 */

import { useMemo } from 'react'
import type { ClaudeSession } from 'shared/hook-types'

export interface Project {
  id: string // projectRoot | 'no-project'
  name: string // projectName | 'No Project'
  sessionCount: number
  hasApproval: boolean // has waitingForApproval sessions
  hasActive: boolean // has processing sessions
}

export function useProjects(sessions: ClaudeSession[]): Project[] {
  return useMemo(() => {
    const projectMap = new Map<
      string,
      {
        name: string
        sessions: ClaudeSession[]
      }
    >()

    // Group sessions by project
    for (const session of sessions) {
      if (session.projectRoot && session.projectName) {
        const existing = projectMap.get(session.projectRoot)
        if (existing) {
          existing.sessions.push(session)
        } else {
          projectMap.set(session.projectRoot, {
            name: session.projectName,
            sessions: [session],
          })
        }
      } else {
        // Sessions without project
        const noProject = projectMap.get('no-project')
        if (noProject) {
          noProject.sessions.push(session)
        } else {
          projectMap.set('no-project', {
            name: 'No Project',
            sessions: [session],
          })
        }
      }
    }

    // Convert to Project array and sort
    const projects: Project[] = Array.from(projectMap.entries()).map(
      ([id, data]) => ({
        id,
        name: data.name,
        sessionCount: data.sessions.length,
        hasApproval: data.sessions.some(s => s.phase === 'waitingForApproval'),
        hasActive: data.sessions.some(s => s.phase === 'processing'),
      })
    )

    // Sort: hasApproval first, then hasActive, then by name
    projects.sort((a, b) => {
      if (a.hasApproval && !b.hasApproval) return -1
      if (!a.hasApproval && b.hasApproval) return 1
      if (a.hasActive && !b.hasActive) return -1
      if (!a.hasActive && b.hasActive) return 1
      // 'No Project' always last
      if (a.id === 'no-project') return 1
      if (b.id === 'no-project') return -1
      return a.name.localeCompare(b.name)
    })

    return projects
  }, [sessions])
}

/**
 * Filter sessions by selected project
 */
export function filterSessionsByProject(
  sessions: ClaudeSession[],
  projectId: string | null
): ClaudeSession[] {
  // null = all sessions
  if (projectId === null) {
    return sessions
  }

  // 'no-project' = sessions without projectRoot
  if (projectId === 'no-project') {
    return sessions.filter(s => !s.projectRoot)
  }

  // Filter by projectRoot
  return sessions.filter(s => s.projectRoot === projectId)
}
