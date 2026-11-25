import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { config } from './config';
import { appLogger } from './logger';
import { recordHttpMetrics } from './metrics';
import { registerTaskRoutes } from './routes/tasks';
import { registerAuthRoutes } from './routes/auth';
import { registerUserRoutes } from './routes/users';

declare module 'fastify' {
  interface FastifyRequest {
    startTimeHr?: bigint;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Track request start time & attach trace ID to response headers
  app.addHook('onRequest', async (request, reply) => {
    request.startTimeHr = process.hrtime.bigint();
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      reply.header('x-trace-id', activeSpan.spanContext().traceId);
    }
  });

  // Record OTel metrics and structured HTTP request log on every response
  app.addHook('onResponse', async (request, reply) => {
    const elapsedNs = request.startTimeHr
      ? Number(process.hrtime.bigint() - request.startTimeHr)
      : 0;
    const durationMs = Number((elapsedNs / 1_000_000).toFixed(2));
    const endpoint = request.routeOptions?.url || request.url.split('?')[0];
    const statusCode = reply.statusCode;

    recordHttpMetrics({
      endpoint,
      method: request.method,
      statusCode,
      durationMs,
    });

    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';

    if (level === 'ERROR') {
      appLogger.error({
        operation: 'http.request',
        message: `${request.method} ${endpoint} completed with ${statusCode}`,
        endpoint,
        method: request.method,
        statusCode,
        durationMs,
      });
    } else if (level === 'WARN') {
      appLogger.warn({
        operation: 'http.request',
        message: `${request.method} ${endpoint} completed with ${statusCode}`,
        endpoint,
        method: request.method,
        statusCode,
        durationMs,
      });
    } else {
      appLogger.info({
        operation: 'http.request',
        message: `${request.method} ${endpoint} completed with ${statusCode}`,
        endpoint,
        method: request.method,
        statusCode,
        durationMs,
      });
    }
  });

  // Global error handler: ensures exceptions are logged with trace_id and marked on active span
  app.setErrorHandler((err, request, reply) => {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode =
      typeof (err as { statusCode?: unknown }).statusCode === 'number' &&
      (err as { statusCode: number }).statusCode >= 400
        ? (err as { statusCode: number }).statusCode
        : 500;
    const endpoint = request.routeOptions?.url || request.url.split('?')[0];
    const activeSpan = trace.getActiveSpan();
    const traceId = activeSpan?.spanContext().traceId || '';

    if (activeSpan) {
      activeSpan.recordException(error);
      activeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }

    appLogger.error({
      operation: 'http.error',
      message: `Unhandled exception on ${request.method} ${endpoint}: ${error.message}`,
      endpoint,
      method: request.method,
      statusCode,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });

    return reply.code(statusCode).send({
      error: error.message,
      statusCode,
      endpoint,
      traceId,
      timestamp: new Date().toISOString(),
    });
  });

  await registerTaskRoutes(app);
  await registerAuthRoutes(app);
  await registerUserRoutes(app);

  return app;
}
