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

const ROLE_LABELS = {
  platform_admin: 'מנהל פלטפורמה',
  tenant_admin: 'מנהל דייר',
  org_admin: 'מנהל ארגון',
  manager: 'מנהל',
  user: 'משתמש',
  viewer: 'צופה',
};

// ─── State ──────────────────────────────────────────────────
let currentUser = null;
let currentView = 'dashboard';
let token = localStorage.getItem('one_token') || null;
let orgsCache = [];

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

function confirm(msg) {
  return window.confirm(msg);
}

function orgOptions(selectedId) {
  let html = '<option value="">— ללא —</option>';
  for (const o of orgsCache) {
    html += `<option value="${esc(o.id)}" ${o.id === selectedId ? 'selected' : ''}>${esc(o.name)}</option>`;
  }
  return html;
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
  refreshOrgsCache();
  loadDashboard();
}

async function refreshOrgsCache() {
  try {
    const res = await api('/tenants/current/organizations');
    orgsCache = res.data || [];
  } catch { orgsCache = []; }
}

// ─── Navigation ─────────────────────────────────────────────
function switchView(viewName) {
  currentView = viewName;

  $$('.view').forEach(v => { v.hidden = true; v.classList.remove('active'); });
  const target = $(`#view-${viewName}`);
  if (target) { target.hidden = false; target.classList.add('active'); }

  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.view === viewName));

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
    const [users, orgs, audit, config] = await Promise.all([
      api('/identity/users?per_page=1'),
      api('/tenants/current/organizations'),
      api('/audit?per_page=1'),
      api('/configuration'),
    ]);
    $('#stat-users').textContent = users.meta?.total ?? '—';
    $('#stat-orgs').textContent = orgs.data?.length ?? '—';
    $('#stat-events').textContent = audit.data?.length ? audit.meta?.per_page : '0';
    $('#stat-active').textContent = config.data?.length ?? '0';
  } catch {
    // non-critical
  }
}

// ═══════════════════════════════════════════════════════════
//   USERS — Full CRUD
// ═══════════════════════════════════════════════════════════
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
        <td><span class="badge badge-info">${esc(ROLE_LABELS[u.role] || u.role)}</span></td>
        <td>${esc(u.org_name || '—')}</td>
        <td>${u.active ? '<span class="badge badge-success">פעיל</span>' : '<span class="badge badge-danger">לא פעיל</span>'}</td>
        <td class="actions-cell">
          <button class="btn-sm btn-edit" data-id="${esc(u.id)}">עריכה</button>
          ${u.active ? `<button class="btn-sm btn-danger-sm" data-id="${esc(u.id)}">השבתה</button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    }

    // Bind edit buttons
    $$('.btn-edit', $('#users-table')).forEach(btn => {
      btn.addEventListener('click', () => showEditUserModal(btn.dataset.id));
    });
    $$('.btn-danger-sm', $('#users-table')).forEach(btn => {
      btn.addEventListener('click', () => deactivateUser(btn.dataset.id));
    });
  } catch {
    toast('שגיאה בטעינת משתמשים', 'error');
  }
}

function showAddUserModal() {
  openModal('משתמש חדש', `
    <form id="user-form" class="modal-form">
      <div class="form-group">
        <label for="f-name">שם</label>
        <input type="text" id="f-name" required placeholder="ישראל ישראלי">
      </div>
      <div class="form-group">
        <label for="f-email">אימייל</label>
        <input type="email" id="f-email" required placeholder="user@example.com">
      </div>
      <div class="form-group">
        <label for="f-password">סיסמה</label>
        <input type="password" id="f-password" placeholder="להשאיר ריק אם לא נדרש">
      </div>
      <div class="form-group">
        <label for="f-role">תפקיד</label>
        <select id="f-role">
          <option value="user">משתמש</option>
          <option value="viewer">צופה</option>
          <option value="manager">מנהל</option>
          <option value="org_admin">מנהל ארגון</option>
          <option value="tenant_admin">מנהל דייר</option>
        </select>
      </div>
      <div class="form-group">
        <label for="f-org">ארגון</label>
        <select id="f-org">${orgOptions('')}</select>
      </div>
      <button type="submit" class="btn btn-primary btn-block">יצירה</button>
    </form>
  `);
  $('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: $('#f-name').value.trim(),
      email: $('#f-email').value.trim(),
      role: $('#f-role').value,
      org_id: $('#f-org').value || undefined,
      password: $('#f-password').value || undefined,
    };
    if (!body.name || !body.email) return;
    try {
      await api('/identity/users', { method: 'POST', body });
      toast('המשתמש נוצר בהצלחה', 'success');
      closeModal();
      loadUsers();
      loadDashboard();
    } catch { /* toast shown */ }
  });
}

async function showEditUserModal(userId) {
  try {
    const res = await api(`/identity/users/${userId}`);
    const u = res.data;
    openModal('עריכת משתמש', `
      <form id="user-form" class="modal-form">
        <div class="form-group">
          <label for="f-name">שם</label>
          <input type="text" id="f-name" required value="${esc(u.name)}">
        </div>
        <div class="form-group">
          <label>אימייל</label>
          <input type="email" value="${esc(u.email)}" disabled style="opacity:.6">
        </div>
        <div class="form-group">
          <label for="f-password">סיסמה חדשה</label>
          <input type="password" id="f-password" placeholder="להשאיר ריק ללא שינוי">
        </div>
        <div class="form-group">
          <label for="f-role">תפקיד</label>
          <select id="f-role">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>משתמש</option>
            <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>צופה</option>
            <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>מנהל</option>
            <option value="org_admin" ${u.role === 'org_admin' ? 'selected' : ''}>מנהל ארגון</option>
            <option value="tenant_admin" ${u.role === 'tenant_admin' ? 'selected' : ''}>מנהל דייר</option>
            <option value="platform_admin" ${u.role === 'platform_admin' ? 'selected' : ''}>מנהל פלטפורמה</option>
          </select>
        </div>
        <div class="form-group">
          <label for="f-org">ארגון</label>
          <select id="f-org">${orgOptions(u.org_id || '')}</select>
        </div>
        <button type="submit" class="btn btn-primary btn-block">שמירה</button>
      </form>
    `);
    $('#user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: $('#f-name').value.trim(),
        role: $('#f-role').value,
        org_id: $('#f-org').value || null,
      };
      const pw = $('#f-password').value;
      if (pw) body.password = pw;
      try {
        await api(`/identity/users/${userId}`, { method: 'PUT', body });
        toast('המשתמש עודכן בהצלחה', 'success');
        closeModal();
        loadUsers();
      } catch { /* toast shown */ }
    });
  } catch { /* toast shown */ }
}

async function deactivateUser(userId) {
  if (!confirm('להשבית משתמש זה?')) return;
  try {
    await api(`/identity/users/${userId}`, { method: 'DELETE' });
    toast('המשתמש הושבת', 'success');
    loadUsers();
    loadDashboard();
  } catch { /* toast shown */ }
}

// ═══════════════════════════════════════════════════════════
//   ORGANIZATIONS — Full CRUD
// ═══════════════════════════════════════════════════════════
async function loadOrganizations() {
  try {
    const res = await api('/tenants/current/organizations');
    orgsCache = res.data || [];
    const container = $('#org-list');
    container.innerHTML = '';
    for (const org of res.data || []) {
      const card = document.createElement('div');
      card.className = 'stat-card org-card';
      card.innerHTML = `
        <div class="stat-value" style="font-size:1.2rem">${esc(org.name)}</div>
        <div class="stat-label">${org.parent_id ? 'תת-ארגון' : 'ארגון ראשי'}</div>
        <div class="stat-label" style="margin-top:.25rem">${org.member_count || 0} חברים</div>
        <div class="card-actions">
          <button class="btn-sm btn-edit" data-id="${esc(org.id)}" data-name="${esc(org.name)}">עריכה</button>
          <button class="btn-sm btn-danger-sm" data-id="${esc(org.id)}">מחיקה</button>
        </div>
      `;
      container.appendChild(card);
    }
    if (!res.data?.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">אין ארגונים עדיין</p>';
    }

    $$('.org-card .btn-edit').forEach(btn => {
      btn.addEventListener('click', () => showEditOrgModal(btn.dataset.id, btn.dataset.name));
    });
    $$('.org-card .btn-danger-sm').forEach(btn => {
      btn.addEventListener('click', () => deleteOrganization(btn.dataset.id));
    });
  } catch {
    toast('שגיאה בטעינת ארגונים', 'error');
  }
}

function showAddOrgModal() {
  openModal('ארגון חדש', `
    <form id="org-form" class="modal-form">
      <div class="form-group">
        <label for="f-org-name">שם הארגון</label>
        <input type="text" id="f-org-name" required placeholder="לדוגמה: מחלקת משאבי אנוש">
      </div>
      <div class="form-group">
        <label for="f-org-parent">ארגון אב</label>
        <select id="f-org-parent">${orgOptions('')}</select>
      </div>
      <button type="submit" class="btn btn-primary btn-block">יצירה</button>
    </form>
  `);
  $('#org-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#f-org-name').value.trim();
    const parent_id = $('#f-org-parent').value || undefined;
    if (!name) return;
    try {
      await api('/tenants/current/organizations', { method: 'POST', body: { name, parent_id } });
      toast('הארגון נוצר בהצלחה', 'success');
      closeModal();
      refreshOrgsCache();
      loadOrganizations();
      loadDashboard();
    } catch { /* toast shown */ }
  });
}

function showEditOrgModal(orgId, orgName) {
  openModal('עריכת ארגון', `
    <form id="org-form" class="modal-form">
      <div class="form-group">
        <label for="f-org-name">שם הארגון</label>
        <input type="text" id="f-org-name" required value="${esc(orgName)}">
      </div>
      <button type="submit" class="btn btn-primary btn-block">שמירה</button>
    </form>
  `);
  $('#org-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#f-org-name').value.trim();
    if (!name) return;
    try {
      await api(`/tenants/current/organizations/${orgId}`, { method: 'PUT', body: { name } });
      toast('הארגון עודכן בהצלחה', 'success');
      closeModal();
      refreshOrgsCache();
      loadOrganizations();
    } catch { /* toast shown */ }
  });
}

async function deleteOrganization(orgId) {
  if (!confirm('למחוק ארגון זה? משתמשים ששויכו אליו יוסרו מהארגון.')) return;
  try {
    await api(`/tenants/current/organizations/${orgId}`, { method: 'DELETE' });
    toast('הארגון נמחק', 'success');
    refreshOrgsCache();
    loadOrganizations();
    loadDashboard();
  } catch { /* toast shown */ }
}

// ═══════════════════════════════════════════════════════════
//   CONFIGURATION — Full CRUD
// ═══════════════════════════════════════════════════════════
async function loadConfiguration() {
  try {
    const res = await api('/configuration');
    const container = $('#config-list');
    container.innerHTML = '';
    for (const cfg of res.data || []) {
      const div = document.createElement('div');
      div.className = 'stat-card config-card';
      div.style.textAlign = 'start';
      const displayVal = typeof cfg.value === 'string' ? cfg.value : JSON.stringify(cfg.value);
      div.innerHTML = `
        <strong>${esc(cfg.key)}</strong>
        <div style="color:var(--text-secondary);font-size:.85rem;margin-top:.25rem">${esc(displayVal)}</div>
        <div style="color:var(--text-muted);font-size:.75rem;margin-top:.25rem">scope: ${esc(cfg.scope)}</div>
        <div class="card-actions">
          <button class="btn-sm btn-edit" data-id="${esc(cfg.id)}" data-key="${esc(cfg.key)}" data-value="${esc(displayVal)}" data-scope="${esc(cfg.scope)}">עריכה</button>
          <button class="btn-sm btn-danger-sm" data-id="${esc(cfg.id)}">מחיקה</button>
        </div>
      `;
      container.appendChild(div);
    }
    if (!res.data?.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">אין הגדרות עדיין</p>';
    }

    $$('.config-card .btn-edit').forEach(btn => {
      btn.addEventListener('click', () => showEditConfigModal(btn.dataset.key, btn.dataset.value, btn.dataset.scope));
    });
    $$('.config-card .btn-danger-sm').forEach(btn => {
      btn.addEventListener('click', () => deleteConfig(btn.dataset.id));
    });
  } catch {
    toast('שגיאה בטעינת הגדרות', 'error');
  }
}

function showAddConfigModal() {
  openModal('הגדרה חדשה', `
    <form id="config-form" class="modal-form">
      <div class="form-group">
        <label for="f-cfg-key">מפתח</label>
        <input type="text" id="f-cfg-key" required placeholder="app.feature.enabled">
      </div>
      <div class="form-group">
        <label for="f-cfg-value">ערך</label>
        <input type="text" id="f-cfg-value" required placeholder="true / text / JSON">
      </div>
      <div class="form-group">
        <label for="f-cfg-scope">Scope</label>
        <select id="f-cfg-scope">
          <option value="tenant">Tenant</option>
          <option value="platform">Platform</option>
          <option value="organization">Organization</option>
          <option value="module">Module</option>
          <option value="user">User</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary btn-block">יצירה</button>
    </form>
  `);
  $('#config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = $('#f-cfg-key').value.trim();
    let value = $('#f-cfg-value').value.trim();
    const scope = $('#f-cfg-scope').value;
    if (!key) return;
    try { value = JSON.parse(value); } catch { /* keep as string */ }
    try {
      await api('/configuration', { method: 'PUT', body: { key, value, scope } });
      toast('ההגדרה נשמרה', 'success');
      closeModal();
      loadConfiguration();
    } catch { /* toast shown */ }
  });
}

function showEditConfigModal(key, value, scope) {
  openModal('עריכת הגדרה', `
    <form id="config-form" class="modal-form">
      <div class="form-group">
        <label>מפתח</label>
        <input type="text" value="${esc(key)}" disabled style="opacity:.6">
      </div>
      <div class="form-group">
        <label for="f-cfg-value">ערך</label>
        <input type="text" id="f-cfg-value" required value="${esc(value)}">
      </div>
      <div class="form-group">
        <label>Scope</label>
        <input type="text" value="${esc(scope)}" disabled style="opacity:.6">
      </div>
      <button type="submit" class="btn btn-primary btn-block">שמירה</button>
    </form>
  `);
  $('#config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let val = $('#f-cfg-value').value.trim();
    try { val = JSON.parse(val); } catch { /* keep as string */ }
    try {
      await api(`/configuration/${encodeURIComponent(key)}`, { method: 'PUT', body: { value: val, scope } });
      toast('ההגדרה עודכנה', 'success');
      closeModal();
      loadConfiguration();
    } catch { /* toast shown */ }
  });
}

async function deleteConfig(configId) {
  if (!confirm('למחוק הגדרה זו?')) return;
  try {
    await api(`/configuration/${configId}`, { method: 'DELETE' });
    toast('ההגדרה נמחקה', 'success');
    loadConfiguration();
  } catch { /* toast shown */ }
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
    if (!res.data?.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">אין רשומות ביומן</td></tr>';
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

  // Add buttons
  $('#add-org-btn').addEventListener('click', showAddOrgModal);
  $('#add-user-btn').addEventListener('click', showAddUserModal);
  $('#add-config-btn').addEventListener('click', showAddConfigModal);

  // Modal close
  $('.modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('#modal-overlay')) closeModal();
  });

  // Auto-login if token exists and is valid JWT
  if (token && token.split('.').length === 3) {
    try {
      const raw = atob(token.split('.')[1]);
      const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      currentUser = { name: payload.name || payload.email || 'מנהל', email: payload.email || '' };
      $('#user-name').textContent = currentUser.name;
      showApp();
    } catch {
      token = null;
      localStorage.removeItem('one_token');
      showLogin();
    }
  } else {
    token = null;
    localStorage.removeItem('one_token');
    showLogin();
  }
});
