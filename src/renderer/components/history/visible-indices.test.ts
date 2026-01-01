import { describe, it, expect } from 'vitest'

interface SessionLike {
  projectRoot: string | null
  projectName: string | null
  startedAt: number
}

// Extract the displayOrder logic (same as HistoryView)
function computeDisplayOrder(sessions: SessionLike[]) {
  const folders = new Map<
    string,
    {
      projectName: string
      sessions: { session: SessionLike; originalIndex: number }[]
    }
  >()
  const ungrouped: { session: SessionLike; originalIndex: number }[] = []

  sessions.forEach((session, index) => {
    if (session.projectRoot && session.projectName) {
      const existing = folders.get(session.projectRoot)
      if (existing) {
        existing.sessions.push({ session, originalIndex: index })
      } else {
        folders.set(session.projectRoot, {
          projectName: session.projectName,
          sessions: [{ session, originalIndex: index }],
        })
      }
    } else {
      ungrouped.push({ session, originalIndex: index })
    }
  })

  // Sort folders and sessions within folders (same as SessionList)
  const sortedFolders = Array.from(folders.entries())
    .map(([projectRoot, data]) => ({
      projectRoot,
      projectName: data.projectName,
      sessions: data.sessions.sort(
        (a, b) => a.session.startedAt - b.session.startedAt
      ),
    }))
    .sort((a, b) => {
      const maxA = Math.max(...a.sessions.map(s => s.session.startedAt))
      const maxB = Math.max(...b.sessions.map(s => s.session.startedAt))
      return maxA - maxB
    })

  // Build display order: folders first, then ungrouped
  const order: { originalIndex: number; projectRoot: string | null }[] = []

  for (const folder of sortedFolders) {
    for (const item of folder.sessions) {
      order.push({
        originalIndex: item.originalIndex,
        projectRoot: folder.projectRoot,
      })
    }
  }

  for (const item of ungrouped) {
    order.push({ originalIndex: item.originalIndex, projectRoot: null })
  }

  return order
}

// Extract the visibleIndices logic
function computeVisibleIndices(
  displayOrder: { originalIndex: number; projectRoot: string | null }[],
  expandedFolders: Set<string>
): number[] {
  const indices: number[] = []
  const seenFolders = new Set<string>()

  for (const item of displayOrder) {
    const folder = item.projectRoot
    if (folder) {
      if (expandedFolders.has(folder)) {
        indices.push(item.originalIndex)
      } else {
        if (!seenFolders.has(folder)) {
          seenFolders.add(folder)
          indices.push(item.originalIndex)
        }
      }
    } else {
      indices.push(item.originalIndex)
    }
  }

  return indices
}

describe('computeDisplayOrder', () => {
  it('should sort folders by most recent session (oldest first)', () => {
    const sessions: SessionLike[] = [
      { projectRoot: '/project-b', projectName: 'B', startedAt: 300 }, // index 0
      { projectRoot: '/project-a', projectName: 'A', startedAt: 100 }, // index 1
      { projectRoot: '/project-a', projectName: 'A', startedAt: 200 }, // index 2
    ]

    const order = computeDisplayOrder(sessions)

    // project-a has max startedAt 200, project-b has max 300
    // So project-a comes first, then project-b
    // Within project-a: index 1 (startedAt 100) before index 2 (startedAt 200)
    expect(order.map(o => o.originalIndex)).toEqual([1, 2, 0])
  })

  it('should put ungrouped sessions at the end', () => {
    const sessions: SessionLike[] = [
      { projectRoot: null, projectName: null, startedAt: 500 }, // index 0 - ungrouped
      { projectRoot: '/project-a', projectName: 'A', startedAt: 100 }, // index 1
    ]

    const order = computeDisplayOrder(sessions)

    // Folder first, then ungrouped
    expect(order.map(o => o.originalIndex)).toEqual([1, 0])
  })

  it('should sort sessions within folder by startedAt', () => {
    const sessions: SessionLike[] = [
      { projectRoot: '/project-a', projectName: 'A', startedAt: 300 }, // index 0
      { projectRoot: '/project-a', projectName: 'A', startedAt: 100 }, // index 1
      { projectRoot: '/project-a', projectName: 'A', startedAt: 200 }, // index 2
    ]

    const order = computeDisplayOrder(sessions)

    // Sorted by startedAt: 100, 200, 300 -> indices 1, 2, 0
    expect(order.map(o => o.originalIndex)).toEqual([1, 2, 0])
  })
})

describe('computeVisibleIndices with displayOrder', () => {
  it('should show all sessions when all folders are expanded', () => {
    const displayOrder = [
      { originalIndex: 1, projectRoot: '/project-a' },
      { originalIndex: 2, projectRoot: '/project-a' },
      { originalIndex: 0, projectRoot: '/project-b' },
      { originalIndex: 3, projectRoot: null },
    ]
    const expandedFolders = new Set(['/project-a', '/project-b'])

    const result = computeVisibleIndices(displayOrder, expandedFolders)

    expect(result).toEqual([1, 2, 0, 3])
  })

  it('should show only first session of each collapsed folder', () => {
    const displayOrder = [
      { originalIndex: 1, projectRoot: '/project-a' },
      { originalIndex: 2, projectRoot: '/project-a' },
      { originalIndex: 0, projectRoot: '/project-b' },
      { originalIndex: 3, projectRoot: null },
    ]
    const expandedFolders = new Set<string>() // all collapsed

    const result = computeVisibleIndices(displayOrder, expandedFolders)

    // First of project-a (index 1), first of project-b (index 0), ungrouped (index 3)
    expect(result).toEqual([1, 0, 3])
  })

  it('should handle mixed expanded/collapsed folders', () => {
    const displayOrder = [
      { originalIndex: 1, projectRoot: '/project-a' },
      { originalIndex: 2, projectRoot: '/project-a' },
      { originalIndex: 0, projectRoot: '/project-b' },
      { originalIndex: 4, projectRoot: '/project-b' },
    ]
    const expandedFolders = new Set(['/project-a']) // only project-a expanded

    const result = computeVisibleIndices(displayOrder, expandedFolders)

    // project-a expanded: 1, 2
    // project-b collapsed: only 0
    expect(result).toEqual([1, 2, 0])
  })
})

describe('navigation simulation', () => {
  it('should navigate correctly through collapsed folders', () => {
    // Simulate: 2 folders, each with 2 sessions, all collapsed
    const sessions: SessionLike[] = [
      { projectRoot: '/project-a', projectName: 'A', startedAt: 100 },
      { projectRoot: '/project-a', projectName: 'A', startedAt: 200 },
      { projectRoot: '/project-b', projectName: 'B', startedAt: 300 },
      { projectRoot: '/project-b', projectName: 'B', startedAt: 400 },
    ]

    const displayOrder = computeDisplayOrder(sessions)
    const expandedFolders = new Set<string>() // all collapsed

    const visibleIndices = computeVisibleIndices(displayOrder, expandedFolders)

    // Should only have 2 visible items (one per folder)
    expect(visibleIndices).toHaveLength(2)

    // Navigating j from first should go to second folder
    let currentIdx = 0
    const currentVisiblePos = visibleIndices.indexOf(visibleIndices[currentIdx])
    const nextVisiblePos = currentVisiblePos + 1
    if (nextVisiblePos < visibleIndices.length) {
      currentIdx = visibleIndices[nextVisiblePos]
    }

    // Should now be at the first session of the second folder
    expect(sessions[currentIdx].projectRoot).toBe('/project-b')
  })

  it('should navigate through expanded folder sessions', () => {
    const sessions: SessionLike[] = [
      { projectRoot: '/project-a', projectName: 'A', startedAt: 100 },
      { projectRoot: '/project-a', projectName: 'A', startedAt: 200 },
      { projectRoot: '/project-b', projectName: 'B', startedAt: 300 },
    ]

    const displayOrder = computeDisplayOrder(sessions)
    const expandedFolders = new Set(['/project-a']) // project-a expanded

    const visibleIndices = computeVisibleIndices(displayOrder, expandedFolders)

    // project-a has 2 sessions visible, project-b has 1 (collapsed)
    expect(visibleIndices).toHaveLength(3)

    // First two should be from project-a, last from project-b
    expect(sessions[visibleIndices[0]].projectRoot).toBe('/project-a')
    expect(sessions[visibleIndices[1]].projectRoot).toBe('/project-a')
    expect(sessions[visibleIndices[2]].projectRoot).toBe('/project-b')
  })
})
