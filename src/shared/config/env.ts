/**
 * Environment Configuration
 *
 * Type-safe environment variable access with validation.
 * This module provides a unified way to access environment
 * configuration across Main and Renderer processes.
 */

export type Environment = 'development' | 'production'

export interface EnvConfig {
  env: Environment
  isDev: boolean
  isProd: boolean
  appName: string
  appVersion: string
}

/**
 * Validates and parses environment string
 */
export function parseEnvironment(value: string | undefined): Environment {
  const env = value?.toLowerCase()
  if (env === 'production' || env === 'prod') return 'production'
  return 'development'
}

/**
 * Creates base environment config from build-time constants
 * Works in both Main and Renderer processes
 */
export function createEnvConfig(): EnvConfig {
  // These are replaced at build time by electron-vite
  const env = parseEnvironment(
    typeof __IS_PROD__ !== 'undefined' && __IS_PROD__
      ? 'production'
      : 'development'
  )

  return {
    env,
    isDev: env === 'development',
    isProd: env === 'production',
    appName: typeof __APP_NAME__ !== 'undefined' ? __APP_NAME__ : 'Plexus',
    appVersion:
      typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
  }
}

// Global type declarations for build-time constants
declare global {
  const __APP_VERSION__: string
  const __APP_NAME__: string
  const __IS_DEV__: boolean
  const __IS_PROD__: boolean
  const __FEATURE_COST_TRACKING__: boolean
  const __FEATURE_AI_INSIGHTS__: boolean
  const __FEATURE_WEBHOOKS__: boolean
  const __FEATURE_EXPERIMENTAL_UI__: boolean
  const __FEATURE_VERBOSE_LOGGING__: boolean
}
