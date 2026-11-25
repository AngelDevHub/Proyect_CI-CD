import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  hasPermission,
  sanitizeUser,
} from '../utils/security';

describe('Unit Test Suite — Security & RBAC Utilities', () => {
  // ==========================================================================
  // 1. Password Hashing & Verification (Scrypt)
  // ==========================================================================
  describe('hashPassword & verifyPassword', () => {
    test('hashes a password and produces salt:hash format', async () => {
      const hash = await hashPassword('Admin123!Secure');
      expect(typeof hash).toBe('string');
      expect(hash).toContain(':');
      const parts = hash.split(':');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toHaveLength(32); // 16 bytes hex salt
      expect(parts[1]).toHaveLength(128); // 64 bytes hex key
    });

    test('hashes the same password with different salts (unique hashes)', async () => {
      const hash1 = await hashPassword('Secret123');
      const hash2 = await hashPassword('Secret123');
      expect(hash1).not.toBe(hash2);
    });

    test('verifies correct password returns true', async () => {
      const password = 'SuperSecretPassword2026!';
      const hash = await hashPassword(password);
      const isMatch = await verifyPassword(password, hash);
      expect(isMatch).toBe(true);
    });

    test('verifies wrong password returns false', async () => {
      const hash = await hashPassword('CorrectPassword');
      const isMatch = await verifyPassword('WrongPassword', hash);
      expect(isMatch).toBe(false);
    });

    test.each([
      ['empty password', '', 'salt:key'],
      ['null hash', 'password', null as any],
      ['malformed hash without colon', 'password', 'invalidhashstring'],
      ['invalid hex format', 'password', 'invalid:nonhex!@#$'],
    ])('gracefully returns false on corrupted input %s', async (_, pass, hash) => {
      const isMatch = await verifyPassword(pass, hash);
      expect(isMatch).toBe(false);
    });
  });

  // ==========================================================================
  // 2. JWT Generation & Verification
  // ==========================================================================
  describe('generateToken & verifyToken', () => {
    const mockUser = {
      id: 42,
      email: 'sre@opstracker.com',
      role: 'admin',
      name: 'Site Reliability Engineer',
    };

    test('generates valid 3-part base64url token', () => {
      const token = generateToken(mockUser);
      expect(typeof token).toBe('string');
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    test('verifies valid token and extracts accurate payload', () => {
      const token = generateToken(mockUser);
      const result = verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.id).toBe(42);
      expect(result.payload?.email).toBe('sre@opstracker.com');
      expect(result.payload?.role).toBe('admin');
      expect(result.payload?.name).toBe('Site Reliability Engineer');
      expect(result.payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    test('rejects token signed with different secret', () => {
      const token = generateToken(mockUser, 3600, 'secret_key_AAA');
      const result = verifyToken(token, 'secret_key_BBB');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid signature');
    });

    test('detects tampered payload', () => {
      const token = generateToken(mockUser);
      const [header, payload, sig] = token.split('.');
      // Tamper with payload (modify role to superadmin)
      const tamperedPayload = Buffer.from(
        JSON.stringify({ ...mockUser, role: 'superadmin' })
      ).toString('base64url');

      const tamperedToken = `${header}.${tamperedPayload}.${sig}`;
      const result = verifyToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid signature');
    });

    test('detects expired token', () => {
      // Create a token expired 10 seconds ago
      const token = generateToken(mockUser, -10);
      const result = verifyToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Token expired');
    });

    test.each([
      ['', 'Token is missing or not a string'],
      [null as any, 'Token is missing or not a string'],
      ['singlepart', 'Malformed token structure'],
      ['two.parts', 'Malformed token structure'],
      ['one.two.three.four', 'Malformed token structure'],
    ])('rejects malformed token structure %p', (token, expectedReason) => {
      const result = verifyToken(token);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe(expectedReason);
    });
  });

  // ==========================================================================
  // 3. RBAC Permissions Matrix
  // ==========================================================================
  describe('hasPermission (RBAC)', () => {
    const adminAllowed = [
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
    ];

    test.each(adminAllowed)('admin role has permission "%s"', (action) => {
      expect(hasPermission('admin', action)).toBe(true);
      expect(hasPermission('ADMIN', action)).toBe(true); // Case-insensitive
    });

    const operatorAllowed = ['tasks:create', 'tasks:read', 'tasks:update', 'tasks:delete', 'users:read', 'metrics:read'];
    const operatorDenied = ['users:create', 'users:delete', 'users:manage', 'system:admin'];

    test.each(operatorAllowed)('operator role allows action "%s"', (action) => {
      expect(hasPermission('operator', action)).toBe(true);
    });

    test.each(operatorDenied)('operator role denies action "%s"', (action) => {
      expect(hasPermission('operator', action)).toBe(false);
    });

    test.each(['tasks:read', 'metrics:read'])('viewer role allows "%s"', (action) => {
      expect(hasPermission('viewer', action)).toBe(true);
    });

    test.each(['tasks:create', 'tasks:delete', 'users:read', 'system:admin'])(
      'viewer role denies "%s"',
      (action) => {
        expect(hasPermission('viewer', action)).toBe(false);
      }
    );

    test('unknown role has no permissions', () => {
      expect(hasPermission('guest', 'tasks:read')).toBe(false);
      expect(hasPermission('anonymous', 'tasks:create')).toBe(false);
    });
  });

  // ==========================================================================
  // 4. sanitizeUser
  // ==========================================================================
  describe('sanitizeUser', () => {
    test('removes password_hash and password from user object', () => {
      const user = {
        id: 1,
        email: 'admin@opstracker.com',
        name: 'Administrator',
        role: 'admin',
        password_hash: 'secret_salt:hash_digest',
        password: 'raw_password_should_never_exist',
        created_at: new Date(),
      };

      const safe = sanitizeUser(user);
      expect(safe.id).toBe(1);
      expect(safe.email).toBe('admin@opstracker.com');
      expect(safe.password_hash).toBeUndefined();
      expect(safe.password).toBeUndefined();
    });

    test('handles null or non-object safely', () => {
      expect(sanitizeUser(null)).toBeNull();
      expect(sanitizeUser(undefined)).toBeUndefined();
      expect(sanitizeUser('not-an-object')).toBe('not-an-object');
    });
  });
});
