import dotenv from 'dotenv';
import path from 'path';

// Load root .env if running locally outside Docker, then backend .env if present
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  corsOrigin: string;
  databaseUrl: string;
  otelEnabled: boolean;
  otelServiceName: string;
  otelServiceVersion: string;
  otelEndpoint: string;
  otelOrganization: string;
  otelStreamName: string;
  otelAuthHeader: string;
  otelMetricsIntervalMs: number;
}

function buildAuthHeader(): string {
  const explicit = process.env.OTEL_EXPORTER_OTLP_AUTH_HEADER?.trim();
  if (explicit) {
    return explicit;
  }

  const user = process.env.OPENOBSERVE_USER?.trim() || 'root@example.com';
  const password = process.env.OPENOBSERVE_PASSWORD?.trim() || 'Complexpass#123';
  const encoded = Buffer.from(`${user}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

export const config: AppConfig = {
  port: Number(process.env.BACKEND_PORT || process.env.PORT || 3001),
  host: process.env.BACKEND_HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://opstracker:opstracker_pass@localhost:5432/opstracker',
  otelEnabled: (process.env.OTEL_ENABLED ?? 'true').toLowerCase() !== 'false',
  otelServiceName: process.env.OTEL_SERVICE_NAME || 'opstracker-backend',
  otelServiceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
  otelEndpoint: (
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:5080/api/default'
  ).replace(/\/+$/, ''),
  otelOrganization: process.env.OPENOBSERVE_ORG || 'default',
  otelStreamName: process.env.OPENOBSERVE_OTEL_STREAM || 'opstracker_logs',
  otelAuthHeader: buildAuthHeader(),
  otelMetricsIntervalMs: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS || 10000),
};
