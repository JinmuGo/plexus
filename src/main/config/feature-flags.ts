/**
 * Feature Flags Evaluation (Main Process)
 *
 * Evaluates feature flags based on:
 * 1. Build-time constants (for dead code elimination)
 * 2. Environment-specific overrides
 * 3. User preferences (runtime toggles)
 */

import Store from 'electron-store'
import {
  FEATURE_FLAG_DEFINITIONS,
  createBuildTimeFeatureFlags,
  type FeatureFlags,
  type FeatureFlagName,
  type Environment,
} from 'shared/config'

interface FeatureFlagStore {
  overrides: Partial<Record<FeatureFlagName, boolean>>
}

let store: Store<FeatureFlagStore> | null = null

function getStore(): Store<FeatureFlagStore> {
  if (!store) {
    store = new Store<FeatureFlagStore>({
      name: 'feature-flags',
      defaults: {
        overrides: {},
      },
    })
  }
  return store
}

/**
 * Evaluate all feature flags for current environment
 */
export function evaluateFeatureFlags(env: Environment): FeatureFlags {
  const buildTimeFlags = createBuildTimeFeatureFlags()
  const userOverrides = getStore().get('overrides', {})

  const flags: FeatureFlags = { ...buildTimeFlags }

  for (const [name, definition] of Object.entries(FEATURE_FLAG_DEFINITIONS)) {
    const flagName = name as FeatureFlagName

    // Start with build-time value
    let value = buildTimeFlags[flagName]

    // Apply environment-specific override
    if (definition.environmentOverrides?.[env] !== undefined) {
      value = definition.environmentOverrides[env]
    }

    // Apply user override (if not build-time only)
    if (!definition.buildTime && userOverrides[flagName] !== undefined) {
      value = userOverrides[flagName]
    }

    flags[flagName] = value
  }

  return flags
}

/**
 * Get a single feature flag value
 */
export function getFeatureFlag(
  name: FeatureFlagName,
  env: Environment
): boolean {
  return evaluateFeatureFlags(env)[name]
}

/**
 * Set a user override for a feature flag
 */
export function setFeatureFlagOverride(
  name: FeatureFlagName,
  value: boolean
): void {
  const definition = FEATURE_FLAG_DEFINITIONS[name]
  if (definition.buildTime) {
    throw new Error(`Cannot override build-time feature flag: ${name}`)
  }

  const overrides = getStore().get('overrides', {})
  overrides[name] = value
  getStore().set('overrides', overrides)
}

/**
 * Remove a user override
 */
export function removeFeatureFlagOverride(name: FeatureFlagName): void {
  const overrides = getStore().get('overrides', {})
  delete overrides[name]
  getStore().set('overrides', overrides)
}

/**
 * Get all user overrides
 */
export function getFeatureFlagOverrides(): Partial<
  Record<FeatureFlagName, boolean>
> {
  return getStore().get('overrides', {})
}
