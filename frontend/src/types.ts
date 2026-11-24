export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}

export interface HealthResponse {
  status: string;
  service: string;
  database: string;
  uptimeSeconds?: number;
  timestamp: string;
}

export interface ApiErrorResponse {
  error: string;
  statusCode?: number;
  endpoint?: string;
  traceId?: string;
  timestamp?: string;
}
