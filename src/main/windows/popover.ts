import type { BrowserWindow, Tray } from 'electron'
import { screen } from 'electron'
import { join } from 'node:path'

import { createWindow } from '../factories/windows/create'
import { PLATFORM } from 'shared/constants'
import { POPOVER } from '../constants/windows'

interface PopoverWindowOptions {
  tray: Tray
}

export function createPopoverWindow({
  tray,
}: PopoverWindowOptions): BrowserWindow {
  const window = createWindow({
    id: 'popover',
    width: POPOVER.WIDTH,
    height: POPOVER.HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: true,

    // macOS-specific vibrancy
    ...(PLATFORM.IS_MAC && {
      vibrancy: POPOVER.VIBRANCY,
      visualEffectState: POPOVER.VISUAL_EFFECT_STATE,
      roundedCorners: true,
    }),

    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false,
      // Security hardening (explicit, even if default)
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  // Position window below tray icon
  const positionWindow = () => {
    const trayBounds = tray.getBounds()
    const windowBounds = window.getBounds()
    const display = screen.getDisplayNearestPoint({
      x: trayBounds.x,
      y: trayBounds.y,
    })

    // Center horizontally below tray icon
    let x = Math.round(
      trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2
    )
    let y = Math.round(trayBounds.y + trayBounds.height + POPOVER.PADDING)

    // Ensure within screen bounds
    const screenBounds = display.workArea
    x = Math.max(
      screenBounds.x,
      Math.min(x, screenBounds.x + screenBounds.width - windowBounds.width)
    )
    y = Math.max(
      screenBounds.y,
      Math.min(y, screenBounds.y + screenBounds.height - windowBounds.height)
    )

    window.setPosition(x, y, false)
  }

  // Auto-hide on blur (clicking outside)
  window.on('blur', () => {
    window.hide()
  })

  // Reposition before showing
  window.on('show', positionWindow)

  return window
}

export function togglePopover(window: BrowserWindow): void {
  if (window.isVisible()) {
    window.hide()
  } else {
    window.show()
    window.focus()
  }
}
