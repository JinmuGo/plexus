/**
 * Main Process Configuration
 *
 * Initializes and exports all configuration for the main process.
 * Includes environment variables, feature flags, and runtime config.
 */

import { app } from 'electron'
import { join } from 'node:path'
import {
  createEnvConfig,
  type Environment,
  type FeatureFlags,
} from 'shared/config'
import { evaluateFeatureFlags } from './feature-flags'
import { validateMainEnv } from './env'

export interface MainConfig {
  // Environment
  env: Environment
  isDev: boolean
  isProd: boolean

  // App info
  appName: string
  appVersion: string
  appPath: string
  userDataPath: string

  // Platform
  platform: NodeJS.Platform
  isPackaged: boolean

  // Paths
  paths: {
    config: string
    data: string
    logs: string
    hooks: string
  }

  // Features
  features: FeatureFlags

  // Runtime settings
  settings: {
    logLevel: 'debug' | 'info' | 'warn' | 'error'
    apiTimeout: number
    enableDevTools: boolean
  }
}

let config: MainConfig | null = null

/**
 * Initialize main process configuration
 * Must be called after app.whenReady()
 */
export function initializeConfig(): MainConfig {
  if (config) return config

  const baseConfig = createEnvConfig()
  const envVars = validateMainEnv(baseConfig.isDev)
  const features = evaluateFeatureFlags(baseConfig.env)

  const userHome = process.env.HOME || app.getPath('home')
  const plexusRoot = join(userHome, '.plexus')

  config = {
    // Environment
    env: baseConfig.env,
    isDev: baseConfig.isDev,
    isProd: baseConfig.isProd,

    // App info
    appName: baseConfig.appName,
    appVersion: baseConfig.appVersion,
    appPath: app.getAppPath(),
    userDataPath: app.getPath('userData'),

    // Platform
    platform: process.platform,
    isPackaged: app.isPackaged,

    // Paths
    paths: {
      config: join(plexusRoot, 'config'),
      data: join(plexusRoot, 'data'),
      logs: join(plexusRoot, 'logs'),
      hooks: join(plexusRoot, 'hooks'),
    },

    // Features
    features,

    // Runtime settings
    settings: {
      logLevel: envVars.logLevel,
      apiTimeout: envVars.apiTimeout,
      enableDevTools: envVars.enableDevTools,
    },
  }

  return config
}

/**
 * Get current configuration (throws if not initialized)
 */
export function getConfig(): MainConfig {
  if (!config) {
    throw new Error(
      'Configuration not initialized. Call initializeConfig() first.'
    )
  }
  return config
}

/**
 * Get safe config subset for renderer process
 */
export function getRendererConfig(): RendererEnvConfig {
  const cfg = getConfig()
  return {
    appName: cfg.appName,
    appVersion: cfg.appVersion,
    environment: cfg.env,
    isDev: cfg.isDev,
    isProd: cfg.isProd,
    platform: cfg.platform,
    features: cfg.features,
  }
}

// Type for renderer-safe config
export interface RendererEnvConfig {
  appName: string
  appVersion: string
  environment: Environment
  isDev: boolean
  isProd: boolean
  platform: NodeJS.Platform
  features: FeatureFlags
}

// Re-exports
export {
  evaluateFeatureFlags,
  getFeatureFlag,
  setFeatureFlagOverride,
  removeFeatureFlagOverride,
  getFeatureFlagOverrides,
} from './feature-flags'

export { validateMainEnv, type MainEnvVars } from './env'
