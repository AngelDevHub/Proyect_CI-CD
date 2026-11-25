import { FastifyInstance } from 'fastify';
import { hashPassword, requireAuth, UserRole } from '../auth';
import { pool } from '../db';
import { appLogger } from '../logger';
import { PublicUser } from './auth';

interface UserIdParams {
  id: string;
}

interface CreateUserBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
}

interface UpdateUserBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES: ReadonlySet<UserRole> = new Set(['admin', 'user']);

function parseUserId(rawId: string): number | null {
  if (!/^\d+$/.test(rawId)) {
    return null;
  }
  const parsed = Number(rawId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/users
  app.get('/api/users', { preHandler: [requireAuth] }, async (_request, reply) => {
    const result = await pool.query<PublicUser>(
      'SELECT id, name, email, role, created_at, updated_at FROM users ORDER BY created_at DESC, id DESC'
    );

    appLogger.info({
      operation: 'users.list',
      message: `Listed ${result.rows.length} users`,
      endpoint: '/api/users',
      method: 'GET',
      statusCode: 200,
      metadata: {
        count: result.rows.length,
      },
    });

    return reply.code(200).send({
      users: result.rows,
      total: result.rows.length,
    });
  });

  // POST /api/users
  app.post<{ Body: CreateUserBody }>(
    '/api/users',
    { preHandler: [requireAuth] },
    async (request, reply) => {
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

      const result = await pool.query<PublicUser>(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, role, created_at, updated_at`,
        [name, email, hashPassword(password), role]
      );

      const createdUser = result.rows[0];

      appLogger.info({
        operation: 'users.create',
        message: `Created user #${createdUser.id} (${createdUser.email})`,
        endpoint: '/api/users',
        method: 'POST',
        statusCode: 201,
        metadata: {
          userId: createdUser.id,
          role: createdUser.role,
        },
      });

      return reply.code(201).send(createdUser);
    }
  );

  // PATCH /api/users/:id
  app.patch<{ Params: UserIdParams; Body: UpdateUserBody }>(
    '/api/users/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = parseUserId(request.params.id);
      if (!userId) {
        return reply.code(400).send({ error: 'Invalid user ID' });
      }

      const body = request.body || {};
      const updates: string[] = [];
      const values: unknown[] = [];

      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 120) {
          return reply.code(400).send({
            error: 'Name must be between 2 and 120 characters',
          });
        }
        values.push(body.name.trim());
        updates.push(`name = $${values.length}`);
      }

      if (body.email !== undefined) {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!email || !EMAIL_REGEX.test(email)) {
          return reply.code(400).send({ error: 'A valid email address is required' });
        }
        const duplicate = await pool.query(
          'SELECT id FROM users WHERE email = $1 AND id <> $2',
          [email, userId]
        );
        if (duplicate.rowCount && duplicate.rowCount > 0) {
          return reply.code(409).send({ error: 'A user with this email already exists' });
        }
        values.push(email);
        updates.push(`email = $${values.length}`);
      }

      if (body.role !== undefined) {
        if (typeof body.role !== 'string' || !VALID_ROLES.has(body.role as UserRole)) {
          return reply.code(400).send({ error: 'Invalid role. Allowed values: admin, user' });
        }
        values.push(body.role);
        updates.push(`role = $${values.length}`);
      }

      if (body.password !== undefined) {
        if (typeof body.password !== 'string' || body.password.length < 6) {
          return reply.code(400).send({
            error: 'Password must be at least 6 characters long',
          });
        }
        values.push(hashPassword(body.password));
        updates.push(`password_hash = $${values.length}`);
      }

      if (updates.length === 0) {
        return reply.code(400).send({
          error: 'At least one field (name, email, role, password) must be provided',
        });
      }

      updates.push('updated_at = NOW()');
      values.push(userId);

      const result = await pool.query<PublicUser>(
        `UPDATE users
         SET ${updates.join(', ')}
         WHERE id = $${values.length}
         RETURNING id, name, email, role, created_at, updated_at`,
        values
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: `User #${userId} not found` });
      }

      const updatedUser = result.rows[0];

      appLogger.info({
        operation: 'users.update',
        message: `Updated user #${updatedUser.id}`,
        endpoint: '/api/users/:id',
        method: 'PATCH',
        statusCode: 200,
        metadata: {
          userId: updatedUser.id,
          role: updatedUser.role,
        },
      });

      return reply.code(200).send(updatedUser);
    }
  );

  // DELETE /api/users/:id
  app.delete<{ Params: UserIdParams }>(
    '/api/users/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = parseUserId(request.params.id);
      if (!userId) {
        return reply.code(400).send({ error: 'Invalid user ID' });
      }

      const result = await pool.query<{ id: number }>(
        'DELETE FROM users WHERE id = $1 RETURNING id',
        [userId]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: `User #${userId} not found` });
      }

      appLogger.info({
        operation: 'users.delete',
        message: `Deleted user #${userId}`,
        endpoint: '/api/users/:id',
        method: 'DELETE',
        statusCode: 200,
        metadata: {
          userId,
        },
      });

      return reply.code(200).send({ deleted: true, id: userId });
    }
  );
}
