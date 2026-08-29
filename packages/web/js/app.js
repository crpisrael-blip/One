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
    case 'permissions': loadPermissions(); break;
    case 'workflows': loadWorkflowDefinitions(); break;
    case 'notifications': loadNotifTemplates(); break;
    case 'documents': loadDocuments(); break;
    case 'commercial': loadPackages(); break;
    case 'rules': loadRules(); break;
    case 'events': loadEvents(); break;
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

// ═══════════════════════════════════════════════════════════
//   PERMISSIONS — CRUD
// ═══════════════════════════════════════════════════════════
async function loadPermissions(subjectId) {
  try {
    const sid = subjectId || currentUser?.id;
    if (!sid) {
      const me = await api('/identity/me');
      currentUser = { ...currentUser, id: me.data?.id };
      if (!me.data?.id) { toast('לא ניתן לזהות משתמש', 'error'); return; }
    }
    const searchId = subjectId || currentUser.id;
    const res = await api(`/authorization/permissions?subject_id=${encodeURIComponent(searchId)}`);
    const tbody = $('#permissions-table tbody');
    tbody.innerHTML = '';
    for (const p of res.data || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(p.subject_id?.slice(0,8) || '—')}</td>
        <td><span class="badge badge-info">${esc(p.subject_type || '—')}</span></td>
        <td>${esc(p.action)}</td>
        <td>${esc(p.resource_type)}${p.resource_id ? '/' + esc(p.resource_id.slice(0,8)) : ''}</td>
        <td><span class="badge ${p.effect === 'allow' ? 'badge-success' : 'badge-danger'}">${p.effect === 'allow' ? 'אישור' : 'דחייה'}</span></td>
        <td class="actions-cell">
          <button class="btn-sm btn-danger-sm" data-id="${esc(p.id)}">מחיקה</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    if (!res.data?.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">אין הרשאות</td></tr>';
    }
    $$('#permissions-table .btn-danger-sm').forEach(btn => {
      btn.addEventListener('click', () => deletePermission(btn.dataset.id));
    });
  } catch { toast('שגיאה בטעינת הרשאות', 'error'); }
}

function showAddPermissionModal() {
  openModal('הרשאה חדשה', `
    <form id="perm-form" class="modal-form">
      <div class="form-group">
        <label for="f-perm-stype">סוג נושא</label>
        <select id="f-perm-stype">
          <option value="user">משתמש</option>
          <option value="role">תפקיד</option>
          <option value="group">קבוצה</option>
        </select>
      </div>
      <div class="form-group">
        <label for="f-perm-sid">מזהה נושא</label>
        <input type="text" id="f-perm-sid" required placeholder="מזהה משתמש / שם תפקיד">
      </div>
      <div class="form-group">
        <label for="f-perm-action">פעולה</label>
        <input type="text" id="f-perm-action" required placeholder="read / write / delete">
      </div>
      <div class="form-group">
        <label for="f-perm-rtype">סוג משאב</label>
        <input type="text" id="f-perm-rtype" required placeholder="users / documents / ...">
      </div>
      <div class="form-group">
        <label for="f-perm-rid">מזהה משאב (אופציונלי)</label>
        <input type="text" id="f-perm-rid" placeholder="ריק = כל המשאבים מסוג זה">
      </div>
      <div class="form-group">
        <label for="f-perm-effect">אפקט</label>
        <select id="f-perm-effect">
          <option value="allow">אישור</option>
          <option value="deny">דחייה</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary btn-block">יצירה</button>
    </form>
  `);
  $('#perm-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      subject_type: $('#f-perm-stype').value,
      subject_id: $('#f-perm-sid').value.trim(),
      action: $('#f-perm-action').value.trim(),
      resource_type: $('#f-perm-rtype').value.trim(),
      resource_id: $('#f-perm-rid').value.trim() || undefined,
      effect: $('#f-perm-effect').value,
    };
    if (!body.subject_id || !body.action || !body.resource_type) return;
    try {
      await api('/authorization/permissions', { method: 'POST', body });
      toast('ההרשאה נוצרה בהצלחה', 'success');
      closeModal();
      loadPermissions();
    } catch { /* toast shown */ }
  });
}

async function deletePermission(permId) {
  if (!confirm('למחוק הרשאה זו?')) return;
  try {
    await api(`/authorization/permissions/${permId}`, { method: 'DELETE' });
    toast('ההרשאה נמחקה', 'success');
    loadPermissions();
  } catch { /* toast shown */ }
}

// ═══════════════════════════════════════════════════════════
//   WORKFLOWS — Definitions & Instances
// ═══════════════════════════════════════════════════════════
let wfTab = 'definitions';

async function loadWorkflowDefinitions() {
  try {
    const res = await api('/workflows/definitions');
    const container = $('#wf-definitions');
    container.innerHTML = '';
    for (const wf of res.data || []) {
      const states = Array.isArray(wf.states) ? wf.states : [];
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div class="stat-value" style="font-size:1.1rem">${esc(wf.name)}</div>
        <div class="stat-label">גרסה ${wf.version} · ${states.length} מצבים</div>
        <div class="stat-label">${wf.active ? '<span class="badge badge-success">פעיל</span>' : '<span class="badge badge-danger">לא פעיל</span>'}</div>
        <div class="card-actions">
          <button class="btn-sm btn-edit" data-id="${esc(wf.id)}">עריכה</button>
          <button class="btn-sm" data-id="${esc(wf.id)}" data-action="start">הפעלה</button>
          <button class="btn-sm btn-danger-sm" data-id="${esc(wf.id)}">מחיקה</button>
        </div>
      `;
      container.appendChild(card);
    }
    if (!res.data?.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">אין תהליכים מוגדרים</p>';
    }
    $$('#wf-definitions .btn-edit').forEach(btn => {
      btn.addEventListener('click', () => showEditWorkflowModal(btn.dataset.id));
    });
    $$('#wf-definitions [data-action="start"]').forEach(btn => {
      btn.addEventListener('click', () => showStartWorkflowModal(btn.dataset.id));
    });
    $$('#wf-definitions .btn-danger-sm').forEach(btn => {
      btn.addEventListener('click', () => deleteWorkflowDef(btn.dataset.id));
    });
  } catch { toast('שגיאה בטעינת תהליכים', 'error'); }
}

async function loadWorkflowInstances() {
  try {
    const res = await api('/workflows/instances');
    const tbody = $('#instances-table tbody');
    tbody.innerHTML = '';
    for (const inst of res.data || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(inst.workflow_name || inst.definition_id?.slice(0,8))}</td>
        <td>${esc(inst.entity_type)}/${esc(inst.entity_id?.slice(0,8))}</td>
        <td><span class="badge badge-info">${esc(inst.current_state)}</span></td>
        <td style="font-size:.8rem">${new Date(inst.updated_at).toLocaleString('he-IL')}</td>
        <td class="actions-cell">
          <button class="btn-sm" data-id="${esc(inst.id)}" data-defid="${esc(inst.definition_id)}">מעבר</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    if (!res.data?.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">אין מופעים פעילים</td></tr>';
    }
    $$('#instances-table [data-id]').forEach(btn => {
      btn.addEventListener('click', () => showTransitionModal(btn.dataset.id));
    });
  } catch { toast('שגיאה בטעינת מופעים', 'error'); }
}

function showAddWorkflowModal() {
  openModal('תהליך חדש', `
    <form id="wf-form" class="modal-form">
      <div class="form-group">
        <label for="f-wf-name">שם התהליך</label>
        <input type="text" id="f-wf-name" required placeholder="לדוגמה: אישור מסמך">
      </div>
      <div class="form-group">
        <label for="f-wf-states">מצבים (JSON)</label>
        <textarea id="f-wf-states" rows="4" style="width:100%;padding:.6rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);color:var(--text);font-family:monospace;font-size:.85rem">[{"name":"draft","type":"initial"},{"name":"review","type":"normal"},{"name":"approved","type":"final"}]</textarea>
      </div>
      <div class="form-group">
        <label for="f-wf-trans">מעברים (JSON)</label>
        <textarea id="f-wf-trans" rows="3" style="width:100%;padding:.6rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);color:var(--text);font-family:monospace;font-size:.85rem">[{"from":"draft","to":"review","action":"submit"},{"from":"review","to":"approved","action":"approve"}]</textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-block">יצירה</button>
    </form>
  `);
  $('#wf-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#f-wf-name').value.trim();
    let states, transitions;
    try { states = JSON.parse($('#f-wf-states').value); } catch { toast('JSON מצבים לא תקין', 'error'); return; }
    try { transitions = JSON.parse($('#f-wf-trans').value); } catch { toast('JSON מעברים לא תקין', 'error'); return; }
    try {
      await api('/workflows/definitions', { method: 'POST', body: { name, states, transitions } });
      toast('התהליך נוצר בהצלחה', 'success');
      closeModal();
      loadWorkflowDefinitions();
    } catch { /* toast shown */ }
  });
}

async function showEditWorkflowModal(defId) {
  try {
    const res = await api('/workflows/definitions');
    const wf = (res.data || []).find(d => d.id === defId);
    if (!wf) { toast('תהליך לא נמצא', 'error'); return; }
    openModal('עריכת תהליך', `
      <form id="wf-form" class="modal-form">
        <div class="form-group">
          <label for="f-wf-name">שם</label>
          <input type="text" id="f-wf-name" required value="${esc(wf.name)}">
        </div>
        <div class="form-group">
          <label>פעיל</label>
          <select id="f-wf-active">
            <option value="1" ${wf.active ? 'selected' : ''}>כן</option>
            <option value="0" ${!wf.active ? 'selected' : ''}>לא</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-block">שמירה</button>
      </form>
    `);
    $('#wf-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { name: $('#f-wf-name').value.trim(), active: $('#f-wf-active').value === '1' };
      try {
        await api(`/workflows/definitions/${defId}`, { method: 'PUT', body });
        toast('התהליך עודכן', 'success');
        closeModal();
        loadWorkflowDefinitions();
      } catch { /* toast shown */ }
    });
  } catch { /* toast shown */ }
}

function showStartWorkflowModal(defId) {
  openModal('הפעלת תהליך', `
    <form id="wf-start-form" class="modal-form">
      <div class="form-group">
        <label for="f-wf-etype">סוג ישות</label>
        <input type="text" id="f-wf-etype" required placeholder="document / patient / order">
      </div>
      <div class="form-group">
        <label for="f-wf-eid">מזהה ישות</label>
        <input type="text" id="f-wf-eid" required placeholder="מזהה הפריט">
      </div>
      <button type="submit" class="btn btn-primary btn-block">התחל</button>
    </form>
  `);
  $('#wf-start-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      definition_id: defId,
      entity_type: $('#f-wf-etype').value.trim(),
      entity_id: $('#f-wf-eid').value.trim(),
    };
    try {
      await api('/workflows/instances', { method: 'POST', body });
      toast('התהליך הופעל', 'success');
      closeModal();
      switchWfTab('instances');
    } catch { /* toast shown */ }
  });
}

function showTransitionModal(instanceId) {
  openModal('מעבר מצב', `
    <form id="wf-trans-form" class="modal-form">
      <div class="form-group">
        <label for="f-wf-action">פעולה</label>
        <input type="text" id="f-wf-action" required placeholder="submit / approve / reject">
      </div>
      <button type="submit" class="btn btn-primary btn-block">בצע</button>
    </form>
  `);
  $('#wf-trans-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const action = $('#f-wf-action').value.trim();
    try {
      const res = await api(`/workflows/instances/${instanceId}/transition`, { method: 'POST', body: { action } });
      toast(`מעבר ל-${res.data.current_state}`, 'success');
      closeModal();
      loadWorkflowInstances();
    } catch { /* toast shown */ }
  });
}

async function deleteWorkflowDef(defId) {
  if (!confirm('למחוק תהליך זה?')) return;
  try {
    await api(`/workflows/definitions/${defId}`, { method: 'DELETE' });
    toast('התהליך נמחק', 'success');
    loadWorkflowDefinitions();
  } catch { /* toast shown */ }
}

function switchWfTab(tab) {
  wfTab = tab;
  $$('.wf-tab').forEach(b => b.className = `btn ${b.dataset.tab === tab ? 'btn-primary' : 'btn-ghost'} wf-tab`);
  $('#wf-definitions').hidden = tab !== 'definitions';
  $('#wf-instances').hidden = tab !== 'instances';
  if (tab === 'definitions') loadWorkflowDefinitions();
  else loadWorkflowInstances();
}

// ═══════════════════════════════════════════════════════════
//   NOTIFICATIONS — Templates & Inbox
// ═══════════════════════════════════════════════════════════
let notifTab = 'templates';

async function loadNotifTemplates() {
  try {
    const res = await api('/notifications/templates');
    const container = $('#notif-templates');
    container.innerHTML = '';
    for (const t of res.data || []) {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div class="stat-value" style="font-size:1.1rem">${esc(t.name)}</div>
        <div class="stat-label"><span class="badge badge-info">${esc(t.channel)}</span></div>
        <div class="stat-label" style="margin-top:.25rem">${t.active ? '<span class="badge badge-success">פעיל</span>' : '<span class="badge badge-danger">לא פעיל</span>'}</div>
        <div class="card-actions">
          <button class="btn-sm btn-edit" data-id="${esc(t.id)}" data-name="${esc(t.name)}" data-subject="${esc(t.subject || '')}" data-body="${esc(t.body || '')}">עריכה</button>
          <button class="btn-sm btn-danger-sm" data-id="${esc(t.id)}">מחיקה</button>
        </div>
      `;
      container.appendChild(card);
    }
    if (!res.data?.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">אין תבניות התראה</p>';
    }
    $$('#notif-templates .btn-edit').forEach(btn => {
      btn.addEventListener('click', () => showEditNotifTemplateModal(btn.dataset.id, btn.dataset.name, btn.dataset.subject, btn.dataset.body));
    });
    $$('#notif-templates .btn-danger-sm').forEach(btn => {
      btn.addEventListener('click', () => deleteNotifTemplate(btn.dataset.id));
    });
  } catch { toast('שגיאה בטעינת תבניות', 'error'); }
}

async function loadNotifInbox() {
  try {
    const res = await api('/notifications');
    const tbody = $('#inbox-table tbody');
    tbody.innerHTML = '';
    for (const n of res.data || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(n.template_name || '—')}</td>
        <td><span class="badge badge-info">${esc(n.channel)}</span></td>
        <td><span class="badge ${n.status === 'sent' ? 'badge-success' : n.status === 'failed' ? 'badge-danger' : 'badge-warning'}">${esc(n.status)}</span></td>
        <td style="font-size:.8rem">${new Date(n.created_at).toLocaleString('he-IL')}</td>
      `;
      tbody.appendChild(tr);
    }
    if (!res.data?.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">אין התראות</td></tr>';
    }
  } catch { toast('שגיאה בטעינת התראות', 'error'); }
}

function showAddNotifTemplateModal() {
  openModal('תבנית התראה חדשה', `
    <form id="notif-form" class="modal-form">
      <div class="form-group">
        <label for="f-nt-name">שם</label>
        <input type="text" id="f-nt-name" required placeholder="אישור הזמנה">
      </div>
      <div class="form-group">
        <label for="f-nt-channel">ערוץ</label>
        <select id="f-nt-channel">
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="push">Push</option>
          <option value="in_app">In-App</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>
      <div class="form-group">
        <label for="f-nt-subject">נושא (אופציונלי)</label>
        <input type="text" id="f-nt-subject" placeholder="נושא ההתראה">
      </div>
      <div class="form-group">
        <label for="f-nt-body">תוכן</label>
        <textarea id="f-nt-body" rows="4" required style="width:100%;padding:.6rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);color:var(--text)" placeholder="שלום {{name}}, ההזמנה שלך אושרה."></textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-block">יצירה</button>
    </form>
  `);
  $('#notif-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: $('#f-nt-name').value.trim(),
      channel: $('#f-nt-channel').value,
      subject: $('#f-nt-subject').value.trim() || undefined,
      body: $('#f-nt-body').value.trim(),
    };
    if (!body.name || !body.body) return;
    try {
      await api('/notifications/templates', { method: 'POST', body });
      toast('התבנית נוצרה בהצלחה', 'success');
      closeModal();
      loadNotifTemplates();
    } catch { /* toast shown */ }
  });
}

function showEditNotifTemplateModal(id, name, subject, bodyText) {
  openModal('עריכת תבנית', `
    <form id="notif-form" class="modal-form">
      <div class="form-group">
        <label for="f-nt-name">שם</label>
        <input type="text" id="f-nt-name" required value="${esc(name)}">
      </div>
      <div class="form-group">
        <label for="f-nt-subject">נושא</label>
        <input type="text" id="f-nt-subject" value="${esc(subject)}">
      </div>
      <div class="form-group">
        <label for="f-nt-body">תוכן</label>
        <textarea id="f-nt-body" rows="4" required style="width:100%;padding:.6rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);color:var(--text)">${esc(bodyText)}</textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-block">שמירה</button>
    </form>
  `);
  $('#notif-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: $('#f-nt-name').value.trim(),
      subject: $('#f-nt-subject').value.trim(),
      body: $('#f-nt-body').value.trim(),
    };
    try {
      await api(`/notifications/templates/${id}`, { method: 'PUT', body });
      toast('התבנית עודכנה', 'success');
      closeModal();
      loadNotifTemplates();
    } catch { /* toast shown */ }
  });
}

async function deleteNotifTemplate(id) {
  if (!confirm('למחוק תבנית זו?')) return;
  try {
    await api(`/notifications/templates/${id}`, { method: 'DELETE' });
    toast('התבנית נמחקה', 'success');
    loadNotifTemplates();
  } catch { /* toast shown */ }
}

function switchNotifTab(tab) {
  notifTab = tab;
  $$('.notif-tab').forEach(b => b.className = `btn ${b.dataset.tab === tab ? 'btn-primary' : 'btn-ghost'} notif-tab`);
  $('#notif-templates').hidden = tab !== 'templates';
  $('#notif-inbox').hidden = tab !== 'inbox';
  if (tab === 'templates') loadNotifTemplates();
  else loadNotifInbox();
}

// ═══════════════════════════════════════════════════════════
//   EVENTS — Read only
// ═══════════════════════════════════════════════════════════
async function loadEvents() {
  try {
    const res = await api('/events');
    const tbody = $('#events-table tbody');
    tbody.innerHTML = '';
    for (const ev of res.data || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge badge-info">${esc(ev.type)}</span></td>
        <td>${esc(ev.resource_type)}/${esc(ev.resource_id?.slice(0,8) || '—')}</td>
        <td>${esc(ev.actor_id?.slice(0,8) || '—')}</td>
        <td style="font-size:.8rem">${new Date(ev.created_at).toLocaleString('he-IL')}</td>
      `;
      tbody.appendChild(tr);
    }
    if (!res.data?.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">אין אירועים</td></tr>';
    }
  } catch { toast('שגיאה בטעינת אירועים', 'error'); }
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

// ═══════════════════════════════════════════════════════════
//   DOCUMENTS
// ═══════════════════════════════════════════════════════════
async function loadDocuments() {
  try {
    const res = await api('/documents');
    const tbody = $('#documents-table tbody');
    tbody.innerHTML = '';
    for (const doc of res.data || []) {
      const tr = document.createElement('tr');
      const updated = doc.updated_at ? new Date(doc.updated_at).toLocaleString('he-IL') : '—';
      tr.innerHTML = `
        <td>${esc(doc.name)}</td>
        <td><span class="badge">${esc(doc.type)}</span></td>
        <td>${doc.entity_type ? esc(doc.entity_type) + (doc.entity_id ? '/' + esc(doc.entity_id.slice(0,8)) : '') : '—'}</td>
        <td>${doc.file_count ?? 0}</td>
        <td style="font-size:.8rem">${esc(updated)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="showEditDocumentModal('${esc(doc.id)}')">עריכה</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteDocument('${esc(doc.id)}')">מחיקה</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    if (!res.data?.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">אין מסמכים</td></tr>';
    }
  } catch { toast('שגיאה בטעינת מסמכים', 'error'); }
}

function showAddDocumentModal() {
  openModal('מסמך חדש', `
    <form id="doc-form">
      <div class="form-group"><label>שם</label><input name="name" required></div>
      <div class="form-group"><label>סוג</label><input name="type" required placeholder="חוזה / דוח / מכתב"></div>
      <div class="form-group"><label>סוג ישות (אופציונלי)</label><input name="entity_type" placeholder="user / org"></div>
      <div class="form-group"><label>מזהה ישות (אופציונלי)</label><input name="entity_id"></div>
      <button type="submit" class="btn btn-primary btn-block">יצירה</button>
    </form>
  `);
  $('#doc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/documents', { method: 'POST', body: {
      name: fd.get('name'), type: fd.get('type'),
      entity_type: fd.get('entity_type') || undefined, entity_id: fd.get('entity_id') || undefined,
    }});
    closeModal(); toast('מסמך נוצר', 'success'); loadDocuments();
  });
}

async function showEditDocumentModal(id) {
  const res = await api(`/documents/${id}`);
  const doc = res.data;
  openModal('עריכת מסמך', `
    <form id="edit-doc-form">
      <div class="form-group"><label>שם</label><input name="name" value="${esc(doc.name)}"></div>
      <div class="form-group"><label>סוג</label><input name="type" value="${esc(doc.type)}"></div>
      <button type="submit" class="btn btn-primary btn-block">שמירה</button>
    </form>
  `);
  $('#edit-doc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api(`/documents/${id}`, { method: 'PUT', body: { name: fd.get('name'), type: fd.get('type') } });
    closeModal(); toast('מסמך עודכן', 'success'); loadDocuments();
  });
}

async function deleteDocument(id) {
  if (!confirm('למחוק את המסמך?')) return;
  await api(`/documents/${id}`, { method: 'DELETE' });
  toast('מסמך נמחק', 'success'); loadDocuments();
}

// ═══════════════════════════════════════════════════════════
//   COMMERCIAL — Packages / Subscriptions / Entitlements
// ═══════════════════════════════════════════════════════════
function switchCommTab(tab) {
  $$('.comm-tab').forEach(b => b.className = `btn ${b.dataset.tab === tab ? 'btn-primary' : 'btn-ghost'} comm-tab`);
  $('#comm-packages').hidden = tab !== 'packages';
  $('#comm-subscriptions').hidden = tab !== 'subscriptions';
  $('#comm-entitlements').hidden = tab !== 'entitlements';
  if (tab === 'packages') loadPackages();
  else if (tab === 'subscriptions') loadSubscriptions();
  else loadEntitlements();
}

async function loadPackages() {
  try {
    const res = await api('/commercial/packages');
    const grid = $('#comm-packages');
    grid.innerHTML = '';
    for (const pkg of res.data || []) {
      const card = document.createElement('div');
      card.className = 'card';
      const modules = Array.isArray(pkg.modules) ? pkg.modules.join(', ') : '—';
      card.innerHTML = `
        <h3>${esc(pkg.name)} ${pkg.active ? '' : '<span class="badge badge-danger">לא פעיל</span>'}</h3>
        <p>${esc(pkg.description || '')}</p>
        <p>מודולים: ${esc(modules)}</p>
        <p>מחיר חודשי: ₪${pkg.price_monthly ?? 0} | שנתי: ₪${pkg.price_yearly ?? 0}</p>
        <div style="display:flex;gap:.5rem;margin-top:.5rem">
          <button class="btn btn-ghost btn-sm" onclick="showEditPackageModal('${esc(pkg.id)}')">עריכה</button>
          <button class="btn btn-ghost btn-sm" onclick="deletePackage('${esc(pkg.id)}')">מחיקה</button>
        </div>
      `;
      grid.appendChild(card);
    }
    if (!res.data?.length) grid.innerHTML = '<p style="text-align:center;color:var(--text-muted)">אין חבילות</p>';
  } catch { toast('שגיאה בטעינת חבילות', 'error'); }
}

function showAddPackageModal() {
  openModal('חבילה חדשה', `
    <form id="pkg-form">
      <div class="form-group"><label>שם</label><input name="name" required></div>
      <div class="form-group"><label>תיאור</label><input name="description"></div>
      <div class="form-group"><label>מודולים (מופרדים בפסיק)</label><input name="modules" placeholder="identity, workflow, documents"></div>
      <div class="form-group"><label>מחיר חודשי</label><input name="price_monthly" type="number" value="0"></div>
      <div class="form-group"><label>מחיר שנתי</label><input name="price_yearly" type="number" value="0"></div>
      <button type="submit" class="btn btn-primary btn-block">יצירה</button>
    </form>
  `);
  $('#pkg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const modules = fd.get('modules') ? fd.get('modules').split(',').map(s => s.trim()).filter(Boolean) : [];
    await api('/commercial/packages', { method: 'POST', body: {
      name: fd.get('name'), description: fd.get('description') || undefined,
      modules, price_monthly: Number(fd.get('price_monthly')), price_yearly: Number(fd.get('price_yearly')),
    }});
    closeModal(); toast('חבילה נוצרה', 'success'); loadPackages();
  });
}

async function showEditPackageModal(id) {
  const res = await api('/commercial/packages');
  const pkg = (res.data || []).find(p => p.id === id);
  if (!pkg) return toast('חבילה לא נמצאה', 'error');
  const modules = Array.isArray(pkg.modules) ? pkg.modules.join(', ') : '';
  openModal('עריכת חבילה', `
    <form id="edit-pkg-form">
      <div class="form-group"><label>שם</label><input name="name" value="${esc(pkg.name)}"></div>
      <div class="form-group"><label>תיאור</label><input name="description" value="${esc(pkg.description || '')}"></div>
      <div class="form-group"><label>מודולים</label><input name="modules" value="${esc(modules)}"></div>
      <div class="form-group"><label>מחיר חודשי</label><input name="price_monthly" type="number" value="${pkg.price_monthly ?? 0}"></div>
      <div class="form-group"><label>מחיר שנתי</label><input name="price_yearly" type="number" value="${pkg.price_yearly ?? 0}"></div>
      <div class="form-group"><label><input type="checkbox" name="active" ${pkg.active ? 'checked' : ''}> פעיל</label></div>
      <button type="submit" class="btn btn-primary btn-block">שמירה</button>
    </form>
  `);
  $('#edit-pkg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const mods = fd.get('modules') ? fd.get('modules').split(',').map(s => s.trim()).filter(Boolean) : [];
    await api(`/commercial/packages/${id}`, { method: 'PUT', body: {
      name: fd.get('name'), description: fd.get('description'),
      modules: mods, price_monthly: Number(fd.get('price_monthly')), price_yearly: Number(fd.get('price_yearly')),
      active: !!fd.get('active'),
    }});
    closeModal(); toast('חבילה עודכנה', 'success'); loadPackages();
  });
}

async function deletePackage(id) {
  if (!confirm('למחוק את החבילה? כל המנויים שלה יימחקו.')) return;
  await api(`/commercial/packages/${id}`, { method: 'DELETE' });
  toast('חבילה נמחקה', 'success'); loadPackages();
}

async function loadSubscriptions() {
  try {
    const res = await api('/commercial/subscriptions');
    const tbody = $('#subscriptions-table tbody');
    tbody.innerHTML = '';
    const statusLabels = { active: 'פעיל', trial: 'ניסיון', past_due: 'באיחור', cancelled: 'בוטל' };
    for (const sub of res.data || []) {
      const tr = document.createElement('tr');
      const badgeClass = sub.status === 'active' ? 'success' : sub.status === 'cancelled' ? 'danger' : 'warning';
      tr.innerHTML = `
        <td>${esc(sub.package_name || sub.package_id?.slice(0,8) || '—')}</td>
        <td><span class="badge badge-${badgeClass}">${esc(statusLabels[sub.status] || sub.status)}</span></td>
        <td style="font-size:.8rem">${sub.current_period_start ? esc(new Date(sub.current_period_start).toLocaleDateString('he-IL')) : '—'}</td>
        <td style="font-size:.8rem">${sub.current_period_end ? esc(new Date(sub.current_period_end).toLocaleDateString('he-IL')) : '—'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="deleteSubscription('${esc(sub.id)}')">מחיקה</button></td>
      `;
      tbody.appendChild(tr);
    }
    if (!res.data?.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">אין מנויים</td></tr>';
    }
  } catch { toast('שגיאה בטעינת מנויים', 'error'); }
}

async function deleteSubscription(id) {
  if (!confirm('למחוק את המנוי?')) return;
  await api(`/commercial/subscriptions/${id}`, { method: 'DELETE' });
  toast('מנוי נמחק', 'success'); loadSubscriptions();
}

async function loadEntitlements() {
  try {
    const res = await api('/commercial/entitlements');
    const tbody = $('#entitlements-table tbody');
    tbody.innerHTML = '';
    for (const ent of res.data || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(ent.module)}</td>
        <td>${esc(ent.feature)}</td>
        <td>${ent.lmt === -1 ? 'ללא הגבלה' : ent.lmt}</td>
        <td>${ent.usage ?? 0}</td>
        <td>${ent.enabled ? '<span class="badge badge-success">כן</span>' : '<span class="badge badge-danger">לא</span>'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="deleteEntitlement('${esc(ent.id)}')">מחיקה</button></td>
      `;
      tbody.appendChild(tr);
    }
    if (!res.data?.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">אין הרשאות שימוש</td></tr>';
    }
  } catch { toast('שגיאה בטעינת הרשאות שימוש', 'error'); }
}

async function deleteEntitlement(id) {
  if (!confirm('למחוק את הרשאת השימוש?')) return;
  await api(`/commercial/entitlements/${id}`, { method: 'DELETE' });
  toast('הרשאת שימוש נמחקה', 'success'); loadEntitlements();
}

// ═══════════════════════════════════════════════════════════
//   RULES
// ═══════════════════════════════════════════════════════════
async function loadRules() {
  try {
    const res = await api('/rules');
    const tbody = $('#rules-table tbody');
    tbody.innerHTML = '';
    for (const rule of res.data || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(rule.name)}</td>
        <td><span class="badge">${esc(rule.trigger_event || '—')}</span></td>
        <td>${rule.priority ?? 0}</td>
        <td>${rule.active ? '<span class="badge badge-success">כן</span>' : '<span class="badge badge-danger">לא</span>'}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="showEditRuleModal('${esc(rule.id)}')">עריכה</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteRule('${esc(rule.id)}')">מחיקה</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    if (!res.data?.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">אין כללים</td></tr>';
    }
  } catch { toast('שגיאה בטעינת כללים', 'error'); }
}

function showAddRuleModal() {
  openModal('כלל חדש', `
    <form id="rule-form">
      <div class="form-group"><label>שם</label><input name="name" required></div>
      <div class="form-group"><label>תיאור</label><input name="description"></div>
      <div class="form-group"><label>טריגר</label><input name="trigger_event" required placeholder="user.created / order.completed"></div>
      <div class="form-group"><label>תנאים (JSON)</label><textarea name="conditions" rows="3">[{"field":"role","op":"eq","value":"admin"}]</textarea></div>
      <div class="form-group"><label>פעולות (JSON)</label><textarea name="actions" rows="3">[{"type":"notify","channel":"email"}]</textarea></div>
      <div class="form-group"><label>עדיפות</label><input name="priority" type="number" value="100"></div>
      <button type="submit" class="btn btn-primary btn-block">יצירה</button>
    </form>
  `);
  $('#rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let conditions, actions;
    try { conditions = JSON.parse(fd.get('conditions')); } catch { toast('תנאים — JSON לא תקין', 'error'); return; }
    try { actions = JSON.parse(fd.get('actions')); } catch { toast('פעולות — JSON לא תקין', 'error'); return; }
    await api('/rules', { method: 'POST', body: {
      name: fd.get('name'), description: fd.get('description') || undefined,
      trigger_event: fd.get('trigger_event'), conditions, actions,
      priority: Number(fd.get('priority')),
    }});
    closeModal(); toast('כלל נוצר', 'success'); loadRules();
  });
}

async function showEditRuleModal(id) {
  const res = await api(`/rules/${id}`);
  const rule = res.data;
  openModal('עריכת כלל', `
    <form id="edit-rule-form">
      <div class="form-group"><label>שם</label><input name="name" value="${esc(rule.name)}"></div>
      <div class="form-group"><label>תיאור</label><input name="description" value="${esc(rule.description || '')}"></div>
      <div class="form-group"><label>טריגר</label><input name="trigger_event" value="${esc(rule.trigger_event || '')}"></div>
      <div class="form-group"><label>תנאים (JSON)</label><textarea name="conditions" rows="3">${esc(JSON.stringify(rule.conditions, null, 2))}</textarea></div>
      <div class="form-group"><label>פעולות (JSON)</label><textarea name="actions" rows="3">${esc(JSON.stringify(rule.actions, null, 2))}</textarea></div>
      <div class="form-group"><label>עדיפות</label><input name="priority" type="number" value="${rule.priority ?? 0}"></div>
      <div class="form-group"><label><input type="checkbox" name="active" ${rule.active ? 'checked' : ''}> פעיל</label></div>
      <button type="submit" class="btn btn-primary btn-block">שמירה</button>
    </form>
  `);
  $('#edit-rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let conditions, actions;
    try { conditions = JSON.parse(fd.get('conditions')); } catch { toast('תנאים — JSON לא תקין', 'error'); return; }
    try { actions = JSON.parse(fd.get('actions')); } catch { toast('פעולות — JSON לא תקין', 'error'); return; }
    await api(`/rules/${id}`, { method: 'PUT', body: {
      name: fd.get('name'), description: fd.get('description'),
      trigger_event: fd.get('trigger_event'), conditions, actions,
      priority: Number(fd.get('priority')), active: !!fd.get('active'),
    }});
    closeModal(); toast('כלל עודכן', 'success'); loadRules();
  });
}

async function deleteRule(id) {
  if (!confirm('למחוק את הכלל?')) return;
  await api(`/rules/${id}`, { method: 'DELETE' });
  toast('כלל נמחק', 'success'); loadRules();
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
  $('#add-permission-btn').addEventListener('click', showAddPermissionModal);
  $('#add-workflow-btn').addEventListener('click', showAddWorkflowModal);
  $('#add-notif-template-btn').addEventListener('click', showAddNotifTemplateModal);
  $('#add-document-btn').addEventListener('click', showAddDocumentModal);
  $('#add-package-btn').addEventListener('click', showAddPackageModal);
  $('#add-rule-btn').addEventListener('click', showAddRuleModal);

  // Commercial tabs
  $$('.comm-tab').forEach(btn => {
    btn.addEventListener('click', () => switchCommTab(btn.dataset.tab));
  });

  // Workflow tabs
  $$('.wf-tab').forEach(btn => {
    btn.addEventListener('click', () => switchWfTab(btn.dataset.tab));
  });
  // Notification tabs
  $$('.notif-tab').forEach(btn => {
    btn.addEventListener('click', () => switchNotifTab(btn.dataset.tab));
  });

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
      currentUser = { id: payload.sub, name: payload.name || payload.email || 'מנהל', email: payload.email || '', role: payload.role };
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
