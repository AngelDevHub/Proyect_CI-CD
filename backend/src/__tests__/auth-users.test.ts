import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { closeDatabase, initializeDatabase, pool } from '../db';

describe('Backend Integration Test Suite — Auth (Register/Login) & CRUD Users', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
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
    await pool.query("DELETE FROM users WHERE email <> 'admin@opstracker.com'");
  });

  describe('POST /api/auth/register & POST /api/auth/login', () => {
    it('registers a new user, returns JWT token, and prevents duplicate email (409)', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Ana Garcia',
          email: 'ana@opstracker.com',
          password: 'Password123!',
          role: 'user',
        },
      });

      expect(registerRes.statusCode).toBe(201);
      const body = JSON.parse(registerRes.payload);
      expect(typeof body.token).toBe('string');
      expect(body.user.email).toBe('ana@opstracker.com');
      expect(body.user.name).toBe('Ana Garcia');
      expect(body.user.password_hash).toBeUndefined();

      // Duplicate registration should fail with 409
      const dupRes = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Ana Duplicate',
          email: 'ana@opstracker.com',
          password: 'Password123!',
        },
      });
      expect(dupRes.statusCode).toBe(409);
    });

    it('rejects registration with invalid email or short password (400)', async () => {
      const badEmail = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { name: 'Bad Email', email: 'not-an-email', password: 'Password123!' },
      });
      expect(badEmail.statusCode).toBe(400);

      const shortPass = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { name: 'Short Pass', email: 'short@opstracker.com', password: '123' },
      });
      expect(shortPass.statusCode).toBe(400);
    });

    it('logs in with valid credentials and rejects wrong password (401)', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Luis Torres',
          email: 'luis@opstracker.com',
          password: 'SecretPass123!',
        },
      });

      const loginOk = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'luis@opstracker.com',
          password: 'SecretPass123!',
        },
      });
      expect(loginOk.statusCode).toBe(200);
      const okBody = JSON.parse(loginOk.payload);
      expect(okBody.token).toBeDefined();
      expect(okBody.user.email).toBe('luis@opstracker.com');

      // Validate /api/auth/me with Bearer token
      const meRes = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${okBody.token}` },
      });
      expect(meRes.statusCode).toBe(200);
      expect(JSON.parse(meRes.payload).user.email).toBe('luis@opstracker.com');

      const loginBad = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'luis@opstracker.com',
          password: 'WrongPassword!',
        },
      });
      expect(loginBad.statusCode).toBe(401);
    });
  });

  describe('CRUD /api/users (Protected by Bearer Token)', () => {
    let authToken: string;

    beforeEach(async () => {
      const reg = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Operator Admin',
          email: 'operator@opstracker.com',
          password: 'Operator123!',
          role: 'admin',
        },
      });
      authToken = JSON.parse(reg.payload).token;
    });

    it('rejects unauthenticated access to /api/users with 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/users' });
      expect(res.statusCode).toBe(401);
    });

    it('performs full CRUD lifecycle on /api/users (Create, Read, Update, Delete)', async () => {
      // CREATE
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          name: 'Maria Lopez',
          email: 'maria@opstracker.com',
          password: 'MariaPass123!',
          role: 'user',
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.payload);
      expect(created.id).toBeDefined();
      expect(created.email).toBe('maria@opstracker.com');

      // READ
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.payload);
      expect(listBody.users.some((u: { email: string }) => u.email === 'maria@opstracker.com')).toBe(
        true
      );

      // UPDATE
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/users/${created.id}`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          name: 'Maria Lopez Updated',
          role: 'admin',
        },
      });
      expect(patchRes.statusCode).toBe(200);
      const updated = JSON.parse(patchRes.payload);
      expect(updated.name).toBe('Maria Lopez Updated');
      expect(updated.role).toBe('admin');

      // DELETE
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/users/${created.id}`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.payload)).toEqual({ deleted: true, id: created.id });

      // DELETE again -> 404
      const deleteAgain = await app.inject({
        method: 'DELETE',
        url: `/api/users/${created.id}`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(deleteAgain.statusCode).toBe(404);
    });
  });
});
