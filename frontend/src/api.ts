import {
  ApiErrorResponse,
  CreateTaskInput,
  HealthResponse,
  Task,
  TaskStatus,
  UpdateTaskInput,
} from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};

  if (init?.body) {
    headers['Content-Type'] = 'application/json';
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

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

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

export async function triggerErrorTest(): Promise<void> {
  await requestJson<unknown>('/api/error-test');
}
