/**
 * File Operations Utilities
 *
 * Common file operations for hook installers.
 */

import { devLog } from '../../lib/utils'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * Copy a script file and make it executable
 */
export function copyScriptWithPermissions(
  sourcePath: string,
  destPath: string,
  permissions = 0o755
): boolean {
  try {
    // Remove existing script if present
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath)
    }

    fs.copyFileSync(sourcePath, destPath)
    fs.chmodSync(destPath, permissions)
    return true
  } catch (error) {
    devLog.error(`Failed to copy script: ${error}`)
    return false
  }
}

/**
 * Read and parse a JSON settings file
 */
export function readJsonSettings<T extends object>(
  filePath: string,
  defaultValue: T
): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as T
    }
  } catch (error) {
    devLog.error(`Failed to read settings from ${filePath}:`, error)
  }
  return defaultValue
}

/**
 * Write settings to a JSON file
 */
export function writeJsonSettings<T extends object>(
  filePath: string,
  settings: T
): boolean {
  try {
    const content = JSON.stringify(settings, null, 2)
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (error) {
    devLog.error(`Failed to write settings to ${filePath}:`, error)
    return false
  }
}

/**
 * Get the source path for a bundled hook script
 */
export function getHookSourcePath(scriptName: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'hooks', scriptName)
  }
  // Development path
  return path.join(
    app.getAppPath(),
    'node_modules',
    '.dev',
    'hooks',
    scriptName
  )
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

/**
 * Remove a file if it exists
 */
export function removeFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
    return false
  } catch (error) {
    devLog.error(`Failed to remove file ${filePath}:`, error)
    return false
  }
}
