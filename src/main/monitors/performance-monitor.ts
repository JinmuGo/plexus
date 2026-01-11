/**
 * Performance Monitor
 *
 * Tracks application performance metrics including:
 * - Memory usage
 * - IPC latency
 * - Database query times
 * - Event processing rates
 */

import { devLog } from '../lib/utils'

// Metric types
interface PerformanceMetric {
  name: string
  value: number
  unit: 'ms' | 'bytes' | 'count' | 'percent'
  timestamp: number
}

interface PerformanceSummary {
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    rss: number
    external: number
  }
  ipcLatency: {
    avg: number
    max: number
    count: number
  }
  dbQueryTime: {
    avg: number
    max: number
    count: number
  }
  eventRate: {
    perSecond: number
    total: number
  }
  uptime: number
}

// Constants
const METRIC_BUFFER_SIZE = 1000
const SAMPLE_INTERVAL_MS = 5000 // Sample every 5 seconds
const LOG_INTERVAL_MS = 60000 // Log summary every minute

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map()
  private sampleTimer: NodeJS.Timeout | null = null
  private logTimer: NodeJS.Timeout | null = null
  private eventCount = 0
  private lastEventRateCheck = Date.now()
  private isRunning = false

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.isRunning) {
      devLog.log('[PerformanceMonitor] Already running')
      return
    }

    this.isRunning = true
    devLog.log('[PerformanceMonitor] Starting performance monitoring')

    // Sample metrics periodically
    this.sampleTimer = setInterval(() => {
      this.sampleMetrics()
    }, SAMPLE_INTERVAL_MS)

    // Log summary periodically
    this.logTimer = setInterval(() => {
      this.logSummary()
    }, LOG_INTERVAL_MS)

    // Initial sample
    this.sampleMetrics()
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isRunning) return

    this.isRunning = false

    if (this.sampleTimer) {
      clearInterval(this.sampleTimer)
      this.sampleTimer = null
    }

    if (this.logTimer) {
      clearInterval(this.logTimer)
      this.logTimer = null
    }

    devLog.log('[PerformanceMonitor] Stopped')
  }

  /**
   * Record a performance metric
   */
  record(
    name: string,
    value: number,
    unit: PerformanceMetric['unit'] = 'ms'
  ): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
    }

    const buffer = this.metrics.get(name) || []
    buffer.push(metric)

    // Keep buffer size limited
    if (buffer.length > METRIC_BUFFER_SIZE) {
      buffer.shift()
    }

    this.metrics.set(name, buffer)
  }

  /**
   * Record IPC latency
   */
  recordIpcLatency(latencyMs: number): void {
    this.record('ipc_latency', latencyMs, 'ms')
  }

  /**
   * Record database query time
   */
  recordDbQueryTime(queryTimeMs: number): void {
    this.record('db_query', queryTimeMs, 'ms')
  }

  /**
   * Record an event (for rate calculation)
   */
  recordEvent(): void {
    this.eventCount++
  }

  /**
   * Sample current system metrics
   */
  private sampleMetrics(): void {
    const memUsage = process.memoryUsage()

    this.record('heap_used', memUsage.heapUsed, 'bytes')
    this.record('heap_total', memUsage.heapTotal, 'bytes')
    this.record('rss', memUsage.rss, 'bytes')
    this.record('external', memUsage.external, 'bytes')

    // Calculate event rate
    const now = Date.now()
    const elapsed = (now - this.lastEventRateCheck) / 1000
    const rate = this.eventCount / elapsed

    this.record('event_rate', rate, 'count')

    // Reset for next sample
    this.eventCount = 0
    this.lastEventRateCheck = now
  }

  /**
   * Get summary of recent metrics
   */
  getSummary(): PerformanceSummary {
    const getAvgAndMax = (
      name: string
    ): { avg: number; max: number; count: number } => {
      const buffer = this.metrics.get(name) || []
      if (buffer.length === 0) return { avg: 0, max: 0, count: 0 }

      const values = buffer.map(m => m.value)
      const sum = values.reduce((a, b) => a + b, 0)
      return {
        avg: sum / values.length,
        max: Math.max(...values),
        count: values.length,
      }
    }

    const getLatest = (name: string): number => {
      const buffer = this.metrics.get(name) || []
      return buffer.length > 0 ? buffer[buffer.length - 1].value : 0
    }

    return {
      memoryUsage: {
        heapUsed: getLatest('heap_used'),
        heapTotal: getLatest('heap_total'),
        rss: getLatest('rss'),
        external: getLatest('external'),
      },
      ipcLatency: getAvgAndMax('ipc_latency'),
      dbQueryTime: getAvgAndMax('db_query'),
      eventRate: {
        perSecond: getLatest('event_rate'),
        total: this.eventCount,
      },
      uptime: process.uptime(),
    }
  }

  /**
   * Log summary to console
   */
  private logSummary(): void {
    const summary = this.getSummary()

    const formatBytes = (bytes: number): string => {
      const mb = bytes / 1024 / 1024
      return `${mb.toFixed(1)}MB`
    }

    devLog.log('[PerformanceMonitor] Summary:')
    devLog.log(
      `  Memory: ${formatBytes(summary.memoryUsage.heapUsed)} / ${formatBytes(summary.memoryUsage.heapTotal)} (RSS: ${formatBytes(summary.memoryUsage.rss)})`
    )

    if (summary.ipcLatency.count > 0) {
      devLog.log(
        `  IPC Latency: avg ${summary.ipcLatency.avg.toFixed(2)}ms, max ${summary.ipcLatency.max.toFixed(2)}ms`
      )
    }

    if (summary.dbQueryTime.count > 0) {
      devLog.log(
        `  DB Query: avg ${summary.dbQueryTime.avg.toFixed(2)}ms, max ${summary.dbQueryTime.max.toFixed(2)}ms`
      )
    }

    devLog.log(`  Event Rate: ${summary.eventRate.perSecond.toFixed(1)}/sec`)
    devLog.log(`  Uptime: ${(summary.uptime / 60).toFixed(1)} minutes`)
  }

  /**
   * Clear all collected metrics
   */
  clear(): void {
    this.metrics.clear()
    this.eventCount = 0
    this.lastEventRateCheck = Date.now()
  }

  /**
   * Get raw metrics for a specific metric name
   */
  getMetrics(name: string): PerformanceMetric[] {
    return this.metrics.get(name) || []
  }

  /**
   * Check if a metric exceeds threshold (for alerting)
   */
  checkThreshold(
    name: string,
    threshold: number,
    comparison: 'gt' | 'lt' = 'gt'
  ): boolean {
    const buffer = this.metrics.get(name) || []
    if (buffer.length === 0) return false

    const latest = buffer[buffer.length - 1].value

    return comparison === 'gt' ? latest > threshold : latest < threshold
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor()

/**
 * Higher-order function to measure function execution time
 */
export function withTiming<T extends (...args: unknown[]) => unknown>(
  fn: T,
  metricName: string
): T {
  return ((...args: Parameters<T>): ReturnType<T> => {
    const start = performance.now()
    const result = fn(...args)

    // Handle promises
    if (result instanceof Promise) {
      return result.finally(() => {
        const duration = performance.now() - start
        performanceMonitor.record(metricName, duration, 'ms')
      }) as ReturnType<T>
    }

    const duration = performance.now() - start
    performanceMonitor.record(metricName, duration, 'ms')
    return result as ReturnType<T>
  }) as T
}
