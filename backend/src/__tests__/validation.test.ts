import {
  validateEmail,
  validatePassword,
  sanitizeInput,
  validateTaskPayload,
  validateTaskStatusTransition,
  calculateTaskSla,
  validatePagination,
  TaskPriority,
  TaskStatus,
} from '../utils/validation';

describe('Unit Test Suite — Input Validation & Business Engine', () => {
  // ==========================================================================
  // 1. validateEmail
  // ==========================================================================
  describe('validateEmail', () => {
    test.each([
      ['admin@opstracker.com', true],
      ['user.name+tag@sub.domain.org', true],
      ['test1234@dev-company.co.uk', true],
      ['first.last@service.cloud', true],
      ['support@10.0.0.1.com', true],
      ['valid_email_underscore@example.net', true],
    ])('accepts valid email "%s" (expect valid: %s)', (email, expectedValid) => {
      const result = validateEmail(email);
      expect(result.valid).toBe(expectedValid);
      expect(result.error).toBeUndefined();
    });

    test.each([
      ['', 'Email is required'],
      [null as any, 'Email is required'],
      [undefined as any, 'Email is required'],
      ['   ', 'Invalid email format'],
      ['plainaddress', 'Invalid email format'],
      ['@missingusername.com', 'Invalid email format'],
      ['missingdomain@.com', 'Invalid email format'],
      ['missingatign.com', 'Invalid email format'],
      ['two@@signs.com', 'Invalid email format'],
      ['space in@email.com', 'Invalid email format'],
      ['<script>alert(1)</script>@hack.com', 'Email contains invalid characters'],
      ['user\nnewline@test.com', 'Email contains invalid characters'],
      ['user\r\nheader@test.com', 'Email contains invalid characters'],
      ['"quote"@test.com', 'Email contains invalid characters'],
      ['a'.repeat(250) + '@long.com', 'Email exceeds maximum length of 254 characters'],
    ])('rejects invalid or unsafe email "%s"', (email, expectedError) => {
      const result = validateEmail(email);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(expectedError);
    });
  });

  // ==========================================================================
  // 2. validatePassword
  // ==========================================================================
  describe('validatePassword', () => {
    test('accepts strong compliant password', () => {
      const result = validatePassword('Admin123!Secure');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    test.each([
      ['Password123!', 100],
      ['Complex$99Pass', 100],
      ['OpsTracker_2026#', 100],
    ])('scores 100 for robust passwords "%s"', (pass, minScore) => {
      const result = validatePassword(pass);
      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(minScore);
    });

    test('rejects empty or null password', () => {
      expect(validatePassword('').valid).toBe(false);
      expect(validatePassword(null as any).valid).toBe(false);
    });

    test('rejects password shorter than 8 characters', () => {
      const result = validatePassword('Ab1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    test('rejects password lacking uppercase character', () => {
      const result = validatePassword('admin123!secure');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    test('rejects password lacking lowercase character', () => {
      const result = validatePassword('ADMIN123!SECURE');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    test('rejects password lacking number', () => {
      const result = validatePassword('AdminSecret!Pass');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    test('rejects password lacking special character', () => {
      const result = validatePassword('Admin123Secure');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    test('rejects password exceeding 128 characters', () => {
      const longPass = 'A1!' + 'a'.repeat(130);
      const result = validatePassword(longPass);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password exceeds maximum length of 128 characters');
    });
  });

  // ==========================================================================
  // 3. sanitizeInput
  // ==========================================================================
  describe('sanitizeInput', () => {
    test.each([
      ['Hello World', 'Hello World'],
      ['  Trim Whitespace  ', 'Trim Whitespace'],
      ['<script>alert("xss")</script>Normal Text', 'alert("xss")Normal Text'],
      ['<div class="danger">Message</div>', 'Message'],
      ['<img src=x onerror=alert(1)>Test', 'Test'],
      ['Line with \u0000 null byte', 'Line with  null byte'],
      ['Text\u0007with bell', 'Textwith bell'],
      ['', ''],
      [null, ''],
      [undefined, ''],
      [12345 as any, '12345'],
    ])('correctly sanitizes input "%s"', (input, expected) => {
      expect(sanitizeInput(input)).toBe(expected);
    });
  });

  // ==========================================================================
  // 4. validateTaskPayload
  // ==========================================================================
  describe('validateTaskPayload', () => {
    test('accepts valid payload with all fields', () => {
      const payload = {
        title: 'Rotate EC2 TLS certificates',
        description: 'Update Let’s Encrypt certs on proxy',
        priority: 'High',
        status: 'Pending',
      };
      const res = validateTaskPayload(payload);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    test('accepts valid payload with only required title', () => {
      const res = validateTaskPayload({ title: 'Quick task' });
      expect(res.valid).toBe(true);
    });

    test.each([
      [null, 'Request body must be a JSON object'],
      ['string instead of obj', 'Request body must be a JSON object'],
      [{ title: '' }, 'Task title is required'],
      [{ title: '   ' }, 'Task title is required'],
      [{ title: 'ab' }, 'Task title must be at least 3 characters long'],
      [{ title: 'a'.repeat(201) }, 'Task title cannot exceed 200 characters'],
      [{ title: 'Valid Title', description: 'x'.repeat(1001) }, 'Task description cannot exceed 1000 characters'],
      [{ title: 'Valid Title', priority: 'UltraHigh' }, 'Priority must be one of: Low, Medium, High, Critical'],
      [{ title: 'Valid Title', status: 'Archived' }, 'Status must be one of: Pending, In Progress, Done'],
    ])('rejects invalid payload %p with error containing expected text', (payload, expectedErr) => {
      const res = validateTaskPayload(payload);
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes(expectedErr))).toBe(true);
    });
  });

  // ==========================================================================
  // 5. validateTaskStatusTransition
  // ==========================================================================
  describe('validateTaskStatusTransition', () => {
    test.each([
      ['Pending', 'Pending', true],
      ['Pending', 'In Progress', true],
      ['In Progress', 'Pending', true],
      ['In Progress', 'Done', true],
      ['In Progress', 'In Progress', true],
      ['Done', 'Done', true],
      ['Done', 'In Progress', true], // Reopening a task
    ])('allows valid transition "%s" -> "%s"', (from, to, expected) => {
      const res = validateTaskStatusTransition(from, to);
      expect(res.allowed).toBe(expected);
    });

    test.each([
      ['Done', 'Pending', 'Completed tasks must be moved to In Progress before resetting to Pending'],
      ['UnknownStatus', 'Done', 'Unknown current status: UnknownStatus'],
      ['Pending', 'Deleted', 'Unknown new status: Deleted'],
    ])('blocks invalid transition "%s" -> "%s"', (from, to, expectedReason) => {
      const res = validateTaskStatusTransition(from, to);
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe(expectedReason);
    });
  });

  // ==========================================================================
  // 6. calculateTaskSla
  // ==========================================================================
  describe('calculateTaskSla', () => {
    test('calculates Critical priority 4h SLA deadline', () => {
      const base = new Date('2026-11-25T10:00:00Z');
      const now = new Date('2026-11-25T11:00:00Z');
      const res = calculateTaskSla('Critical', base, now);

      expect(res.deadline.toISOString()).toBe('2026-11-25T14:00:00.000Z');
      expect(res.isOverdue).toBe(false);
      expect(res.urgencyScore).toBeGreaterThanOrEqual(90);
    });

    test('calculates High priority 24h SLA deadline', () => {
      const base = new Date('2026-11-25T10:00:00Z');
      const now = new Date('2026-11-25T22:00:00Z'); // 12 hours later (50% SLA)
      const res = calculateTaskSla('High', base, now);

      expect(res.deadline.toISOString()).toBe('2026-11-26T10:00:00.000Z');
      expect(res.isOverdue).toBe(false);
      expect(res.urgencyScore).toBe(50);
    });

    test('detects overdue task and clamps urgency to 100', () => {
      const base = new Date('2026-11-20T10:00:00Z');
      const now = new Date('2026-11-25T10:00:00Z'); // 5 days later
      const res = calculateTaskSla('High', base, now);

      expect(res.isOverdue).toBe(true);
      expect(res.urgencyScore).toBe(100);
    });

    test.each(['Medium', 'Low', 'Unknown'])(
      'generates valid deadline and non-negative urgency for %s priority',
      (priority) => {
        const base = new Date();
        const res = calculateTaskSla(priority as TaskPriority, base, base);
        expect(res.deadline.getTime()).toBeGreaterThan(base.getTime());
        expect(res.urgencyScore).toBeGreaterThanOrEqual(0);
      }
    );
  });

  // ==========================================================================
  // 7. validatePagination
  // ==========================================================================
  describe('validatePagination', () => {
    test.each([
      [1, 20, 1, 20, 0],
      [2, 10, 2, 10, 10],
      [5, 50, 5, 50, 200],
      ['3', '15', 3, 15, 30],
      ['invalid', 'invalid', 1, 20, 0], // Fallback to defaults
      [-5, -10, 1, 20, 0],             // Negative protection
      [1, 500, 1, 100, 0],             // Clamping max limit to 100
      [10, 100, 10, 100, 900],
    ])(
      'parses page=%p, limit=%p into expected page=%p, limit=%p, offset=%p',
      (rawPage, rawLimit, expectedPage, expectedLimit, expectedOffset) => {
        const res = validatePagination(rawPage, rawLimit);
        expect(res.page).toBe(expectedPage);
        expect(res.limit).toBe(expectedLimit);
        expect(res.offset).toBe(expectedOffset);
      }
    );
  });
});
