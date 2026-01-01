/**
 * Error Handler
 *
 * Global error handling using electron-unhandled.
 * Catches unhandled errors and promise rejections.
 */

import unhandled from 'electron-unhandled'
import { logger } from './logger'

/**
 * Setup global error handling
 * Should be called early in the app lifecycle
 */
export function setupErrorHandling() {
  unhandled({
    // Log errors using our structured logger
    logger: (error: Error) => {
      logger.main.error('Unhandled error:', error.message)
      logger.main.error('Stack:', error.stack)
    },

    // Show dialog only in development
    showDialog: process.env.NODE_ENV === 'development',

    // Report button handler (can be used for error reporting service)
    reportButton: (error: Error) => {
      // In the future, could open GitHub issue or send to error tracking service
      logger.main.info('Error report requested:', error.message)

      // For now, just log that user requested to report
      // Could implement: shell.openExternal(`https://github.com/.../issues/new?body=${encodeURIComponent(error.stack)}`)
    },
  })

  // Log that error handling is set up
  logger.main.info('Global error handling initialized')
}
