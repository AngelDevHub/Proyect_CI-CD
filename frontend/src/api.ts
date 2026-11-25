import {
  ApiErrorResponse,
  AuthResponse,
  CreateTaskInput,
  CreateUserInput,
  HealthResponse,
  LoginInput,
  RegisterInput,
  Task,
  TaskStatus,
  UpdateTaskInput,
  UpdateUserInput,
  User,
} from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const TOKEN_STORAGE_KEY = 'opstracker_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};

  if (init?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (init?.headers) {
    Object.assign(headers, init.headers);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorResponse;

  if (!response.ok) {
    const traceSuffix = data.traceId ? ` (traceId: ${data.traceId})` : '';
    throw new Error(`${data.error || `HTTP ${response.status}`}${traceSuffix}`);
  }

  return data;
}

// --- Health & Observability ---
export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export async function triggerErrorTest(): Promise<void> {
  await requestJson<unknown>('/api/error-test');
}

// --- Authentication (Register, Login, Session) ---
export async function registerUser(input: RegisterInput): Promise<AuthResponse> {
  return requestJson<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function loginUser(input: LoginInput): Promise<AuthResponse> {
  return requestJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchCurrentUser(): Promise<User> {
  const result = await requestJson<{ user: User }>('/api/auth/me');
  return result.user;
}

// --- Users CRUD ---
export async function fetchUsers(): Promise<User[]> {
  const result = await requestJson<{ users: User[]; total: number }>('/api/users');
  return result.users;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  return requestJson<User>('/api/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateUser(id: number, input: UpdateUserInput): Promise<User> {
  return requestJson<User>(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteUser(id: number): Promise<{ deleted: boolean; id: number }> {
  return requestJson<{ deleted: boolean; id: number }>(`/api/users/${id}`, {
    method: 'DELETE',
  });
}

// --- Tasks CRUD ---
export async function fetchTasks(status?: TaskStatus): Promise<Task[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const result = await requestJson<{ tasks: Task[]; total: number }>(`/api/tasks${query}`);
  return result.tasks;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return requestJson<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateTask(id: number, input: UpdateTaskInput): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteTask(id: number): Promise<{ deleted: boolean; id: number }> {
  return requestJson<{ deleted: boolean; id: number }>(`/api/tasks/${id}`, {
    method: 'DELETE',
  });
}
