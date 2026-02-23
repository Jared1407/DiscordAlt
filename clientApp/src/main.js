/**
 * Nexus — Matrix Chat Client
 * Entry point: handles session restore and screen transitions.
 */
import './styles/index.css';
import './styles/login.css';
import './styles/app.css';
import './styles/chat.css';
import './styles/modal.css';
import './styles/voice.css';

import { matrixService } from './services/MatrixService.js';
import { renderLogin } from './components/Login.js';
import { renderApp } from './components/AppLayout.js';

const app = document.getElementById('app');

async function init() {
    // Try to restore a previous session
    const restored = matrixService.restoreSession();

    if (restored) {
        showLoadingScreen();
        try {
            await matrixService.startSync();
            showApp();
        } catch (err) {
            console.error('Failed to restore session:', err);
            localStorage.removeItem('mx_session');
            showLogin();
        }
    } else {
        showLogin();
    }
}

function showLoadingScreen() {
    app.innerHTML = `
    <div class="login-wrapper">
      <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
        <div class="spinner spinner--lg"></div>
        <div style="color: var(--text-secondary); font-size: var(--font-sm);">
          Connecting to server...
        </div>
      </div>
    </div>
  `;
}

function showLogin() {
    renderLogin(app, async (userId) => {
        showLoadingScreen();
        try {
            await matrixService.startSync();
            showApp();
        } catch (err) {
            console.error('Sync failed after login:', err);
            showLogin();
        }
    });
}

function showApp() {
    renderApp(app);
}

// Boot
init();
