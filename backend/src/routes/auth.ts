import { FastifyInstance } from 'fastify';
import { hashPassword, requireAuth, signToken, UserRole, verifyPassword } from '../auth';
import { pool } from '../db';
import { appLogger } from '../logger';

interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

interface RegisterBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES: ReadonlySet<UserRole> = new Set(['admin', 'user']);

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/register
  app.post<{ Body: RegisterBody }>('/api/auth/register', async (request, reply) => {
    const body = request.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = (body.role === undefined ? 'user' : body.role) as UserRole;

    if (!name || name.length < 2 || name.length > 120) {
      return reply.code(400).send({
        error: 'Name is required and must be between 2 and 120 characters',
      });
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return reply.code(400).send({ error: 'A valid email address is required' });
    }

    if (password.length < 6) {
      return reply.code(400).send({
        error: 'Password must be at least 6 characters long',
      });
    }

    if (!VALID_ROLES.has(role)) {
      return reply.code(400).send({ error: 'Invalid role. Allowed values: admin, user' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.code(409).send({ error: 'A user with this email already exists' });
    }

    const passwordHash = hashPassword(password);
    const result = await pool.query<UserRow>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, password_hash, role, created_at, updated_at`,
      [name, email, passwordHash, role]
    );

    const createdUser = toPublicUser(result.rows[0]);
    const token = signToken(createdUser);

    appLogger.info({
      operation: 'auth.register',
      message: `Registered new user #${createdUser.id} (${createdUser.email})`,
      endpoint: '/api/auth/register',
      method: 'POST',
      statusCode: 201,
      metadata: {
        userId: createdUser.id,
        role: createdUser.role,
      },
    });

    return reply.code(201).send({
      token,
      user: createdUser,
    });
  });

  // POST /api/auth/login
  app.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    const body = request.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    const result = await pool.query<UserRow>(
      'SELECT id, name, email, password_hash, role, created_at, updated_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rowCount === 0 || !verifyPassword(password, result.rows[0].password_hash)) {
      appLogger.warn({
        operation: 'auth.login.failed',
        message: `Invalid login attempt for email ${email}`,
        endpoint: '/api/auth/login',
        method: 'POST',
        statusCode: 401,
      });
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const user = toPublicUser(result.rows[0]);
    const token = signToken(user);

    appLogger.info({
      operation: 'auth.login',
      message: `User #${user.id} (${user.email}) logged in`,
      endpoint: '/api/auth/login',
      method: 'POST',
      statusCode: 200,
      metadata: {
        userId: user.id,
        role: user.role,
      },
    });

    return reply.code(200).send({
      token,
      user,
    });
  });

  // GET /api/auth/me
  app.get('/api/auth/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.authUser!.sub;
    const result = await pool.query<UserRow>(
      'SELECT id, name, email, password_hash, role, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rowCount === 0) {
      return reply.code(401).send({ error: 'User account no longer exists' });
    }

    return reply.code(200).send({ user: toPublicUser(result.rows[0]) });
  });
}
