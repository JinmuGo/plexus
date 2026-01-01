/**
 * Feature Flag React Hooks
 *
 * Provides React hooks for feature flag access in components.
 */

import { useState, useEffect, type ReactNode, type ComponentType } from 'react'
import type { FeatureFlags, FeatureFlagName } from 'shared/config'
import { getConfig, initializeConfig, isFeatureEnabled } from './index'

/**
 * Hook to check if a specific feature is enabled
 */
export function useFeatureFlag(name: FeatureFlagName): boolean {
  const [enabled, setEnabled] = useState(() => isFeatureEnabled(name))

  useEffect(() => {
    // Re-check after config is initialized
    initializeConfig().then(() => {
      setEnabled(isFeatureEnabled(name))
    })
  }, [name])

  return enabled
}

/**
 * Hook to get all feature flags
 */
export function useFeatureFlags(): FeatureFlags {
  const [features, setFeatures] = useState<FeatureFlags>(
    () => getConfig().features
  )

  useEffect(() => {
    initializeConfig().then(config => {
      setFeatures(config.features)
    })
  }, [])

  return features
}

/**
 * Hook for conditional value based on feature flag
 */
export function useFeature<T>(
  name: FeatureFlagName,
  enabledValue: T,
  disabledValue: T
): T {
  const enabled = useFeatureFlag(name)
  return enabled ? enabledValue : disabledValue
}

/**
 * Component that renders children only if feature is enabled
 */
export function FeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: FeatureFlagName
  children: ReactNode
  fallback?: ReactNode
}): ReactNode {
  const enabled = useFeatureFlag(feature)
  return enabled ? children : fallback
}

/**
 * Higher-order component for feature flag gating
 */
export function withFeatureFlag<P extends object>(
  Component: ComponentType<P>,
  featureName: FeatureFlagName,
  FallbackComponent?: ComponentType<P>
): ComponentType<P> {
  return function FeatureFlaggedComponent(props: P) {
    const enabled = useFeatureFlag(featureName)

    if (!enabled) {
      return FallbackComponent ? <FallbackComponent {...props} /> : null
    }

    return <Component {...props} />
  }
}
