/**
 * OpsTracker Telemetry & Metrics Helpers
 */

export type StatusCategory = '1xx' | '2xx' | '3xx' | '4xx' | '5xx' | 'unknown';

export function classifyStatusCode(code: number): StatusCategory {
  if (typeof code !== 'number' || isNaN(code)) return 'unknown';
  if (code >= 100 && code < 200) return '1xx';
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500 && code < 600) return '5xx';
  return 'unknown';
}

export function isErrorStatusCode(code: number): boolean {
  return code >= 400;
}

export function calculateErrorRate(totalRequests: number, errorRequests: number): number {
  if (totalRequests <= 0) return 0;
  if (errorRequests <= 0) return 0;
  const rate = (errorRequests / totalRequests) * 100;
  return Math.min(100, Math.round(rate * 100) / 100);
}

export function getLatencyBucket(latencyMs: number): string {
  if (latencyMs < 0) return '<10ms';
  if (latencyMs < 10) return '<10ms';
  if (latencyMs < 50) return '10-50ms';
  if (latencyMs < 200) return '50-200ms';
  if (latencyMs < 1000) return '200-1000ms';
  return '>1000ms';
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const unitIndex = Math.min(i, units.length - 1);
  const value = bytes / Math.pow(1024, unitIndex);
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}
