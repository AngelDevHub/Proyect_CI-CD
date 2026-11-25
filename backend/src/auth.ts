import crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config';

export type UserRole = 'admin' | 'user';

export interface AuthTokenPayload {
  sub: number;
  email: string;
  name: string;
  role: UserRole;
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthTokenPayload;
  }
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLength), 'base64').toString('utf8');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, keyHex] = parts;
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(keyHex, 'hex');
  if (derivedBuffer.length !== storedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuffer, storedBuffer);
}

export function signToken(user: {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    })
  );

  const signature = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${header}.${payload}`)
    .digest();

  return `${header}.${payload}.${base64UrlEncode(signature)}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', config.jwtSecret).update(`${header}.${payload}`).digest()
  );

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as AuthTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.exp || decoded.exp < now) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await reply.code(401).send({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    await reply.code(401).send({ error: 'Invalid or expired authentication token.' });
    return;
  }

  request.authUser = payload;
}
