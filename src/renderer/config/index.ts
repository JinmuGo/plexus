/**
 * Renderer Configuration
 *
 * Provides safe, type-checked configuration access for the renderer process.
 * Configuration is either:
 * 1. Injected at build time (static)
 * 2. Fetched from main process via IPC (dynamic)
 */

import {
  createEnvConfig,
  createBuildTimeFeatureFlags,
  type Environment,
  type FeatureFlags,
} from 'shared/config'
import { devLog } from 'renderer/lib/logger'

export interface RendererConfig {
  env: Environment
  isDev: boolean
  isProd: boolean
  appName: string
  appVersion: string
  platform: string
  features: FeatureFlags
}

// Build-time static config
const staticConfig = createEnvConfig()

// Build-time feature flags
const buildTimeFeatures = createBuildTimeFeatureFlags()

let dynamicConfig: RendererConfig | null = null

/**
 * Get static config (available immediately)
 */
export function getStaticConfig(): RendererConfig {
  return {
    ...staticConfig,
    platform: typeof process !== 'undefined' ? process.platform : 'darwin',
    features: buildTimeFeatures,
  }
}

/**
 * Initialize dynamic config from main process
 * Call this early in renderer initialization
 */
export async function initializeConfig(): Promise<RendererConfig> {
  if (dynamicConfig) return dynamicConfig

  try {
    // Fetch full config from main process
    const mainConfig = await window.App.config.get()

    dynamicConfig = {
      env: mainConfig.environment,
      isDev: mainConfig.isDev,
      isProd: mainConfig.isProd,
      appName: mainConfig.appName,
      appVersion: mainConfig.appVersion,
      platform: mainConfig.platform,
      features: mainConfig.features,
    }

    return dynamicConfig
  } catch (error) {
    devLog.error('[Config] Failed to initialize from main process:', error)
    // Fallback to static config
    return getStaticConfig()
  }
}

/**
 * Get full config (requires initialization)
 */
export function getConfig(): RendererConfig {
  if (!dynamicConfig) {
    // Fallback to static config with build-time features
    return getStaticConfig()
  }
  return dynamicConfig
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return getConfig().features[feature]
}

// Re-export types
export type { Environment, FeatureFlags }
