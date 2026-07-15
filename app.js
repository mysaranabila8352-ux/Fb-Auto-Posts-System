const API = '/api';

// ---------- Navigation ----------
const navBtns = document.querySelectorAll('.nav-btn');
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
    refreshView(btn.dataset.view);
  });
});

function refreshView(view) {
  if (view === 'dashboard') loadDashboard();
  if (view === 'scheduled') loadScheduled();
  if (view === 'history') loadHistory();
  if (view === 'logs') loadLogs();
}

// ---------- Helpers ----------
function fmt(dtStr) {
  if (!dtStr) return '—';
  const d = new Date(dtStr);
  if (isNaN(d)) return dtStr;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function badge(status) {
  return `<span class="badge ${status}">${status}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function emptyRow(colspan, text) {
  return `<tr><td colspan="${colspan}" class="empty-state">${text}</td></tr>`;
}

async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function apiSend(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- Dashboard ----------
async function loadDashboard() {
  try {
    const stats = await apiGet('/stats');
    document.getElementById('stat-pending').textContent = stats.pending;
    document.getElementById('stat-posted').textContent = stats.posted;
    document.getElementById('stat-failed').textContent = stats.failed;
    document.getElementById('stat-daily').textContent = stats.daily;
    document.getElementById('stat-success-logs').textContent = stats.successLogs;
    document.getElementById('stat-failure-logs').textContent = stats.failureLogs;

    const posts = await apiGet('/posts?status=pending');
    const rows = posts.slice(0, 8).map(p => `
      <tr>
        <td class="content-cell">${escapeHtml(p.content)}</td>
        <td>${p.recurrence === 'daily' ? badge('daily') : badge('pending')}</td>
        <td class="timestamp">${p.recurrence === 'daily' ? `Daily @ ${p.daily_time}` : fmt(p.scheduled_time)}</td>
      </tr>
    `).join('');

    document.getElementById('dash-upcoming').innerHTML = `
      <table>
        <thead><tr><th>Content</th><th>Type</th><th>When</th></tr></thead>
        <tbody>${rows || emptyRow(3, 'No pending posts. Create one from the sidebar.')}</tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
  }
}

// ---------- Create Post form ----------
const form = document.getElementById('post-form');
const recurrenceSel = document.getElementById('f-recurrence');
const wrapOnce = document.getElementById('wrap-once');
const wrapDaily = document.getElementById('wrap-daily');
const formMsg = document.getElementById('form-msg');

recurrenceSel.addEventListener('change', () => {
  const isDaily = recurrenceSel.value === 'daily';
  wrapOnce.classList.toggle('hidden', isDaily);
  wrapDaily.classList.toggle('hidden', !isDaily);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMsg.textContent = '';
  formMsg.className = 'form-msg';

  const recurrence = recurrenceSel.value;
  const payload = {
    content: document.getElementById('f-content').value,
    image_url: document.getElementById('f-image').value || null,
    recurrence,
    scheduled_time: document.getElementById('f-scheduled').value,
    daily_time: document.getElementById('f-daily-time').value
  };

  try {
    await apiSend('/posts', 'POST', payload);
    formMsg.textContent = '✓ Post saved and scheduled.';
    formMsg.classList.add('ok');
    form.reset();
    wrapOnce.classList.remove('hidden');
    wrapDaily.classList.add('hidden');
  } catch (err) {
    formMsg.textContent = `✗ ${err.message}`;
    formMsg.classList.add('err');
  }
});

// ---------- Scheduled Posts ----------
async function loadScheduled() {
  try {
    const posts = await apiGet('/posts?status=pending');
    const rows = posts.map(p => `
      <tr>
        <td class="content-cell">${escapeHtml(p.content)}</td>
        <td>${p.recurrence === 'daily' ? badge('daily') : badge('pending')}</td>
        <td class="timestamp">${p.recurrence === 'daily' ? `Daily @ ${p.daily_time}` : fmt(p.scheduled_time)}</td>
        <td class="timestamp">${fmt(p.created_at)}</td>
        <td><button class="btn-danger" data-cancel="${p.id}">Cancel</button></td>
      </tr>
    `).join('');

    document.getElementById('scheduled-table').innerHTML = `
      <table>
        <thead><tr><th>Content</th><th>Type</th><th>When</th><th>Created</th><th></th></tr></thead>
        <tbody>${rows || emptyRow(5, 'Nothing scheduled yet.')}</tbody>
      </table>
    `;

    document.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Cancel this scheduled post?')) return;
        await apiSend(`/posts/${btn.dataset.cancel}`, 'DELETE');
        loadScheduled();
      });
    });
  } catch (err) {
    console.error(err);
  }
}

// ---------- History ----------
async function loadHistory() {
  try {
    const posts = await apiGet('/history');
    const rows = posts.map(p => `
      <tr>
        <td class="content-cell">${escapeHtml(p.content)}</td>
        <td>${badge(p.status)}${p.recurrence === 'daily' ? ' ' + badge('daily') : ''}</td>
        <td class="timestamp">${fmt(p.updated_at)}</td>
        <td>${p.fb_post_id ? escapeHtml(p.fb_post_id) : '—'}</td>
      </tr>
    `).join('');

    document.getElementById('history-table').innerHTML = `
      <table>
        <thead><tr><th>Content</th><th>Status</th><th>Last Updated</th><th>FB Post ID</th></tr></thead>
        <tbody>${rows || emptyRow(4, 'No posting history yet.')}</tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
  }
}

// ---------- Logs ----------
async function loadLogs() {
  try {
    const logs = await apiGet('/logs');
    const rows = logs.map(l => `
      <tr>
        <td class="timestamp">${fmt(l.attempted_at)}</td>
        <td>${badge(l.status)}</td>
        <td class="content-cell">${escapeHtml(l.content)}</td>
        <td>${escapeHtml(l.message)}</td>
      </tr>
    `).join('');

    document.getElementById('logs-table').innerHTML = `
      <table>
        <thead><tr><th>Time</th><th>Result</th><th>Post</th><th>Detail</th></tr></thead>
        <tbody>${rows || emptyRow(4, 'No attempts logged yet.')}</tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
  }
}

// ---------- Mock mode banner ----------
async function checkMockMode() {
  try {
    const config = await apiGet('/config');
    document.getElementById('mock-banner').classList.toggle('hidden', !config.mockMode);
  } catch (err) {
    console.error(err);
  }
}

// ---------- Init ----------
checkMockMode();
loadDashboard();
setInterval(() => {
  const active = document.querySelector('.nav-btn.active').dataset.view;
  refreshView(active);
}, 15000); // auto-refresh every 15s
