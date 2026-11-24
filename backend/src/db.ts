import { Pool } from 'pg';
import { config } from './config';
import { appLogger } from './logger';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  appLogger.error({
    operation: 'db.pool.error',
    message: 'Unexpected PostgreSQL pool error',
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
  });
});

export async function initializeDatabase(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
      priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await pool.query(createTableQuery);

  appLogger.info({
    operation: 'db.init',
    message: 'PostgreSQL schema verified (tasks table ready)',
  });
}

export async function checkDatabaseHealth(): Promise<boolean> {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rowCount === 1;
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
