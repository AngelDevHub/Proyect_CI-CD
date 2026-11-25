import { Pool } from 'pg';
import { config } from './config';
import { appLogger } from './logger';
import { hashPassword } from './auth';

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
  const createTasksTable = `
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

  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await pool.query(createTasksTable);
  await pool.query(createUsersTable);

  // Seed default evaluation admin user if it does not exist yet
  const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@opstracker.com';
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!';
  const existingAdmin = await pool.query('SELECT id FROM users WHERE email = $1', [
    defaultAdminEmail,
  ]);
  if (existingAdmin.rowCount === 0) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      ['OpsTracker Admin', defaultAdminEmail, hashPassword(defaultAdminPassword)]
    );
  }

  appLogger.info({
    operation: 'db.init',
    message: 'PostgreSQL schema verified (tasks and users tables ready)',
  });
}

export async function checkDatabaseHealth(): Promise<boolean> {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rowCount === 1;
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
