import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { checkDatabaseHealth, pool } from '../db';
import { appLogger } from '../logger';

export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskRecord {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  updated_at: string;
}

const VALID_STATUSES: ReadonlySet<TaskStatus> = new Set(['pending', 'in_progress', 'done']);
const VALID_PRIORITIES: ReadonlySet<TaskPriority> = new Set(['low', 'medium', 'high']);

interface ListTasksQuery {
  status?: string;
}

interface CreateTaskBody {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  priority?: unknown;
}

interface TaskIdParams {
  id: string;
}

interface UpdateTaskBody {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  priority?: unknown;
}

function parseTaskId(rawId: string): number | null {
  if (!/^\d+$/.test(rawId)) {
    return null;
  }
  const parsed = Number(rawId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/health
  app.get('/api/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const timestamp = new Date().toISOString();
    try {
      const dbOk = await checkDatabaseHealth();
      return reply.code(200).send({
        status: 'ok',
        service: 'opstracker-backend',
        database: dbOk ? 'connected' : 'degraded',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      appLogger.error({
        operation: 'health.check',
        message: 'Database health check failed',
        endpoint: '/api/health',
        method: 'GET',
        statusCode: 503,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
      return reply.code(503).send({
        status: 'error',
        service: 'opstracker-backend',
        database: 'disconnected',
        timestamp,
      });
    }
  });

  // GET /api/tasks
  app.get<{ Querystring: ListTasksQuery }>('/api/tasks', async (request, reply) => {
    const { status } = request.query;

    if (status && !VALID_STATUSES.has(status as TaskStatus)) {
      return reply.code(400).send({
        error: 'Invalid status filter. Allowed values: pending, in_progress, done',
      });
    }

    const queryResult = status
      ? await pool.query<TaskRecord>(
          'SELECT id, title, description, status, priority, created_at, updated_at FROM tasks WHERE status = $1 ORDER BY created_at DESC, id DESC',
          [status]
        )
      : await pool.query<TaskRecord>(
          'SELECT id, title, description, status, priority, created_at, updated_at FROM tasks ORDER BY created_at DESC, id DESC'
        );

    appLogger.info({
      operation: 'tasks.list',
      message: `Listed ${queryResult.rows.length} tasks`,
      endpoint: '/api/tasks',
      method: 'GET',
      statusCode: 200,
      metadata: {
        count: queryResult.rows.length,
        filter: status || 'all',
      },
    });

    return reply.code(200).send({
      tasks: queryResult.rows,
      total: queryResult.rows.length,
    });
  });

  // POST /api/tasks
  app.post<{ Body: CreateTaskBody }>('/api/tasks', async (request, reply) => {
    const body = request.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const status = (body.status === undefined ? 'pending' : body.status) as TaskStatus;
    const priority = (body.priority === undefined ? 'medium' : body.priority) as TaskPriority;

    if (!title || title.length > 200) {
      return reply.code(400).send({
        error: 'Task title is required and must be between 1 and 200 characters',
      });
    }

    if (!VALID_STATUSES.has(status)) {
      return reply.code(400).send({
        error: 'Invalid status. Allowed values: pending, in_progress, done',
      });
    }

    if (!VALID_PRIORITIES.has(priority)) {
      return reply.code(400).send({
        error: 'Invalid priority. Allowed values: low, medium, high',
      });
    }

    const insertResult = await pool.query<TaskRecord>(
      `INSERT INTO tasks (title, description, status, priority)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, description, status, priority, created_at, updated_at`,
      [title, description, status, priority]
    );

    const createdTask = insertResult.rows[0];

    appLogger.info({
      operation: 'tasks.create',
      message: `Created task #${createdTask.id}`,
      endpoint: '/api/tasks',
      method: 'POST',
      statusCode: 201,
      metadata: {
        taskId: createdTask.id,
        priority: createdTask.priority,
        status: createdTask.status,
      },
    });

    return reply.code(201).send(createdTask);
  });

  // PATCH /api/tasks/:id
  app.patch<{ Params: TaskIdParams; Body: UpdateTaskBody }>(
    '/api/tasks/:id',
    async (request, reply) => {
      const taskId = parseTaskId(request.params.id);
      if (!taskId) {
        return reply.code(400).send({ error: 'Invalid task ID' });
      }

      const body = request.body || {};
      const updates: string[] = [];
      const values: unknown[] = [];

      if (body.title !== undefined) {
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) {
          return reply.code(400).send({
            error: 'Task title must be a non-empty string up to 200 characters',
          });
        }
        values.push(body.title.trim());
        updates.push(`title = $${values.length}`);
      }

      if (body.description !== undefined) {
        if (typeof body.description !== 'string') {
          return reply.code(400).send({ error: 'Task description must be a string' });
        }
        values.push(body.description.trim());
        updates.push(`description = $${values.length}`);
      }

      if (body.status !== undefined) {
        if (typeof body.status !== 'string' || !VALID_STATUSES.has(body.status as TaskStatus)) {
          return reply.code(400).send({
            error: 'Invalid status. Allowed values: pending, in_progress, done',
          });
        }
        values.push(body.status);
        updates.push(`status = $${values.length}`);
      }

      if (body.priority !== undefined) {
        if (
          typeof body.priority !== 'string' ||
          !VALID_PRIORITIES.has(body.priority as TaskPriority)
        ) {
          return reply.code(400).send({
            error: 'Invalid priority. Allowed values: low, medium, high',
          });
        }
        values.push(body.priority);
        updates.push(`priority = $${values.length}`);
      }

      if (updates.length === 0) {
        return reply.code(400).send({
          error: 'At least one field (title, description, status, priority) must be provided',
        });
      }

      updates.push('updated_at = NOW()');
      values.push(taskId);

      const updateQuery = `
        UPDATE tasks
        SET ${updates.join(', ')}
        WHERE id = $${values.length}
        RETURNING id, title, description, status, priority, created_at, updated_at
      `;

      const updateResult = await pool.query<TaskRecord>(updateQuery, values);
      if (updateResult.rowCount === 0) {
        return reply.code(404).send({ error: `Task #${taskId} not found` });
      }

      const updatedTask = updateResult.rows[0];

      appLogger.info({
        operation: 'tasks.update',
        message: `Updated task #${updatedTask.id}`,
        endpoint: '/api/tasks/:id',
        method: 'PATCH',
        statusCode: 200,
        metadata: {
          taskId: updatedTask.id,
          status: updatedTask.status,
          priority: updatedTask.priority,
        },
      });

      return reply.code(200).send(updatedTask);
    }
  );

  // DELETE /api/tasks/:id
  app.delete<{ Params: TaskIdParams }>('/api/tasks/:id', async (request, reply) => {
    const taskId = parseTaskId(request.params.id);
    if (!taskId) {
      return reply.code(400).send({ error: 'Invalid task ID' });
    }

    const deleteResult = await pool.query<{ id: number }>(
      'DELETE FROM tasks WHERE id = $1 RETURNING id',
      [taskId]
    );

    if (deleteResult.rowCount === 0) {
      return reply.code(404).send({ error: `Task #${taskId} not found` });
    }

    appLogger.info({
      operation: 'tasks.delete',
      message: `Deleted task #${taskId}`,
      endpoint: '/api/tasks/:id',
      method: 'DELETE',
      statusCode: 200,
      metadata: {
        taskId,
      },
    });

    return reply.code(200).send({ deleted: true, id: taskId });
  });

  // GET /api/error-test
  app.get('/api/error-test', async (_request, _reply) => {
    const simulatedError = new Error(
      'Simulated internal server error triggered via /api/error-test for OpenObserve observability verification'
    );
    simulatedError.name = 'SimulatedObservabilityError';

    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.recordException(simulatedError);
      activeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: simulatedError.message,
      });
    }

    throw simulatedError;
  });
}
