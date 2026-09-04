import { mount } from 'svelte';
import App from './App.svelte';
import GithubScripts from './lib/GithubScripts.svelte';
import '@xyflow/svelte/dist/style.css';
import './app.css';
import './selection-fix.css';

const ADMIN_SESSION_KEY = 'zenode:admin';

function isAdminPath() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '/admin';
}

function renderAdminGate() {
  const target = document.getElementById('app');
  if (!target) return;

  document.title = 'ZeNode · Admin';

  target.innerHTML = `
    <div style="
      min-height:100vh;
      display:grid;
      place-items:center;
      padding:24px;
      background:#17191f;
      color:#eef1f6;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    ">
      <main style="
        width:min(420px,100%);
        padding:28px;
        border:1px solid #363a45;
        border-radius:12px;
        background:#20232b;
        box-shadow:0 18px 50px rgba(0,0,0,.28);
      ">
        <h1 style="margin:0 0 8px;font-size:22px;">ZeNode · Admin</h1>
        <p style="margin:0 0 22px;color:#aeb4c0;line-height:1.45;">
          Activa el modo admin sólo para esta sesión del navegador.
        </p>
        <button id="zenode-enter-admin" type="button" style="
          width:100%;
          min-height:42px;
          border:1px solid #565d6c;
          border-radius:8px;
          background:#2d323d;
          color:#fff;
          font:inherit;
          font-weight:700;
          cursor:pointer;
        ">Entrar como admin</button>
      </main>
    </div>
  `;

  document.getElementById('zenode-enter-admin')?.addEventListener('click', () => {
    sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
    window.location.replace('/');
  });
}

function mountAdminIndicator() {
  if (sessionStorage.getItem(ADMIN_SESSION_KEY) !== 'true') return;

  const adminUi = document.createElement('div');
  adminUi.id = 'zenode-admin-session';
  adminUi.style.cssText = [
    'position:fixed',
    'right:14px',
    'bottom:14px',
    'z-index:99999',
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:8px 10px',
    'border:1px solid #545b69',
    'border-radius:8px',
    'background:#20232b',
    'box-shadow:0 8px 28px rgba(0,0,0,.35)',
    'font-family:Inter,ui-sans-serif,system-ui,sans-serif'
  ].join(';');

  const badge = document.createElement('strong');
  badge.textContent = 'ADMIN';
  badge.style.cssText = 'font-size:11px;letter-spacing:.08em;color:#fff';

  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.textContent = 'Salir de admin';
  exitButton.style.cssText = [
    'min-height:30px',
    'padding:0 10px',
    'border:1px solid #565d6c',
    'border-radius:6px',
    'background:#2d323d',
    'color:#fff',
    'font:inherit',
    'font-size:12px',
    'cursor:pointer'
  ].join(';');

  exitButton.onclick = () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.reload();
  };

  adminUi.append(badge, exitButton);
  document.body.appendChild(adminUi);
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
    )
  );
}

function installDeleteConnectionShortcut() {
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    const deleteConnectionButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.trim() === 'Borrar conexión');

    if (!deleteConnectionButton || deleteConnectionButton.disabled) return;

    event.preventDefault();
    deleteConnectionButton.click();
  });
}

if (isAdminPath()) {
  renderAdminGate();
} else {
  mount(App, {
    target: document.getElementById('app')!
  });

  const githubUi = document.createElement('div');
  githubUi.id = 'zenode-github-scripts';
  document.body.appendChild(githubUi);

  mount(GithubScripts, {
    target: githubUi
  });

  mountAdminIndicator();
  installDeleteConnectionShortcut();
}
