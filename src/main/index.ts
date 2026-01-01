import { app, ipcMain, Menu } from 'electron'
import { join } from 'node:path'

// Initialize error handling as early as possible
import { setupErrorHandling, logger } from './lib'

import { makeAppWithSingleInstanceLock } from './factories/app/instance'
import { makeAppSetup } from './factories/app/setup'
import { createTrayManager } from './factories/tray'
import { createSocketServer, registerIpcHandlers } from './ipc'
import { initializeConfig } from './config'
import { MainWindow } from './windows/main'
import { createPopoverWindow, togglePopover } from './windows/popover'
import { waitFor } from 'shared/utils'
import { sessionStore, type SessionEvent } from './store/sessions'
import { createNotificationManager } from './notifications'
import { claudeSessionMonitor, performanceMonitor } from './monitors'
// Webhooks are handled by the notification manager directly
import type { TrayStatus } from 'shared/types'
import type { SessionPhase } from 'shared/hook-types'

// Setup global error handling before anything else
setupErrorHandling()

// Lazy-loaded modules for faster startup
let historyStore: typeof import('./store/history').historyStore | null = null
let costStore: typeof import('./store/cost-store').costStore | null = null
let historyCaptureManager:
  | typeof import('./history/capture-manager').historyCaptureManager
  | null = null

async function initializeHistorySystem(isDev: boolean) {
  const historyModule = await import('./store/history')
  const costModule = await import('./store/cost-store')
  const captureModule = await import('./history/capture-manager')
  historyStore = historyModule.historyStore
  costStore = costModule.costStore
  historyCaptureManager = captureModule.historyCaptureManager

  // Use separate DB path in dev mode to avoid conflicts with production app
  const dbPath = isDev
    ? join(app.getPath('home'), '.plexus', 'dev', 'history.db')
    : undefined // Use default path for production

  // Initialize stores (they share the same database)
  historyStore.initialize(dbPath)
  costStore.initialize(dbPath)
  historyCaptureManager.start()
  return { historyStore, costStore, historyCaptureManager }
}

// Phase priority for tray (higher = more important)
const PHASE_PRIORITY: Record<SessionPhase, number> = {
  waitingForApproval: 5,
  processing: 4,
  compacting: 3,
  waitingForInput: 2,
  idle: 1,
  ended: 0,
}

// Map SessionPhase to TrayStatus
function phaseToTrayStatus(phase: SessionPhase): TrayStatus {
  switch (phase) {
    case 'waitingForApproval':
      return 'awaiting'
    case 'processing':
      return 'thinking'
    case 'compacting':
      return 'thinking'
    case 'waitingForInput':
      return 'idle'
    case 'idle':
      return 'idle'
    case 'ended':
      return 'none'
  }
}

// Calculate aggregate tray status from all sessions
function calculateTrayStatus(): TrayStatus {
  const sessions = sessionStore.getAll()

  if (sessions.length === 0) {
    return 'none'
  }

  // Filter out ended sessions
  const activeSessions = sessions.filter(s => s.phase !== 'ended')
  if (activeSessions.length === 0) {
    return 'none'
  }

  // Find highest priority phase
  let highestPriority = 0
  let highestPhase: SessionPhase = 'idle'

  for (const session of activeSessions) {
    const priority = PHASE_PRIORITY[session.phase]
    if (priority > highestPriority) {
      highestPriority = priority
      highestPhase = session.phase
    }
  }

  return phaseToTrayStatus(highestPhase)
}

makeAppWithSingleInstanceLock(async () => {
  await app.whenReady()

  // Initialize configuration first
  const config = initializeConfig()
  logger.app.info(`Starting ${config.appName} v${config.appVersion}`, {
    env: config.env,
    platform: config.platform,
  })

  // Performance: Remove default menu to speed up startup
  Menu.setApplicationMenu(null)

  // Process crash handling for stability
  app.on('render-process-gone', (_event, webContents, details) => {
    logger.app.error('Renderer process gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    })
    // Attempt to recover by reloading if it was a crash
    if (details.reason === 'crashed' || details.reason === 'oom') {
      try {
        webContents.reload()
      } catch {
        logger.app.error('Failed to reload crashed renderer')
      }
    }
  })

  app.on('child-process-gone', (_event, details) => {
    logger.app.error('Child process gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
    })
    // Log for monitoring - specific recovery depends on process type
    if (details.type === 'GPU') {
      logger.app.warn('GPU process crashed - Chromium will attempt recovery')
    }
  })

  const window = await makeAppSetup(MainWindow)

  // Handle renderer crash recovery for main window
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'crashed' || details.reason === 'oom') {
      logger.window.warn('Main window renderer crashed, reloading...')
      window.webContents.reload()
    }
  })

  // Start Claude session monitor (Hook-based detection)
  await claudeSessionMonitor.startMonitoring()

  // Start performance monitoring
  performanceMonitor.start()

  // Start automatic session cleanup
  sessionStore.startAutoCleanup()

  // Initialize history store for persistent session history (lazy loaded)
  // Use separate DB in dev mode to avoid conflicts with production app
  try {
    await initializeHistorySystem(config.isDev)
    logger.history.info('History system initialized', { isDev: config.isDev })
  } catch (error) {
    logger.history.error('Failed to initialize history system', error)
    // Continue without history - graceful degradation
  }

  // Initialize Unix Domain Socket server for CLI communication (legacy)
  const socketServer = createSocketServer()
  socketServer.start()

  // Initialize notification manager
  const notificationManager = createNotificationManager({
    mainWindow: window,
  })

  // Register IPC handlers for renderer communication
  registerIpcHandlers(window, socketServer)

  // Initialize system tray
  // In dev mode, __dirname is node_modules/.dev/main, so we need ../../../ to reach project root
  // Use Template icon for proper macOS menu bar appearance
  const iconPath = config.isDev
    ? join(__dirname, '../../../src/resources/build/tray/plexusTemplate.png')
    : join(process.resourcesPath, 'tray/plexusTemplate.png')

  const trayManager = createTrayManager({
    window,
    iconPath,
  })

  // Create popover window (positioned relative to tray)
  const popoverWindow = createPopoverWindow({ tray: trayManager.tray })

  // Override tray click to toggle popover instead of main window
  trayManager.tray.removeAllListeners('click')
  trayManager.tray.on('click', () => {
    togglePopover(popoverWindow)
  })

  // Register window management IPC handlers
  ipcMain.handle('window:showDashboard', () => {
    popoverWindow.hide()
    window.show()
    window.focus()
  })

  ipcMain.handle('window:hidePopover', () => {
    popoverWindow.hide()
  })

  ipcMain.handle('window:quit', () => {
    app.quit()
  })

  // Track unsubscribe functions for cleanup
  const unsubscribers: Array<() => void> = []

  // Forward session events to popover window
  unsubscribers.push(
    sessionStore.subscribe(event => {
      if (popoverWindow && !popoverWindow.isDestroyed()) {
        popoverWindow.webContents.send('claudeSessions:event', event)
      }
    })
  )

  // Subscribe to session events for tray and notifications
  unsubscribers.push(
    sessionStore.subscribe((event: SessionEvent) => {
      // Track event for performance monitoring
      performanceMonitor.recordEvent()

      // Update tray status on any session change
      const trayStatus = calculateTrayStatus()
      trayManager.setStatus(trayStatus)

      // Handle notifications based on event type
      switch (event.type) {
        case 'phaseChange':
          if (event.previousPhase) {
            if (event.session.phase === 'waitingForApproval') {
              logger.session.info('Session waiting for approval', {
                sessionId: event.session.id.slice(0, 8),
              })
            }
          }
          break
        case 'permissionRequest':
          // Create notification for permission request
          if (event.permissionContext) {
            notificationManager.notifyPermissionRequest(
              event.session,
              event.permissionContext
            )
            logger.session.info('Permission request', {
              tool: event.permissionContext.toolName,
              sessionId: event.session.id.slice(0, 8),
            })
          }
          break
        case 'remove':
          // Notify session ended
          notificationManager.notifySessionEnded(event.session)
          break
      }
    })
  )

  // Clean up on app quit
  app.on('before-quit', async () => {
    // Unsubscribe all listeners to prevent memory leaks
    for (const unsubscribe of unsubscribers) {
      unsubscribe()
    }

    sessionStore.stopAutoCleanup()
    claudeSessionMonitor.stopMonitoring()
    performanceMonitor.stop()
    // Cleanup lazy-loaded modules if initialized
    historyCaptureManager?.stop()
    costStore?.close()
    historyStore?.close()
    socketServer.stop()
    popoverWindow.destroy()
    trayManager.destroy()
  })

  if (config.isDev) {
    // Lazy load devtools only in development
    const { loadReactDevtools } = await import('./utils/electron')
    await loadReactDevtools()
    /* This trick is necessary to get the new
      React Developer Tools working at app initial load.
      Otherwise, it only works on manual reload.
    */
    window.webContents.once('devtools-opened', async () => {
      await waitFor(1000)
      window.webContents.reload()
    })
  }
})
