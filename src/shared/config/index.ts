/**
 * Shared Configuration Module
 *
 * Re-exports all configuration utilities for use across
 * Main and Renderer processes.
 */

// Environment
export {
  type Environment,
  type EnvConfig,
  parseEnvironment,
  createEnvConfig,
} from './env'

// Feature Flags
export {
  type FeatureFlagName,
  type FeatureFlag,
  type FeatureFlags,
  FEATURE_FLAG_DEFINITIONS,
  getFeatureFlagNames,
  getFeatureFlagDefinition,
  createBuildTimeFeatureFlags,
} from './feature-flags'
