import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTask,
  deleteTask,
  fetchHealth,
  fetchTasks,
  triggerErrorTest,
  updateTask,
} from './api';
import { HealthResponse, Task, TaskPriority, TaskStatus } from './types';

type FilterOption = 'all' | TaskStatus;

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [healthData, taskList] = await Promise.all([fetchHealth(), fetchTasks()]);
      setHealth(healthData);
      setTasks(taskList);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load OpsTracker data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') {
      return tasks;
    }
    return tasks.filter((task) => task.status === filter);
  }, [tasks, filter]);

  const counts = useMemo(
    () => ({
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
    }),
    [tasks]
  );

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Task title is required');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await createTask({
        title: trimmedTitle,
        description: description.trim(),
        priority,
      });
      setTasks((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
      setPriority('medium');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (taskId: number, newStatus: TaskStatus) => {
    setErrorMessage(null);
    try {
      const updated = await updateTask(taskId, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update task status');
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    setErrorMessage(null);
    try {
      await deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const handleTriggerErrorTest = async () => {
    setErrorMessage(null);
    try {
      await triggerErrorTest();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Error test triggered successfully'
      );
    }
  };

  return (
    <div className="app-shell" data-testid="app-container">
      <header className="topbar">
        <div>
          <h1 className="brand-title" data-testid="app-title">
            OpsTracker
          </h1>
          <p className="brand-subtitle">
            SRE Operations Board &amp; OpenTelemetry Observability Demo
          </p>
        </div>

        <div className="topbar-actions">
          <div
            className={`health-pill ${health?.status === 'ok' ? 'health-ok' : 'health-bad'}`}
            data-testid="health-status"
          >
            <span className="health-dot" />
            <span>
              API: {health?.status === 'ok' ? 'Online' : 'Offline'} · DB:{' '}
              {health?.database || 'unknown'}
            </span>
          </div>

          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={() => void handleTriggerErrorTest()}
            data-testid="error-test-button"
          >
            Simulate 500 Error
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="error-banner" role="alert" data-testid="error-banner">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="banner-close"
            onClick={() => setErrorMessage(null)}
            data-testid="error-banner-close"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <section className="stats-grid" aria-label="Task metrics">
        <div className="stat-card" data-testid="stat-total">
          <span className="stat-label">Total Tasks</span>
          <strong className="stat-value">{counts.total}</strong>
        </div>
        <div className="stat-card" data-testid="stat-pending">
          <span className="stat-label">Pending</span>
          <strong className="stat-value">{counts.pending}</strong>
        </div>
        <div className="stat-card" data-testid="stat-in-progress">
          <span className="stat-label">In Progress</span>
          <strong className="stat-value">{counts.in_progress}</strong>
        </div>
        <div className="stat-card" data-testid="stat-done">
          <span className="stat-label">Done</span>
          <strong className="stat-value">{counts.done}</strong>
        </div>
      </section>

      <main className="main-grid">
        <section className="panel">
          <h2 className="panel-title">New Operational Task</h2>
          <form
            className="task-form"
            onSubmit={(e) => void handleCreateTask(e)}
            data-testid="task-form"
          >
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Rotate EC2 SSH deploy key"
                maxLength={200}
                required
                data-testid="task-title-input"
              />
            </label>

            <label className="field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add runbook details, service owner, or acceptance criteria..."
                rows={3}
                data-testid="task-description-input"
              />
            </label>

            <label className="field">
              <span>Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                data-testid="task-priority-select"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              data-testid="task-submit-button"
            >
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="list-header">
            <h2 className="panel-title">Tasks</h2>
            <div className="filter-group" role="tablist" aria-label="Filter tasks by status">
              {(['all', 'pending', 'in_progress', 'done'] as FilterOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`filter-btn ${filter === option ? 'active' : ''}`}
                  onClick={() => setFilter(option)}
                  data-testid={`filter-${option}`}
                >
                  {option === 'all' ? 'All' : STATUS_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="empty-state" data-testid="loading-indicator">
              Loading operational tasks...
            </p>
          ) : filteredTasks.length === 0 ? (
            <p className="empty-state" data-testid="empty-task-list">
              No tasks found for this filter. Create one to get started.
            </p>
          ) : (
            <ul className="task-list" data-testid="task-list">
              {filteredTasks.map((task) => (
                <li
                  key={task.id}
                  className="task-card"
                  data-testid={`task-item-${task.id}`}
                >
                  <div className="task-card-main">
                    <div className="task-title-row">
                      <h3 className="task-title" data-testid={`task-title-${task.id}`}>
                        {task.title}
                      </h3>
                      <span
                        className={`priority-badge priority-${task.priority}`}
                        data-testid={`task-priority-${task.id}`}
                      >
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>

                    {task.description && (
                      <p
                        className="task-description"
                        data-testid={`task-description-${task.id}`}
                      >
                        {task.description}
                      </p>
                    )}

                    <span className="task-meta">
                      ID #{task.id} · Updated {new Date(task.updated_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="task-card-actions">
                    <select
                      aria-label={`Status for ${task.title}`}
                      value={task.status}
                      onChange={(e) =>
                        void handleStatusChange(task.id, e.target.value as TaskStatus)
                      }
                      className="status-select"
                      data-testid={`task-status-select-${task.id}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>

                    <button
                      type="button"
                      className="btn btn-delete"
                      onClick={() => void handleDeleteTask(task.id)}
                      data-testid={`task-delete-button-${task.id}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
