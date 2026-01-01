import { Tray, nativeImage, Menu, app } from 'electron'

import type { TrayManagerProps, TrayManager, TrayStatus } from 'shared/types'
import type { ClaudeSession, AgentType, SessionPhase } from 'shared/hook-types'
import {
  PLATFORM,
  TRAY_STATUS_COLORS,
  TRAY_STATUS_LABELS,
} from 'shared/constants'
import { sessionStore } from '../../store/sessions'
import { jumpToAgent } from '../../utils/jump-to-agent'

// Get display icon for agent type
function getAgentLabel(agent: AgentType): string {
  switch (agent) {
    case 'claude':
      return 'Claude'
    case 'cursor':
      return 'Cursor'
    case 'gemini':
      return 'Gemini'
  }
}

// Get status label for session phase
function getPhaseLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'waitingForApproval':
      return 'Approval needed'
    case 'waitingForInput':
      return 'Input needed'
    case 'processing':
      return 'Processing'
    case 'compacting':
      return 'Compacting'
    case 'idle':
      return 'Idle'
    default:
      return ''
  }
}

// Get session display name
function getSessionDisplayName(session: ClaudeSession): string {
  if (session.displayTitle) {
    return session.displayTitle
  }
  // Use last part of cwd
  const parts = session.cwd.split('/')
  return parts[parts.length - 1] || session.cwd
}

// Create a status indicator icon (circle with color)
function createStatusIcon(
  baseIcon: Electron.NativeImage,
  color: string
): Electron.NativeImage {
  // Get the base icon size
  const size = baseIcon.getSize()
  const scale = 2 // For retina displays

  // Create a canvas-like buffer to draw the indicator
  const indicatorSize = Math.floor(size.width * 0.4)
  const padding = 1

  // Create RGBA buffer for indicator dot
  const buffer = Buffer.alloc(indicatorSize * indicatorSize * 4)

  // Parse hex color to RGB
  const r = Number.parseInt(color.slice(1, 3), 16)
  const g = Number.parseInt(color.slice(3, 5), 16)
  const b = Number.parseInt(color.slice(5, 7), 16)

  // Draw filled circle
  const center = indicatorSize / 2
  const radius = indicatorSize / 2 - padding

  for (let y = 0; y < indicatorSize; y++) {
    for (let x = 0; x < indicatorSize; x++) {
      const dx = x - center
      const dy = y - center
      const distance = Math.sqrt(dx * dx + dy * dy)
      const idx = (y * indicatorSize + x) * 4

      if (distance <= radius) {
        // Inside circle
        buffer[idx] = r // R
        buffer[idx + 1] = g // G
        buffer[idx + 2] = b // B
        buffer[idx + 3] = 255 // A (fully opaque)
      } else if (distance <= radius + 1) {
        // Anti-aliased edge
        const alpha = Math.max(0, 1 - (distance - radius))
        buffer[idx] = r
        buffer[idx + 1] = g
        buffer[idx + 2] = b
        buffer[idx + 3] = Math.floor(alpha * 255)
      } else {
        // Outside circle (transparent)
        buffer[idx] = 0
        buffer[idx + 1] = 0
        buffer[idx + 2] = 0
        buffer[idx + 3] = 0
      }
    }
  }

  const indicatorImage = nativeImage.createFromBuffer(buffer, {
    width: indicatorSize,
    height: indicatorSize,
    scaleFactor: scale,
  })

  // For macOS, we need to composite the indicator onto the base icon
  // Since nativeImage doesn't support direct compositing, we'll use a simpler approach:
  // Just return the indicator as a separate image overlay isn't directly supported
  // We'll rely on tooltip for status indication on macOS (template images are monochrome)

  if (PLATFORM.IS_MAC) {
    // On macOS, template images are preferred for proper dark/light mode
    // We can't overlay colors on template images, so we rely on tooltip
    return baseIcon
  }

  // On other platforms, return indicator (in future could composite)
  return indicatorImage
}

export function createTrayManager({
  window,
  iconPath,
}: TrayManagerProps): TrayManager {
  const baseIcon = nativeImage.createFromPath(iconPath)
  let currentStatus: TrayStatus = 'none'

  // For macOS, use template images for proper dark/light mode support
  if (PLATFORM.IS_MAC) {
    baseIcon.setTemplateImage(true)
  }

  const tray = new Tray(baseIcon)
  tray.setToolTip('Plexus - No active agents')

  // Build dynamic context menu with active sessions
  const buildContextMenu = (): Electron.Menu => {
    const sessions = sessionStore.getAll().filter(s => s.phase !== 'ended')
    const menuItems: Electron.MenuItemConstructorOptions[] = []

    // Add session list if any active sessions
    if (sessions.length > 0) {
      menuItems.push({
        label: 'Jump to Agent',
        enabled: false,
      })
      menuItems.push({ type: 'separator' })

      for (const session of sessions) {
        const name = getSessionDisplayName(session)
        const agent = getAgentLabel(session.agent)
        const phase = getPhaseLabel(session.phase)
        const sublabel = phase ? ` (${phase})` : ''

        menuItems.push({
          label: `${agent}: ${name}${sublabel}`,
          click: async () => {
            const result = await jumpToAgent(session)
            console.log(
              `[Tray] Jump to ${session.agent}: ${result.success ? result.method : result.error}`
            )
          },
        })
      }
    } else {
      menuItems.push({
        label: 'No active agents',
        enabled: false,
      })
    }

    menuItems.push({ type: 'separator' })
    menuItems.push({
      label: 'Dashboard',
      click: () => {
        window.show()
        window.focus()
      },
    })
    menuItems.push({ type: 'separator' })
    menuItems.push({
      label: 'Quit',
      click: () => {
        app.quit()
      },
    })

    return Menu.buildFromTemplate(menuItems)
  }

  // Update context menu (called when status changes)
  const updateContextMenu = () => {
    // Context menu is built dynamically on right-click
  }

  // Click behavior: toggle window visibility
  tray.on('click', () => {
    if (window.isVisible()) {
      window.hide()
    } else {
      window.show()
      window.focus()
    }
  })

  // Right-click behavior: show context menu with agent list
  tray.on('right-click', () => {
    const menu = buildContextMenu()
    tray.popUpContextMenu(menu)
  })

  const setStatus = (status: TrayStatus) => {
    if (status === currentStatus) return

    currentStatus = status
    const color = TRAY_STATUS_COLORS[status]
    const label = TRAY_STATUS_LABELS[status]

    // Update tooltip
    tray.setToolTip(`Plexus - ${label}`)

    // Update icon (on non-macOS platforms)
    if (!PLATFORM.IS_MAC) {
      const statusIcon = createStatusIcon(baseIcon, color)
      tray.setImage(statusIcon)
    }

    // Update context menu
    updateContextMenu()

    console.log(`[Tray] Status changed to: ${status}`)
  }

  const destroy = () => {
    tray.destroy()
  }

  return {
    tray,
    updateContextMenu,
    setStatus,
    destroy,
  }
}
