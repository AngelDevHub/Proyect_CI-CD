import { metrics } from '@opentelemetry/api';
import { config } from './config';

const meter = metrics.getMeter(config.otelServiceName, config.otelServiceVersion);

const httpRequestsTotal = meter.createCounter('opstracker_http_requests_total', {
  description: 'Total number of HTTP requests processed by OpsTracker backend',
  unit: '1',
});

const httpErrorsTotal = meter.createCounter('opstracker_http_errors_total', {
  description: 'Total number of HTTP error responses (status >= 400)',
  unit: '1',
});

const httpRequestDurationMs = meter.createHistogram('opstracker_http_request_duration_ms', {
  description: 'HTTP request latency in milliseconds',
  unit: 'ms',
});

export interface HttpMetricInput {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
}

export function recordHttpMetrics(input: HttpMetricInput): void {
  const statusClass = `${Math.floor(input.statusCode / 100)}xx`;
  const attributes = {
    endpoint: input.endpoint,
    method: input.method,
    statusCode: input.statusCode,
    status_class: statusClass,
  };

  httpRequestsTotal.add(1, attributes);
  httpRequestDurationMs.record(input.durationMs, attributes);

  if (input.statusCode >= 400) {
    httpErrorsTotal.add(1, attributes);
  }
}
