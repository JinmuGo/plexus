/**
 * Tmux Integration Module
 *
 * Process tree analysis and tmux pane detection.
 */

export {
  processTree,
  buildProcessTree,
  isInTmux,
  isDescendant,
  findDescendants,
  findAncestor,
  getWorkingDirectory,
} from './process-tree'
export type { ProcessInfo, ProcessTree } from './process-tree'

export {
  tmuxTargetFinder,
  findTargetByPid,
  findTargetByWorkingDir,
  isSessionPaneActive,
  sendKeys,
  isTmuxAvailable,
  listSessions,
  focusByTty,
  focusCursor,
  findAppFromTty,
} from './target-finder'
