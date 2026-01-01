import { app, nativeImage, shell } from 'electron'
import { join } from 'node:path'

import { createWindow } from '../factories/windows/create'
import { ENVIRONMENT } from 'shared/constants'
import { displayName } from '~/package.json'

let isQuitting = false

// Listen for app quit to allow actual closing
app.on('before-quit', () => {
  isQuitting = true
})

export async function MainWindow() {
  const iconFilename = process.platform === 'darwin' ? 'icon.icns' : 'icon.png'
  const iconPath = ENVIRONMENT.IS_DEV
    ? join(__dirname, `../../../src/resources/build/icons/${iconFilename}`)
    : join(process.resourcesPath, `icons/${iconFilename}`)

  const iconImage = nativeImage.createFromPath(iconPath)

  const window = createWindow({
    id: 'main',
    title: displayName,
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    show: false,
    center: true,
    movable: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    // Linux icon specifically
    ...(process.platform === 'linux' ? { icon: iconImage } : {}),
    // General icon for other platforms (especially Windows)
    icon: iconImage,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security hardening (explicit, even if default)
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  // Explicitly set the Dock icon on macOS
  if (process.platform === 'darwin') {
    app.dock?.setIcon(iconImage)
  }

  window.webContents.on('did-finish-load', () => {
    if (ENVIRONMENT.IS_DEV) {
      window.webContents.openDevTools({ mode: 'detach' })
    }

    window.show()
  })

  // Open external links in default browser
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  window.on('close', event => {
    // Hide to tray instead of closing, unless actually quitting
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })

  return window
}
