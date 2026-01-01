/**
 * Feature Flags System
 *
 * Supports:
 * - Build-time flags (dead code elimination)
 * - Runtime flags (toggleable without rebuild)
 * - Environment-based defaults
 * - User overrides (stored in preferences)
 */

import type { Environment } from './env'

export type FeatureFlagName =
  | 'costTracking'
  | 'aiInsights'
  | 'webhooks'
  | 'experimentalUI'
  | 'verboseLogging'

export interface FeatureFlag {
  name: FeatureFlagName
  description: string
  defaultValue: boolean
  /** If true, requires app restart to take effect */
  requiresRestart: boolean
  /** Environment(s) where this flag is forced on/off */
  environmentOverrides?: Partial<Record<Environment, boolean>>
  /** Build-time only - enables dead code elimination */
  buildTime?: boolean
}

export interface FeatureFlags {
  costTracking: boolean
  aiInsights: boolean
  webhooks: boolean
  experimentalUI: boolean
  verboseLogging: boolean
}

// Feature flag registry
export const FEATURE_FLAG_DEFINITIONS: Record<FeatureFlagName, FeatureFlag> = {
  costTracking: {
    name: 'costTracking',
    description: 'Token usage and cost tracking',
    defaultValue: true,
    requiresRestart: false,
    buildTime: true,
  },
  aiInsights: {
    name: 'aiInsights',
    description: 'AI-powered prompt analysis',
    defaultValue: true,
    requiresRestart: false,
    buildTime: true,
  },
  webhooks: {
    name: 'webhooks',
    description: 'Slack/Discord webhook integrations',
    defaultValue: true,
    requiresRestart: false,
    buildTime: true,
  },
  experimentalUI: {
    name: 'experimentalUI',
    description: 'Experimental UI components',
    defaultValue: false,
    requiresRestart: true,
    environmentOverrides: { development: true, production: false },
    buildTime: true,
  },
  verboseLogging: {
    name: 'verboseLogging',
    description: 'Detailed debug logging',
    defaultValue: false,
    requiresRestart: false,
    environmentOverrides: { development: true, production: false },
    buildTime: false,
  },
}

/**
 * Get all feature flag names
 */
export function getFeatureFlagNames(): FeatureFlagName[] {
  return Object.keys(FEATURE_FLAG_DEFINITIONS) as FeatureFlagName[]
}

/**
 * Get feature flag definition
 */
export function getFeatureFlagDefinition(
  name: FeatureFlagName
): FeatureFlag | undefined {
  return FEATURE_FLAG_DEFINITIONS[name]
}

/**
 * Create default feature flags from build-time constants
 * Used for initial values before runtime evaluation
 */
export function createBuildTimeFeatureFlags(): FeatureFlags {
  return {
    costTracking:
      typeof __FEATURE_COST_TRACKING__ !== 'undefined'
        ? __FEATURE_COST_TRACKING__
        : true,
    aiInsights:
      typeof __FEATURE_AI_INSIGHTS__ !== 'undefined'
        ? __FEATURE_AI_INSIGHTS__
        : true,
    webhooks:
      typeof __FEATURE_WEBHOOKS__ !== 'undefined' ? __FEATURE_WEBHOOKS__ : true,
    experimentalUI:
      typeof __FEATURE_EXPERIMENTAL_UI__ !== 'undefined'
        ? __FEATURE_EXPERIMENTAL_UI__
        : false,
    verboseLogging:
      typeof __FEATURE_VERBOSE_LOGGING__ !== 'undefined'
        ? __FEATURE_VERBOSE_LOGGING__
        : false,
  }
}
