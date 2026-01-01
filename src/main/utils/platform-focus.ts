/**
 * Platform-specific Window Focus Utilities
 *
 * Provides cross-platform support for activating application windows.
 * - macOS: AppleScript
 * - Windows: PowerShell
 */

import { exec } from 'node:child_process'
import { PLATFORM } from 'shared/constants'
import { EXEC_TIMEOUT_MS } from '../constants/utils'

/**
 * Activate an application by name (macOS only)
 */
export async function activateAppMac(appName: string): Promise<boolean> {
  if (!PLATFORM.IS_MAC) return false

  return new Promise(resolve => {
    const script = `tell application "${appName}" to activate`
    exec(`osascript -e '${script}'`, { timeout: EXEC_TIMEOUT_MS }, error => {
      resolve(!error)
    })
  })
}

/**
 * Activate a window by process name (Windows only)
 * Uses PowerShell to bring the window to foreground
 */
export async function activateAppWindows(
  processName: string
): Promise<boolean> {
  if (!PLATFORM.IS_WINDOWS) return false

  return new Promise(resolve => {
    // PowerShell script to find and activate window
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")]
          public static extern bool SetForegroundWindow(IntPtr hWnd);
          [DllImport("user32.dll")]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          [DllImport("user32.dll")]
          public static extern bool IsIconic(IntPtr hWnd);
        }
"@
      $process = Get-Process -Name "${processName}" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($process -and $process.MainWindowHandle -ne [IntPtr]::Zero) {
        $hwnd = $process.MainWindowHandle
        # SW_RESTORE = 9, restore if minimized
        if ([Win32]::IsIconic($hwnd)) {
          [Win32]::ShowWindow($hwnd, 9)
        }
        [Win32]::SetForegroundWindow($hwnd)
        Write-Output "success"
      } else {
        Write-Output "not_found"
      }
    `

    exec(
      `powershell -Command "${script.replace(/"/g, '\\"')}"`,
      { timeout: EXEC_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          resolve(false)
        } else {
          resolve(stdout.trim() === 'success')
        }
      }
    )
  })
}

/**
 * Activate terminal application (macOS)
 * First tries to detect the terminal running tmux, then falls back to common terminals
 */
export async function activateTerminalApp(): Promise<boolean> {
  if (PLATFORM.IS_WINDOWS) {
    return activateTerminalAppWindows()
  }

  if (!PLATFORM.IS_MAC) return false

  return new Promise(resolve => {
    // Try common terminal apps in order of preference
    const script = `
      tell application "System Events"
        set terminalApps to {"WezTerm", "iTerm2", "iTerm", "kitty", "Alacritty", "Hyper", "Tabby", "Terminal"}
        repeat with appName in terminalApps
          if exists (process appName) then
            tell application appName to activate
            return appName as string
          end if
        end repeat
        return "none"
      end tell
    `

    exec(
      `osascript -e '${script}'`,
      { timeout: EXEC_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          resolve(false)
        } else {
          resolve(stdout.trim() !== 'none')
        }
      }
    )
  })
}

/**
 * Activate terminal application (Windows)
 * Tries common terminal apps: Windows Terminal, cmd, PowerShell
 */
async function activateTerminalAppWindows(): Promise<boolean> {
  // Try Windows Terminal first
  const terminalNames = ['WindowsTerminal', 'cmd', 'powershell']

  for (const name of terminalNames) {
    const result = await activateAppWindows(name)
    if (result) return true
  }

  return false
}

/**
 * Cross-platform window activation by process name
 */
export async function activateWindowByProcess(
  processName: string
): Promise<boolean> {
  if (PLATFORM.IS_MAC) {
    return activateAppMac(processName)
  }
  if (PLATFORM.IS_WINDOWS) {
    return activateAppWindows(processName)
  }
  return false
}

/**
 * Focus Cursor IDE (cross-platform)
 * On macOS: uses `cursor` CLI or activates app
 * On Windows: activates Cursor process
 */
export async function focusCursorCrossplatform(cwd: string): Promise<boolean> {
  if (PLATFORM.IS_WINDOWS) {
    return activateAppWindows('Cursor')
  }

  if (!PLATFORM.IS_MAC) return false

  return new Promise(resolve => {
    // Use cursor CLI to open the folder - this will focus existing window if already open
    exec(`cursor "${cwd}"`, { timeout: EXEC_TIMEOUT_MS }, error => {
      if (error) {
        // Fallback: just activate Cursor app
        activateAppMac('Cursor').then(resolve)
      } else {
        resolve(true)
      }
    })
  })
}
