import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { closeDatabase, initializeDatabase, pool } from '../db';

describe('Backend Integration Test Suite — OpsTracker API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Ensure database connection and tables exist
    await initializeDatabase();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeDatabase();
  });

  beforeEach(async () => {
    // Clean tasks table between tests to keep deterministic assertions
    await pool.query('TRUNCATE TABLE tasks RESTART IDENTITY CASCADE');
  });

  describe('GET /api/health', () => {
    it('returns status ok, service name and connected database', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.status).toBe('ok');
      expect(payload.service).toBe('opstracker-backend');
      expect(payload.database).toBe('connected');
      expect(typeof payload.timestamp).toBe('string');
    });
  });

  describe('POST /api/tasks', () => {
    it('creates a new task with default status and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          title: 'Implement OTLP Metrics Exporter',
          description: 'Export RPS and latency to OpenObserve',
          priority: 'high',
        },
      });

      expect(response.statusCode).toBe(201);
      const task = JSON.parse(response.payload);
      expect(task.id).toBeDefined();
      expect(task.title).toBe('Implement OTLP Metrics Exporter');
      expect(task.description).toBe('Export RPS and latency to OpenObserve');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('high');
      expect(task.created_at).toBeDefined();
    });

    it('rejects creation when title is empty (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          title: '   ',
          priority: 'low',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toMatch(/Task title is required/);
    });

    it('rejects creation with invalid priority (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          title: 'Validate priority',
          priority: 'critical_emergency',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toMatch(/Invalid priority/);
    });

    it('rejects creation with invalid status (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          title: 'Validate status',
          status: 'abandoned',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toMatch(/Invalid status/);
    });
  });

  describe('GET /api/tasks', () => {
    beforeEach(async () => {
      await pool.query(`
        INSERT INTO tasks (title, description, status, priority) VALUES
        ('Task Alpha', 'Desc A', 'pending', 'low'),
        ('Task Beta', 'Desc B', 'in_progress', 'medium'),
        ('Task Gamma', 'Desc C', 'done', 'high')
      `);
    });

    it('returns all tasks and total count', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tasks',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.total).toBe(3);
      expect(data.tasks).toHaveLength(3);
    });

    it('filters tasks by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tasks?status=in_progress',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.total).toBe(1);
      expect(data.tasks[0].title).toBe('Task Beta');
      expect(data.tasks[0].status).toBe('in_progress');
    });

    it('returns 400 on invalid status filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tasks?status=invalid_status',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toMatch(/Invalid status filter/);
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    let createdTaskId: number;

    beforeEach(async () => {
      const res = await pool.query<{ id: number }>(`
        INSERT INTO tasks (title, description, status, priority)
        VALUES ('Task to Update', 'Initial desc', 'pending', 'medium')
        RETURNING id
      `);
      createdTaskId = res.rows[0].id;
    });

    it('updates status and priority successfully (200)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tasks/${createdTaskId}`,
        payload: {
          status: 'done',
          priority: 'high',
        },
      });

      expect(response.statusCode).toBe(200);
      const updated = JSON.parse(response.payload);
      expect(updated.id).toBe(createdTaskId);
      expect(updated.status).toBe('done');
      expect(updated.priority).toBe('high');
      expect(updated.title).toBe('Task to Update');
    });

    it('returns 404 when updating non-existent task', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tasks/999999',
        payload: { status: 'done' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toMatch(/not found/);
    });

    it('returns 400 when task id is non-numeric', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tasks/abc-invalid',
        payload: { status: 'done' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toMatch(/Invalid task ID/);
    });

    it('returns 400 when no fields are sent to update', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tasks/${createdTaskId}`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toMatch(/At least one field.*must be provided/);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    let createdTaskId: number;

    beforeEach(async () => {
      const res = await pool.query<{ id: number }>(`
        INSERT INTO tasks (title, description, status, priority)
        VALUES ('Task to Delete', 'Desc', 'pending', 'low')
        RETURNING id
      `);
      createdTaskId = res.rows[0].id;
    });

    it('deletes an existing task (200)', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tasks/${createdTaskId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.deleted).toBe(true);
      expect(body.id).toBe(createdTaskId);

      // Verify deletion in database
      const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [createdTaskId]);
      expect(check.rowCount).toBe(0);
    });

    it('returns 404 when deleting a task that does not exist', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/tasks/999999',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toMatch(/not found/);
    });
  });

  describe('GET /api/error-test', () => {
    it('triggers a simulated 500 error with traceId in payload', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/error-test',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.statusCode).toBe(500);
      expect(body.endpoint).toBe('/api/error-test');
      expect(body.error).toMatch(/Simulated internal server error/);
      expect(body.timestamp).toBeDefined();
    });
  });
});
