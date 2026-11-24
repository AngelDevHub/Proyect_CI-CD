// Telemetry MUST be initialized before importing Fastify or pg
import { startTelemetry, shutdownTelemetry } from './telemetry';
startTelemetry();

import { config } from './config';
import { closeDatabase, initializeDatabase } from './db';
import { appLogger } from './logger';
import { buildApp } from './app';

async function main(): Promise<void> {
  await initializeDatabase();
  const app = await buildApp();

  await app.listen({
    port: config.port,
    host: config.host,
  });

  appLogger.info({
    operation: 'server.start',
    message: `OpsTracker backend listening on http://${config.host}:${config.port}`,
    metadata: {
      port: config.port,
      nodeEnv: config.nodeEnv,
    },
  });

  const gracefulShutdown = async (signal: string) => {
    appLogger.info({
      operation: 'server.shutdown',
      message: `Received ${signal}, shutting down gracefully`,
    });
    await app.close();
    await closeDatabase();
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
}

main().catch(async (err) => {
  const error = err instanceof Error ? err : new Error(String(err));
  appLogger.error({
    operation: 'server.fatal',
    message: `Failed to start OpsTracker backend: ${error.message}`,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });
  await shutdownTelemetry();
  process.exit(1);
});
