/**
 * Project Detection Constants
 */

/** Files/directories that indicate a project root */
export const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'setup.py',
  'pom.xml',
  'build.gradle',
  'Makefile',
  '.project',
] as const

/** Maximum directory depth to scan for project root */
export const MAX_SCAN_DEPTH = 10
