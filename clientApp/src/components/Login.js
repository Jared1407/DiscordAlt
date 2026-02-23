import { matrixService } from '../services/MatrixService.js';
import { Icons } from '../utils/icons.js';
import { escapeHtml } from '../utils/format.js';

/**
 * Login component — handles login and registration with tabs
 */
export function renderLogin(container, onSuccess) {
  let mode = 'login'; // 'login' | 'register'
  let loading = false;
  let error = '';

  function render() {
    container.innerHTML = `
      <div class="login-wrapper">
        <div class="login-card">
          <div class="login-card__brand">
            <div class="login-card__logo">
              ${Icons.nexus}
            </div>
            <h1 class="login-card__title">Welcome to Nexus</h1>
            <p class="login-card__subtitle">Connect to your Matrix homeserver</p>
          </div>

          <div class="login-tabs">
            <button class="login-tabs__tab ${mode === 'login' ? 'login-tabs__tab--active' : ''}" data-tab="login">
              Sign In
            </button>
            <button class="login-tabs__tab ${mode === 'register' ? 'login-tabs__tab--active' : ''}" data-tab="register">
              Register
            </button>
          </div>

          ${error ? `<div class="login-error">${escapeHtml(error)}</div>` : ''}

          <form class="login-form" id="loginForm">
            <div class="form-group server-url-group">
              <label class="form-group__label">Homeserver URL</label>
              <input class="form-group__input" type="text" id="serverUrl"
                     value="${matrixService.homeserverUrl}" placeholder="https://matrix.example.com" />
            </div>

            <div class="form-group">
              <label class="form-group__label">Username</label>
              <input class="form-group__input" type="text" id="username"
                     placeholder="your_username" autocomplete="username" required />
            </div>

            <div class="form-group">
              <label class="form-group__label">Password</label>
              <input class="form-group__input" type="password" id="password"
                     placeholder="••••••••" autocomplete="current-password" required />
            </div>

            <button class="login-btn login-btn--primary" type="submit" ${loading ? 'disabled' : ''}>
              ${loading ? '<div class="login-btn__spinner"></div>' : ''}
              ${loading ? 'Connecting...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>
        </div>
      </div>
    `;

    // Bind events
    container.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.tab;
        error = '';
        render();
      });
    });

    const form = container.querySelector('#loginForm');
    form.addEventListener('submit', handleSubmit);

    // Auto-focus username
    if (!loading) {
      const usernameInput = container.querySelector('#username');
      if (usernameInput) usernameInput.focus();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;

    const serverUrl = container.querySelector('#serverUrl').value.trim();
    const username = container.querySelector('#username').value.trim();
    const password = container.querySelector('#password').value;

    if (!username || !password) {
      error = 'Please fill in all fields';
      render();
      return;
    }

    loading = true;
    error = '';
    render();

    matrixService.setHomeserverUrl(serverUrl);

    let result;
    if (mode === 'login') {
      result = await matrixService.login(username, password);
    } else {
      result = await matrixService.register(username, password);
    }

    loading = false;

    if (result.success) {
      onSuccess(result.userId);
    } else {
      error = result.error || 'Authentication failed. Please check your credentials.';
      render();
    }
  }

  render();
}

