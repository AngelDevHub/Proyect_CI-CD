import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { config } from './config';

let sdk: NodeSDK | null = null;

export function startTelemetry(): void {
  if (!config.otelEnabled) {
    console.log(
      JSON.stringify({
        level: 'INFO',
        operation: 'telemetry.init',
        message: 'OpenTelemetry disabled via OTEL_ENABLED=false',
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (sdk) {
    return;
  }

  const headers: Record<string, string> = {
    Authorization: config.otelAuthHeader,
    organization: config.otelOrganization,
    'stream-name': config.otelStreamName,
  };

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.otelServiceName,
    [ATTR_SERVICE_VERSION]: config.otelServiceVersion,
    'deployment.environment': config.nodeEnv,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${config.otelEndpoint}/v1/traces`,
    headers,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${config.otelEndpoint}/v1/metrics`,
    headers,
  });

  const logExporter = new OTLPLogExporter({
    url: `${config.otelEndpoint}/v1/logs`,
    headers,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: config.otelMetricsIntervalMs,
  });

  const logRecordProcessor = new BatchLogRecordProcessor(logExporter);

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    logRecordProcessor,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => req.url === '/favicon.ico',
      }),
      new FastifyInstrumentation(),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
      }),
    ],
  });

  sdk.start();

  console.log(
    JSON.stringify({
      level: 'INFO',
      operation: 'telemetry.init',
      message: 'OpenTelemetry OTLP/HTTP SDK started',
      endpoint: config.otelEndpoint,
      serviceName: config.otelServiceName,
      timestamp: new Date().toISOString(),
    })
  );
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        operation: 'telemetry.shutdown',
        message: 'Failed to shut down OpenTelemetry SDK cleanly',
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
  } finally {
    sdk = null;
  }
}
