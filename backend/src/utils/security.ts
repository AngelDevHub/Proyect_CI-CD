import crypto from 'crypto';

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface TokenPayload {
  id: number;
  email: string;
  role: UserRole | string;
  name: string;
  exp: number;
  iat: number;
}

const DEFAULT_JWT_SECRET = process.env.JWT_SECRET || 'opstracker_default_jwt_secret_key_32chars_min!!';

/**
 * Derives a secure password hash with random salt using scrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a password against the stored salt:hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!storedHash || !storedHash.includes(':')) {
      return resolve(false);
    }
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) {
      return resolve(false);
    }

    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const keyBuffer = Buffer.from(key, 'hex');
        if (keyBuffer.length !== derivedKey.length) {
          return resolve(false);
        }
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Generates an HMAC-SHA256 JWT token
 */
export function generateToken(
  user: { id: number; email: string; role: string; name: string },
  expiresInSeconds: number = 86400,
  secret: string = DEFAULT_JWT_SECRET
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verifies JWT token signature and expiration
 */
export function verifyToken(
  token: string,
  secret: string = DEFAULT_JWT_SECRET
): { valid: boolean; payload?: TokenPayload; reason?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Token is missing or not a string' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'Malformed token structure' };
  }

  const [headerB64, payloadB64, signature] = parts;

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) {
    return { valid: false, reason: 'Invalid signature' };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { valid: false, reason: 'Token expired' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'Invalid payload encoding' };
  }
}

/**
 * Role-Based Access Control (RBAC) permission check
 */
export function hasPermission(role: string, action: string): boolean {
  const permissions: Record<string, string[]> = {
    admin: [
      'tasks:create',
      'tasks:read',
      'tasks:update',
      'tasks:delete',
      'users:create',
      'users:read',
      'users:update',
      'users:delete',
      'users:manage',
      'system:admin',
      'metrics:read',
    ],
    operator: [
      'tasks:create',
      'tasks:read',
      'tasks:update',
      'tasks:delete',
      'users:read',
      'metrics:read',
    ],
    viewer: ['tasks:read', 'metrics:read'],
  };

  const allowedActions = permissions[role.toLowerCase()] || [];
  return allowedActions.includes(action);
}

/**
 * Strips sensitive data from user object for safe public response
 */
export function sanitizeUser(user: any): any {
  if (!user || typeof user !== 'object') return user;
  const { password_hash, password, ...safeUser } = user;
  return safeUser;
}
