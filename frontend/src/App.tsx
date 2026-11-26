import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTask,
  createUser,
  deleteTask,
  deleteUser,
  fetchCurrentUser,
  fetchHealth,
  fetchTasks,
  fetchUsers,
  getStoredToken,
  loginUser,
  registerUser,
  setStoredToken,
  triggerErrorTest,
  updateTask,
  updateUser,
} from './api';
import { HealthResponse, Task, TaskPriority, TaskStatus, User, UserRole } from './types';

type FilterOption = 'all' | TaskStatus;
type AuthMode = 'login' | 'register';
type ActiveSection = 'tasks' | 'users';

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
  // Auth & Navigation state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [activeSection, setActiveSection] = useState<ActiveSection>('tasks');

  // Login / Register form state
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authRole, setAuthRole] = useState<UserRole>('user');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');

  // Users CRUD state
  const [users, setUsers] = useState<User[]>([]);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('user');

  // Global status state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    try {
      const [healthData, taskList, userList] = await Promise.all([
        fetchHealth(),
        fetchTasks(),
        fetchUsers(),
      ]);
      setHealth(healthData);
      setTasks(taskList);
      setUsers(userList);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load OpsTracker data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const healthData = await fetchHealth();
        setHealth(healthData);
      } catch {
        // Health stays null/offline
      }

      if (getStoredToken()) {
        try {
          const user = await fetchCurrentUser();
          setCurrentUser(user);
        } catch {
          setStoredToken(null);
          setCurrentUser(null);
        }
      }
      setAuthReady(true);
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    if (currentUser) {
      void loadWorkspaceData();
    }
  }, [currentUser, loadWorkspaceData]);

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

  // --- Auth handlers ---
  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await loginUser({ email: authEmail.trim(), password: authPassword });
      setStoredToken(res.token);
      setCurrentUser(res.user);
      setAuthPassword('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await registerUser({
        name: authName.trim(),
        email: authEmail.trim(),
        password: authPassword,
        role: authRole,
      });
      setStoredToken(res.token);
      setCurrentUser(res.user);
      setAuthName('');
      setAuthPassword('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setStoredToken(null);
    setCurrentUser(null);
    setTasks([]);
    setUsers([]);
    setAuthMode('login');
    setActiveSection('tasks');
    setErrorMessage(null);
  };

  // --- Task handlers ---
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

  // --- User CRUD handlers ---
  const resetUserForm = () => {
    setEditingUserId(null);
    setUserName('');
    setUserEmail('');
    setUserPassword('');
    setUserRole('user');
  };

  const handleSaveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      if (editingUserId !== null) {
        const updated = await updateUser(editingUserId, {
          name: userName.trim(),
          email: userEmail.trim(),
          role: userRole,
          ...(userPassword ? { password: userPassword } : {}),
        });
        setUsers((prev) => prev.map((u) => (u.id === editingUserId ? updated : u)));
        if (currentUser && currentUser.id === editingUserId) {
          setCurrentUser(updated);
        }
        resetUserForm();
      } else {
        const created = await createUser({
          name: userName.trim(),
          email: userEmail.trim(),
          password: userPassword,
          role: userRole,
        });
        setUsers((prev) => [created, ...prev]);
        resetUserForm();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEditUser = (user: User) => {
    setEditingUserId(user.id);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserPassword('');
    setUserRole(user.role);
  };

  const handleDeleteUser = async (userId: number) => {
    setErrorMessage(null);
    try {
      await deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      if (editingUserId === userId) {
        resetUserForm();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleTriggerErrorTest = async () => {
    setErrorMessage(null);
    try {
      await triggerErrorTest();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error test triggered successfully');
    }
  };

  return (
    <div className="app-shell" data-testid="app-container">
      <header className="topbar">
        <div>
          <h1 className="brand-title" data-testid="app-title">
              OpsTracker-Broken-Build
            </h1>
          <p className="brand-subtitle">
            SRE Operations Board, User Management &amp; OpenTelemetry Observability
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

          {currentUser && (
            <span className="user-badge" data-testid="current-user-badge">
              {currentUser.name} ({currentUser.role})
            </span>
          )}

          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={() => void handleTriggerErrorTest()}
            data-testid="error-test-button"
          >
            Simulate 500 Error
          </button>

          {currentUser && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleLogout}
              data-testid="logout-button"
            >
              Logout
            </button>
          )}
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

      {!authReady ? (
        <p className="empty-state" data-testid="auth-loading">
          Checking session...
        </p>
      ) : !currentUser ? (
        <section className="auth-wrapper" data-testid="auth-section">
          <div className="panel auth-card">
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                className={`filter-btn ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('login');
                  setErrorMessage(null);
                }}
                data-testid="auth-tab-login"
              >
                Login
              </button>
              <button
                type="button"
                className={`filter-btn ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('register');
                  setErrorMessage(null);
                }}
                data-testid="auth-tab-register"
              >
                Register
              </button>
            </div>

            {authMode === 'login' ? (
              <form
                className="task-form"
                onSubmit={(e) => void handleLogin(e)}
                data-testid="login-form"
              >
                <h2 className="panel-title">Sign In to OpsTracker</h2>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="admin@opstracker.com"
                    required
                    data-testid="login-email-input"
                  />
                </label>

                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    data-testid="login-password-input"
                  />
                </label>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={authSubmitting}
                  data-testid="login-submit-button"
                >
                  {authSubmitting ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            ) : (
              <form
                className="task-form"
                onSubmit={(e) => void handleRegister(e)}
                data-testid="register-form"
              >
                <h2 className="panel-title">Create Account</h2>
                <label className="field">
                  <span>Full Name</span>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="e.g., Jane Doe"
                    required
                    minLength={2}
                    data-testid="register-name-input"
                  />
                </label>

                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="jane@opstracker.com"
                    required
                    data-testid="register-email-input"
                  />
                </label>

                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    minLength={6}
                    data-testid="register-password-input"
                  />
                </label>

                <label className="field">
                  <span>Role</span>
                  <select
                    value={authRole}
                    onChange={(e) => setAuthRole(e.target.value as UserRole)}
                    data-testid="register-role-select"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={authSubmitting}
                  data-testid="register-submit-button"
                >
                  {authSubmitting ? 'Creating account...' : 'Register'}
                </button>
              </form>
            )}
          </div>
        </section>
      ) : (
        <>
          <nav className="nav-tabs" data-testid="nav-tabs" aria-label="Workspace sections">
            <button
              type="button"
              className={`nav-tab ${activeSection === 'tasks' ? 'active' : ''}`}
              onClick={() => setActiveSection('tasks')}
              data-testid="nav-tab-tasks"
            >
              Tasks Board ({counts.total})
            </button>
            <button
              type="button"
              className={`nav-tab ${activeSection === 'users' ? 'active' : ''}`}
              onClick={() => setActiveSection('users')}
              data-testid="nav-tab-users"
            >
              Users Management ({users.length})
            </button>
          </nav>

          {activeSection === 'tasks' ? (
            <>
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
                      {(['all', 'pending', 'in_progress', 'done'] as FilterOption[]).map(
                        (option) => (
                          <button
                            key={option}
                            type="button"
                            className={`filter-btn ${filter === option ? 'active' : ''}`}
                            onClick={() => setFilter(option)}
                            data-testid={`filter-${option}`}
                          >
                            {option === 'all' ? 'All' : STATUS_LABELS[option]}
                          </button>
                        )
                      )}
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
            </>
          ) : (
            <main className="main-grid" data-testid="users-section">
              <section className="panel">
                <h2 className="panel-title">
                  {editingUserId !== null ? `Edit User #${editingUserId}` : 'Create New User'}
                </h2>
                <form
                  className="task-form"
                  onSubmit={(e) => void handleSaveUser(e)}
                  data-testid="user-form"
                >
                  <label className="field">
                    <span>Full Name</span>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="e.g., Carlos Mendez"
                      required
                      minLength={2}
                      data-testid="user-name-input"
                    />
                  </label>

                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="carlos@opstracker.com"
                      required
                      data-testid="user-email-input"
                    />
                  </label>

                  <label className="field">
                    <span>
                      Password {editingUserId !== null ? '(leave empty to keep current)' : ''}
                    </span>
                    <input
                      type="password"
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required={editingUserId === null}
                      minLength={editingUserId === null ? 6 : undefined}
                      data-testid="user-password-input"
                    />
                  </label>

                  <label className="field">
                    <span>Role</span>
                    <select
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value as UserRole)}
                      data-testid="user-role-select"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>

                  <div className="form-actions">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submitting}
                      data-testid="user-submit-button"
                    >
                      {submitting
                        ? 'Saving...'
                        : editingUserId !== null
                          ? 'Save Changes'
                          : 'Create User'}
                    </button>

                    {editingUserId !== null && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={resetUserForm}
                        data-testid="user-cancel-edit-button"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section className="panel">
                <h2 className="panel-title">Registered Users ({users.length})</h2>
                {users.length === 0 ? (
                  <p className="empty-state" data-testid="empty-user-list">
                    No users found.
                  </p>
                ) : (
                  <ul className="task-list" data-testid="user-list">
                    {users.map((user) => (
                      <li
                        key={user.id}
                        className="task-card user-card"
                        data-testid={`user-item-${user.id}`}
                      >
                        <div className="task-card-main">
                          <div className="task-title-row">
                            <h3 className="task-title" data-testid={`user-name-${user.id}`}>
                              {user.name}
                            </h3>
                            <span
                              className={`priority-badge ${
                                user.role === 'admin' ? 'priority-high' : 'priority-low'
                              }`}
                              data-testid={`user-role-${user.id}`}
                            >
                              {user.role}
                            </span>
                          </div>
                          <p className="task-description" data-testid={`user-email-${user.id}`}>
                            {user.email}
                          </p>
                          <span className="task-meta">
                            User ID #{user.id} · Updated {new Date(user.updated_at).toLocaleString()}
                          </span>
                        </div>

                        <div className="task-card-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleStartEditUser(user)}
                            data-testid={`user-edit-button-${user.id}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-delete"
                            onClick={() => void handleDeleteUser(user.id)}
                            data-testid={`user-delete-button-${user.id}`}
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
          )}
        </>
      )}
    </div>
  );
}

export default App;
