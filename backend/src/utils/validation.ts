/**
 * OpsTracker Input Validation & Business Rules Engine
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PasswordValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
}

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type TaskStatus = 'Pending' | 'In Progress' | 'Done';

const VALID_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Critical'];
const VALID_STATUSES: TaskStatus[] = ['Pending', 'In Progress', 'Done'];

/**
 * Validates email according to standard format and security rules
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = email.trim();
  if (trimmed.length > 254) {
    return { valid: false, error: 'Email exceeds maximum length of 254 characters' };
  }

  // Check for dangerous injection or control characters
  if (/[\r\n\0<>"']/.test(trimmed)) {
    return { valid: false, error: 'Email contains invalid characters' };
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true };
}

/**
 * Validates password strength (length, uppercase, lowercase, number, special char)
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  if (!password || typeof password !== 'string') {
    return { valid: false, score: 0, errors: ['Password is required'] };
  }

  let score = 0;

  if (password.length >= 8) {
    score += 25;
  } else {
    errors.push('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    errors.push('Password exceeds maximum length of 128 characters');
  }

  if (/[A-Z]/.test(password)) {
    score += 25;
  } else {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (/[a-z]/.test(password)) {
    score += 25;
  } else {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (/[0-9]/.test(password)) {
    score += 15;
  } else {
    errors.push('Password must contain at least one number');
  }

  if (/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) {
    score += 10;
  } else {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    score: Math.min(score, 100),
    errors,
  };
}

/**
 * Sanitizes generic string inputs to prevent XSS / control character injections
 */
export function sanitizeInput(input: string | null | undefined): string {
  if (input === null || input === undefined) {
    return '';
  }
  if (typeof input !== 'string') {
    return String(input);
  }

  return input
    .replace(/<[^>]*>?/gm, '') // Strip HTML tags
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '') // Strip control chars
    .trim();
}

/**
 * Validates Task Creation/Update payload
 */
export function validateTaskPayload(payload: any): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  const { title, description, priority, status } = payload;

  if (title === undefined || title === null || String(title).trim().length === 0) {
    errors.push('Task title is required');
  } else {
    const cleanTitle = String(title).trim();
    if (cleanTitle.length < 3) {
      errors.push('Task title must be at least 3 characters long');
    }
    if (cleanTitle.length > 200) {
      errors.push('Task title cannot exceed 200 characters');
    }
  }

  if (description !== undefined && description !== null) {
    const cleanDesc = String(description).trim();
    if (cleanDesc.length > 1000) {
      errors.push('Task description cannot exceed 1000 characters');
    }
  }

  if (priority !== undefined && priority !== null) {
    if (!VALID_PRIORITIES.includes(priority as TaskPriority)) {
      errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }
  }

  if (status !== undefined && status !== null) {
    if (!VALID_STATUSES.includes(status as TaskStatus)) {
      errors.push(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Enforces task state machine transitions
 */
export function validateTaskStatusTransition(
  currentStatus: TaskStatus | string,
  newStatus: TaskStatus | string
): { allowed: boolean; reason?: string } {
  if (currentStatus === newStatus) {
    return { allowed: true };
  }

  if (!VALID_STATUSES.includes(currentStatus as TaskStatus)) {
    return { allowed: false, reason: `Unknown current status: ${currentStatus}` };
  }
  if (!VALID_STATUSES.includes(newStatus as TaskStatus)) {
    return { allowed: false, reason: `Unknown new status: ${newStatus}` };
  }

  // State machine rules:
  // Pending -> In Progress
  // In Progress -> Pending | Done
  // Done -> In Progress (reopen)
  // Direct jump from Done -> Pending is not allowed without going through In Progress
  if (currentStatus === 'Done' && newStatus === 'Pending') {
    return { allowed: false, reason: 'Completed tasks must be moved to In Progress before resetting to Pending' };
  }

  return { allowed: true };
}

/**
 * Calculates task SLA deadlines and urgency score
 */
export function calculateTaskSla(
  priority: TaskPriority | string,
  createdAt: Date = new Date(),
  now: Date = new Date()
): { deadline: Date; isOverdue: boolean; urgencyScore: number } {
  const slaHours: Record<string, number> = {
    Critical: 4,
    High: 24,
    Medium: 72,
    Low: 168,
  };

  const hours = slaHours[priority] ?? 72;
  const deadline = new Date(createdAt.getTime() + hours * 3600 * 1000);
  const isOverdue = now.getTime() > deadline.getTime();

  const totalDuration = hours * 3600 * 1000;
  const elapsed = Math.max(0, now.getTime() - createdAt.getTime());
  let urgency = Math.min(100, Math.round((elapsed / totalDuration) * 100));

  if (priority === 'Critical') urgency = Math.max(urgency, 90);
  if (isOverdue) urgency = 100;

  return {
    deadline,
    isOverdue,
    urgencyScore: urgency,
  };
}

/**
 * Parses and validates pagination query parameters
 */
export function validatePagination(
  rawPage: any,
  rawLimit: any
): { page: number; limit: number; offset: number } {
  let page = parseInt(String(rawPage), 10);
  let limit = parseInt(String(rawLimit), 10);

  if (isNaN(page) || page < 1) {
    page = 1;
  }
  if (isNaN(limit) || limit < 1) {
    limit = 20;
  }
  if (limit > 100) {
    limit = 100;
  }

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}
