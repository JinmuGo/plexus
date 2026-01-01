/**
 * Monitors Module
 *
 * Session monitoring and coordination.
 */

export {
  claudeSessionMonitor,
  startMonitoring,
  stopMonitoring,
  approvePermission,
  denyPermission,
  getStatus,
} from './claude-session-monitor'

export { performanceMonitor, withTiming } from './performance-monitor'
