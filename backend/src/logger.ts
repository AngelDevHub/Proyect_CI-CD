import { trace, context } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { config } from './config';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface StructuredLogPayload {
  operation: string;
  message: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, string | number | boolean>;
}

const SEVERITY_MAP: Record<LogLevel, SeverityNumber> = {
  INFO: SeverityNumber.INFO,
  WARN: SeverityNumber.WARN,
  ERROR: SeverityNumber.ERROR,
};

function getTraceContext(): { trace_id: string; span_id: string } {
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan) {
    return { trace_id: '', span_id: '' };
  }
  const spanContext = activeSpan.spanContext();
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
  };
}

export function emitStructuredLog(level: LogLevel, payload: StructuredLogPayload): void {
  const timestamp = new Date().toISOString();
  const { trace_id, span_id } = getTraceContext();

  const record = {
    timestamp,
    level,
    service: config.otelServiceName,
    operation: payload.operation,
    message: payload.message,
    endpoint: payload.endpoint ?? '',
    method: payload.method ?? '',
    statusCode: payload.statusCode ?? 0,
    durationMs: payload.durationMs ?? 0,
    trace_id,
    span_id,
    ...(payload.error ? { error: payload.error } : {}),
    ...(payload.metadata ? { metadata: payload.metadata } : {}),
  };

  // 1. Emit structured JSON to stdout/stderr for container logs
  if (level === 'ERROR') {
    console.error(JSON.stringify(record));
  } else {
    console.log(JSON.stringify(record));
  }

  // 2. Emit OpenTelemetry LogRecord via OTLP/HTTP to OpenObserve
  const otelLogger = logs.getLogger(config.otelServiceName, config.otelServiceVersion);
  const attributes: Record<string, string | number | boolean> = {
    operation: payload.operation,
    endpoint: payload.endpoint ?? '',
    method: payload.method ?? '',
    statusCode: payload.statusCode ?? 0,
    duration_ms: payload.durationMs ?? 0,
    timestamp,
    trace_id,
    span_id,
  };

  if (payload.error) {
    attributes['exception.type'] = payload.error.name;
    attributes['exception.message'] = payload.error.message;
    if (payload.error.stack) {
      attributes['exception.stacktrace'] = payload.error.stack;
    }
  }

  if (payload.metadata) {
    for (const [key, value] of Object.entries(payload.metadata)) {
      attributes[`app.${key}`] = value;
    }
  }

  otelLogger.emit({
    severityNumber: SEVERITY_MAP[level],
    severityText: level,
    body: payload.message,
    attributes,
    context: context.active(),
  });
}

export const appLogger = {
  info: (payload: StructuredLogPayload) => emitStructuredLog('INFO', payload),
  warn: (payload: StructuredLogPayload) => emitStructuredLog('WARN', payload),
  error: (payload: StructuredLogPayload) => emitStructuredLog('ERROR', payload),
};
