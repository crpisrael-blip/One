/* ═══════════════════════════════════════════════════════════
   ONE Platform — Frontend Application
   by Ort-Tech
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─── Configuration ──────────────────────────────────────────
const CONFIG = {
  API_BASE: location.hostname === 'localhost'
    ? '/api/v1'
    : 'https://one-api.menahemtzik1.workers.dev/v1',
};

// ─── State ──────────────────────────────────────────────────
let currentUser = null;
let currentView = 'dashboard';
let token = localStorage.getItem('one_token') || null;

// ─── Helpers ────────────────────────────────────────────────
const $ = (sel, el) => (el || document).querySelector(sel);
const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function toast(msg, kind = 'info') {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${CONFIG.API_BASE}${path}`, {
    ...opts,
    headers: { ...headers, ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json();
  if (!data.ok) {
    toast(data.error?.message || 'שגיאה', 'error');
    throw new Error(data.error?.message || 'API error');
  }
  return data;
}

// ─── Modal ──────────────────────────────────────────────────
function openModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal-overlay').hidden = false;
}

function closeModal() {
  $('#modal-overlay').hidden = true;
}

// ─── Auth ───────────────────────────────────────────────────
function showLogin() {
  $('#login-screen').classList.add('active');
  $('#main-layout').hidden = true;
  $('#main-layout').classList.remove('active');
}

function showApp() {
  $('#login-screen').classList.remove('active');
  $('#main-layout').hidden = false;
  $('#main-layout').classList.add('active');
  loadDashboard();
}

// ─── Navigation ─────────────────────────────────────────────
function switchView(viewName) {
  currentView = viewName;

  $$('.view').forEach(v => { v.hidden = true; v.classList.remove('active'); });
  const target = $(`#view-${viewName}`);
  if (target) { target.hidden = false; target.classList.add('active'); }

  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.view === viewName));

  // Load data for view
  switch (viewName) {
    case 'dashboard': loadDashboard(); break;
    case 'users': loadUsers(); break;
    case 'organizations': loadOrganizations(); break;
    case 'configuration': loadConfiguration(); break;
    case 'audit': loadAudit(); break;
  }
}

// ─── Dashboard ──────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [users, orgs] = await Promise.all([
      api('/identity/users?per_page=1'),
      api('/tenants/current/organizations'),
    ]);
    $('#stat-users').textContent = users.meta?.total ?? '—';
    $('#stat-orgs').textContent = orgs.data?.length ?? '—';
    $('#stat-events').textContent = '—';
    $('#stat-active').textContent = '—';
  } catch {
    // Dashboard stats are non-critical
  }
}

// ─── Users ──────────────────────────────────────────────────
async function loadUsers() {
  try {
    const res = await api('/identity/users');
    const tbody = $('#users-table tbody');
    tbody.innerHTML = '';
    for (const u of res.data || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td><span class="badge badge-info">${esc(u.role)}</span></td>
        <td>${u.active ? '<span class="badge badge-success">פעיל</span>' : '<span class="badge badge-danger">לא פעיל</span>'}</td>
        <td>—</td>
      `;
      tbody.appendChild(tr);
    }
  } catch {
    toast('שגיאה בטעינת משתמשים', 'error');
  }
}

// ─── Organizations ──────────────────────────────────────────
async function loadOrganizations() {
  try {
    const res = await api('/tenants/current/organizations');
    const container = $('#org-list');
    container.innerHTML = '';
    for (const org of res.data || []) {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div class="stat-value" style="font-size:1.2rem">${esc(org.name)}</div>
        <div class="stat-label">${org.parent_id ? 'תת-ארגון' : 'ארגון ראשי'}</div>
      `;
      container.appendChild(card);
    }
    if (!res.data?.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">אין ארגונים עדיין</p>';
    }
  } catch {
    toast('שגיאה בטעינת ארגונים', 'error');
  }
}

// ─── Configuration ──────────────────────────────────────────
async function loadConfiguration() {
  try {
    const res = await api('/configuration');
    const container = $('#config-list');
    container.innerHTML = '';
    for (const cfg of res.data || []) {
      const div = document.createElement('div');
      div.className = 'stat-card';
      div.style.textAlign = 'start';
      div.innerHTML = `
        <strong>${esc(cfg.key)}</strong>
        <div style="color:var(--text-secondary);font-size:.85rem;margin-top:.25rem">${esc(JSON.stringify(cfg.value))}</div>
        <div style="color:var(--text-muted);font-size:.75rem;margin-top:.25rem">scope: ${esc(cfg.scope)}</div>
      `;
      container.appendChild(div);
    }
    if (!res.data?.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">אין הגדרות עדיין</p>';
    }
  } catch {
    toast('שגיאה בטעינת הגדרות', 'error');
  }
}

// ─── Audit ──────────────────────────────────────────────────
async function loadAudit() {
  try {
    const res = await api('/audit');
    const tbody = $('#audit-table tbody');
    tbody.innerHTML = '';
    for (const entry of res.data || []) {
      const tr = document.createElement('tr');
      const time = new Date(entry.created_at).toLocaleString('he-IL');
      tr.innerHTML = `
        <td style="font-size:.8rem;white-space:nowrap">${esc(time)}</td>
        <td>${esc(entry.actor_id?.slice(0,8) || '—')}</td>
        <td>${esc(entry.action)}</td>
        <td>${esc(entry.resource_type)}${entry.resource_id ? '/' + esc(entry.resource_id.slice(0,8)) : ''}</td>
        <td><span class="badge badge-${entry.result === 'success' ? 'success' : 'danger'}">${esc(entry.result)}</span></td>
      `;
      tbody.appendChild(tr);
    }
  } catch {
    toast('שגיאה בטעינת יומן', 'error');
  }
}

// ─── Theme ──────────────────────────────────────────────────
function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('one_theme', next);
}

// ─── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  const savedTheme = localStorage.getItem('one_theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  // Login form
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email').value;
    const password = $('#login-password').value;
    try {
      const res = await api('/auth/login', { method: 'POST', body: { email, password } });
      token = res.data.token;
      localStorage.setItem('one_token', token);
      currentUser = res.data.user;
      $('#user-name').textContent = currentUser.name;
      toast('התחברת בהצלחה', 'success');
      showApp();
    } catch {
      // login failed — toast already shown by api()
    }
  });

  // Navigation
  $$('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });

  // Menu toggle (mobile)
  $('#menu-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  // Theme toggle
  $('#theme-toggle').addEventListener('click', toggleTheme);

  // Logout
  $('#logout-btn').addEventListener('click', () => {
    token = null;
    currentUser = null;
    localStorage.removeItem('one_token');
    showLogin();
  });

  // Modal close
  $('.modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('#modal-overlay')) closeModal();
  });

  // Auto-login if token exists
  if (token) {
    currentUser = { name: 'מנהל', email: '' };
    $('#user-name').textContent = currentUser.name;
    showApp();
  } else {
    showLogin();
  }
});
