/* ═══════════════════════════════════════════════════════
   MISSION CONTROL v2 — KANBAN JS
   Vanilla JS, no framework
   ═══════════════════════════════════════════════════════ */

'use strict';

const COLUMNS = ['PLANNING','INBOX','ASSIGNED','IN PROGRESS','TESTING','REVIEW','DONE'];
const COL_COLORS = {
  'PLANNING':    'var(--col-planning)',
  'INBOX':       'var(--col-inbox)',
  'ASSIGNED':    'var(--col-assigned)',
  'IN PROGRESS': 'var(--col-inprogress)',
  'TESTING':     'var(--col-testing)',
  'REVIEW':      'var(--col-review)',
  'DONE':        'var(--col-done)',
};

let allTasks = [];
let draggedId = null;
let editingTaskId = null;
let activeSignalTab = 'ict';
let activeContentTab = 'all';
let feedEventSource = null;

// ── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildBoard();
  loadTasks();
  loadSignals();
  loadContent();
  startGatewayFeed();
  discoverAgents();
  startClock();

  // Bind controls
  document.getElementById('btn-add-task').addEventListener('click', openCreateModal);
  document.getElementById('btn-modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-modal-save').addEventListener('click', saveTask);
  document.getElementById('btn-detail-close').addEventListener('click', closeDetailModal);
  document.getElementById('btn-detail-cancel').addEventListener('click', closeDetailModal);
  document.getElementById('btn-detail-save').addEventListener('click', updateTask);
  document.getElementById('btn-detail-delete').addEventListener('click', deleteTask);
  document.getElementById('btn-ai-plan').addEventListener('click', runAiPlan);
  document.getElementById('btn-discover-agents').addEventListener('click', discoverAgents);
  document.getElementById('btn-refresh-signals').addEventListener('click', loadSignals);
  document.getElementById('btn-refresh-content').addEventListener('click', loadContent);

  // Filters
  ['filter-priority', 'filter-agent', 'filter-search'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderBoard);
  });

  // Signal tabs
  document.querySelectorAll('#signals-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#signals-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSignalTab = btn.dataset.tab;
      renderSignals();
    });
  });

  // Content tabs
  document.querySelectorAll('#content-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#content-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeContentTab = btn.dataset.ctab;
      renderContentList();
    });
  });

  // Click overlay to close
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('detail-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('detail-overlay')) closeDetailModal();
  });
});

// ── CLOCK ─────────────────────────────────────────────────────

function startClock() {
  const el = document.getElementById('clock');
  const update = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'America/Chicago'
    }) + ' CST';
  };
  update();
  setInterval(update, 1000);
}

// ── BOARD ─────────────────────────────────────────────────────

function buildBoard() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  COLUMNS.forEach(col => {
    const colEl = document.createElement('div');
    colEl.className = 'kanban-col';
    colEl.dataset.col = col;
    colEl.style.setProperty('--col-color', COL_COLORS[col]);
    colEl.innerHTML = `
      <div class="col-header" style="--col-color:${COL_COLORS[col]}">
        <span class="col-name" style="color:${COL_COLORS[col]}">${col}</span>
        <span class="col-count" id="count-${col.replace(/ /g,'_')}">0</span>
      </div>
      <div class="col-body" id="col-${col.replace(/ /g,'_')}"
           ondragover="handleDragOver(event)"
           ondragleave="handleDragLeave(event)"
           ondrop="handleDrop(event,'${col}')">
      </div>
    `;
    board.appendChild(colEl);
  });
}

function getFilters() {
  return {
    priority: document.getElementById('filter-priority').value,
    agent: document.getElementById('filter-agent').value,
    search: document.getElementById('filter-search').value.toLowerCase(),
  };
}

function renderBoard() {
  const { priority, agent, search } = getFilters();
  let stats = { total: 0 };

  COLUMNS.forEach(col => {
    const tasks = allTasks.filter(t => {
      if (t.column_name !== col) return false;
      if (priority && t.priority !== priority) return false;
      if (agent && t.assigned_agent !== agent) return false;
      if (search && !t.title.toLowerCase().includes(search)) return false;
      return true;
    });

    const bodyEl = document.getElementById('col-' + col.replace(/ /g, '_'));
    const countEl = document.getElementById('count-' + col.replace(/ /g, '_'));
    if (!bodyEl) return;

    bodyEl.innerHTML = '';
    tasks.forEach(task => bodyEl.appendChild(buildCard(task)));
    countEl.textContent = tasks.length;
    stats.total += tasks.length;
  });

  document.getElementById('board-stats').textContent =
    `${stats.total} tasks | ${allTasks.filter(t => t.column_name === 'DONE').length} done`;
}

function buildCard(task) {
  const card = document.createElement('div');
  card.className = `task-card priority-${task.priority}`;
  card.dataset.id = task.id;
  card.draggable = true;

  const due = task.due_date ? formatDue(task.due_date) : null;
  const isOverdue = due && due.overdue;

  card.innerHTML = `
    <span class="card-id">#${task.id}</span>
    <div class="card-title">${escHtml(task.title)}</div>
    <div class="card-meta">
      ${task.assigned_agent ? `<span class="card-agent">${escHtml(task.assigned_agent)}</span>` : ''}
      <span class="card-pri ${task.priority}">${task.priority}</span>
      ${task.tags ? `<span class="card-tags">${escHtml(task.tags.split(',').map(t=>t.trim()).join(' · '))}</span>` : ''}
      ${due ? `<span class="card-due ${isOverdue ? 'overdue' : ''}">${due.label}</span>` : ''}
    </div>
  `;

  card.addEventListener('dragstart', e => {
    draggedId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  });

  card.addEventListener('dragend', () => {
    draggedId = null;
    card.classList.remove('dragging');
  });

  card.addEventListener('click', () => openDetailModal(task));

  return card;
}

function formatDue(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (d - now) / 86400000;
  const overdue = diff < 0;
  const label = overdue
    ? `${Math.abs(Math.floor(diff))}d late`
    : diff < 1 ? 'today'
    : diff < 2 ? 'tmrw'
    : `${Math.floor(diff)}d`;
  return { label, overdue };
}

// ── DRAG & DROP ───────────────────────────────────────────────

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e, col) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (draggedId == null) return;

  // Determine position by mouse Y within column body
  const colBody = e.currentTarget;
  const cards = [...colBody.querySelectorAll('.task-card')];
  let position = cards.length;
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      position = i;
      break;
    }
  }

  try {
    const resp = await fetch(`/api/kanban/tasks/${draggedId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column: col, position }),
    });
    if (resp.ok) {
      await loadTasks();
    }
  } catch (err) {
    console.error('Move failed:', err);
  }
}

// ── LOAD DATA ─────────────────────────────────────────────────

async function loadTasks() {
  try {
    const resp = await fetch('/api/kanban/tasks');
    allTasks = await resp.json();
    renderBoard();
  } catch (e) {
    console.error('loadTasks:', e);
  }
}

// ── CREATE TASK MODAL ─────────────────────────────────────────

function openCreateModal() {
  editingTaskId = null;
  document.getElementById('modal-title').textContent = 'NEW TASK';
  document.getElementById('task-title').value = '';
  document.getElementById('task-desc').value = '';
  document.getElementById('task-column').value = 'INBOX';
  document.getElementById('task-priority').value = 'medium';
  document.getElementById('task-agent').value = '';
  document.getElementById('task-due').value = '';
  document.getElementById('task-tags').value = '';
  document.getElementById('ai-plan-result').classList.add('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('task-title').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function saveTask() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) { document.getElementById('task-title').focus(); return; }

  const payload = {
    title,
    description: document.getElementById('task-desc').value,
    column: document.getElementById('task-column').value,
    priority: document.getElementById('task-priority').value,
    assigned_agent: document.getElementById('task-agent').value,
    due_date: document.getElementById('task-due').value || null,
    tags: document.getElementById('task-tags').value,
    ai_notes: document.getElementById('ai-plan-result').dataset.notes || '',
  };

  try {
    const resp = await fetch('/api/kanban/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      closeModal();
      await loadTasks();
    }
  } catch (e) {
    console.error('saveTask:', e);
  }
}

// ── DETAIL MODAL ──────────────────────────────────────────────

function openDetailModal(task) {
  editingTaskId = task.id;
  document.getElementById('detail-title').textContent = `TASK #${task.id}`;
  document.getElementById('detail-body').innerHTML = buildDetailForm(task);
  document.getElementById('detail-overlay').classList.remove('hidden');
}

function buildDetailForm(task) {
  return `
    <div class="field-row">
      <label>TITLE</label>
      <input type="text" id="det-title" class="mc-input" value="${escAttr(task.title)}" />
    </div>
    <div class="field-row">
      <label>DESCRIPTION</label>
      <textarea id="det-desc" class="mc-textarea" rows="3">${escHtml(task.description || '')}</textarea>
    </div>
    <div class="detail-grid">
      <div class="detail-field">
        <label>COLUMN</label>
        <select id="det-column" class="mc-select">
          ${COLUMNS.map(c => `<option value="${c}" ${c===task.column_name?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="detail-field">
        <label>PRIORITY</label>
        <select id="det-priority" class="mc-select">
          ${['low','medium','high','urgent'].map(p => `<option value="${p}" ${p===task.priority?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="detail-field">
        <label>AGENT</label>
        <select id="det-agent" class="mc-select">
          <option value="" ${!task.assigned_agent?'selected':''}>Unassigned</option>
          ${['main','Scout','Shark','ACE','Quill','Pixel'].map(a =>
            `<option value="${a}" ${a===task.assigned_agent?'selected':''}>${a}</option>`).join('')}
        </select>
      </div>
      <div class="detail-field">
        <label>DUE DATE</label>
        <input type="date" id="det-due" class="mc-input" value="${task.due_date || ''}" />
      </div>
    </div>
    <div class="field-row">
      <label>TAGS</label>
      <input type="text" id="det-tags" class="mc-input" value="${escAttr(task.tags || '')}" />
    </div>
    ${task.ai_notes ? `
    <div class="field-row">
      <label>AI PLANNING NOTES</label>
      <div class="detail-ai-notes">${escHtml(task.ai_notes)}</div>
    </div>` : ''}
    <div class="field-row">
      <label>CREATED</label>
      <span style="font-size:10px;color:var(--text2)">${task.created_at}</span>
    </div>
  `;
}

function closeDetailModal() {
  document.getElementById('detail-overlay').classList.add('hidden');
  editingTaskId = null;
}

async function updateTask() {
  if (!editingTaskId) return;
  const payload = {
    title: document.getElementById('det-title').value,
    description: document.getElementById('det-desc').value,
    priority: document.getElementById('det-priority').value,
    assigned_agent: document.getElementById('det-agent').value,
    due_date: document.getElementById('det-due').value || null,
    tags: document.getElementById('det-tags').value,
  };

  // Also move column if changed
  const newCol = document.getElementById('det-column').value;
  const task = allTasks.find(t => t.id === editingTaskId);

  try {
    await fetch(`/api/kanban/tasks/${editingTaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (task && newCol !== task.column_name) {
      await fetch(`/api/kanban/tasks/${editingTaskId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: newCol, position: 999 }),
      });
    }

    closeDetailModal();
    await loadTasks();
  } catch (e) {
    console.error('updateTask:', e);
  }
}

async function deleteTask() {
  if (!editingTaskId) return;
  if (!confirm(`Delete task #${editingTaskId}?`)) return;
  try {
    await fetch(`/api/kanban/tasks/${editingTaskId}`, { method: 'DELETE' });
    closeDetailModal();
    await loadTasks();
  } catch (e) {
    console.error('deleteTask:', e);
  }
}

// ── AI PLANNING ───────────────────────────────────────────────

async function runAiPlan() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) { document.getElementById('task-title').focus(); return; }
  const desc = document.getElementById('task-desc').value;

  const btn = document.getElementById('btn-ai-plan');
  btn.textContent = '⏳ PLANNING...';
  btn.disabled = true;

  const resultEl = document.getElementById('ai-plan-result');
  resultEl.classList.add('hidden');

  try {
    const resp = await fetch('/api/kanban/ai-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: desc }),
    });
    const data = await resp.json();

    // Auto-fill fields from AI
    if (data.priority) document.getElementById('task-priority').value = data.priority;
    if (data.assigned_agent) document.getElementById('task-agent').value = data.assigned_agent;
    if (data.tags) document.getElementById('task-tags').value = data.tags;

    // Show result
    const notes = JSON.stringify(data, null, 2);
    resultEl.dataset.notes = notes;
    resultEl.innerHTML = `
      <div class="ai-plan-q">
        <strong>Questions:</strong>
        <ul>${(data.questions || []).map(q => `<li>${escHtml(q)}</li>`).join('')}</ul>
      </div>
      <div class="ai-plan-meta">
        Agent: <span>${escHtml(data.assigned_agent || '—')}</span> ·
        Priority: <span>${escHtml(data.priority || '—')}</span> ·
        Complexity: <span>${data.complexity || '—'}/5</span>
      </div>
      ${data.notes ? `<div class="ai-plan-notes">${escHtml(data.notes)}</div>` : ''}
    `;
    resultEl.classList.remove('hidden');
  } catch (e) {
    console.error('AI plan failed:', e);
    resultEl.innerHTML = '<div style="color:var(--red)">AI planning unavailable</div>';
    resultEl.classList.remove('hidden');
  } finally {
    btn.textContent = '🤖 AI PLAN THIS TASK';
    btn.disabled = false;
  }
}

// ── SIGNALS ───────────────────────────────────────────────────

let signalsData = null;

async function loadSignals() {
  try {
    const resp = await fetch('/api/trading-signals/db');
    signalsData = await resp.json();
    renderSignals();
  } catch (e) {
    console.error('loadSignals:', e);
  }
}

function renderSignals() {
  const el = document.getElementById('signals-content');
  if (!signalsData) { el.innerHTML = '<div class="mc-loading">Loading...</div>'; return; }

  if (activeSignalTab === 'ict') {
    const alerts = signalsData.ict_alerts || [];
    if (!alerts.length) { el.innerHTML = '<div class="mc-empty">No ICT alerts</div>'; return; }
    el.innerHTML = alerts.map(a => `
      <div class="ict-row">
        <div class="ict-header">
          <span class="ict-symbol">${escHtml(a.symbol || '?')}</span>
          <span class="ict-tf">${escHtml(a.timeframe || '')}</span>
          <span class="ict-setup">${escHtml(a.setup_type || '')}</span>
        </div>
        <div class="ict-msg">${escHtml((a.message_text || '').substring(0, 80))}</div>
      </div>
    `).join('');
  } else if (activeSignalTab === 'shark') {
    const signals = signalsData.sharktime || [];
    if (!signals.length) { el.innerHTML = '<div class="mc-empty">No signals</div>'; return; }
    el.innerHTML = `
      <div class="signal-row" style="color:var(--text3);border-bottom:1px solid var(--border)">
        <span>ASSET</span><span>DIR</span><span>TYPE</span><span>TF</span><span>CONF</span>
      </div>
      ${signals.map(s => {
        const conf = s.confidence_score || 0;
        const confClass = conf >= 0.8 ? 'conf-high' : conf >= 0.6 ? 'conf-medium' : 'conf-low';
        return `
          <div class="signal-row">
            <span class="signal-asset">${escHtml(s.asset)}</span>
            <span class="${s.direction==='LONG'?'signal-long':'signal-short'}">${s.direction}</span>
            <span class="signal-type">${escHtml((s.signal_type||'').replace(/_/g,' '))}</span>
            <span class="signal-tf">${escHtml(s.timeframe||'')}</span>
            <span class="signal-conf ${confClass}">${(conf*100).toFixed(0)}%</span>
          </div>
        `;
      }).join('')}
    `;
  } else if (activeSignalTab === 'trades') {
    const trades = signalsData.sharktime_trades || [];
    if (!trades.length) { el.innerHTML = '<div class="mc-empty">No trades</div>'; return; }
    el.innerHTML = `
      <div class="trade-row" style="color:var(--text3);border-bottom:1px solid var(--border)">
        <span>ASSET</span><span>DIR</span><span>ENTRY</span><span>EXIT</span><span>PNL</span>
      </div>
      ${trades.map(t => {
        const pnl = t.pnl_usd;
        const pnlClass = pnl > 0 ? 'pnl-pos' : pnl < 0 ? 'pnl-neg' : '';
        return `
          <div class="trade-row">
            <span class="signal-asset">${escHtml(t.asset)}</span>
            <span class="${t.direction==='LONG'?'signal-long':'signal-short'}">${t.direction}</span>
            <span style="color:var(--text2)">${fmtPrice(t.entry_price)}</span>
            <span style="color:var(--text2)">${fmtPrice(t.exit_price)}</span>
            <span class="${pnlClass}">${pnl!=null ? (pnl>0?'+':'')+pnl : '—'}</span>
          </div>
        `;
      }).join('')}
    `;
  }
}

function fmtPrice(p) {
  if (p == null) return '—';
  return parseFloat(p).toFixed(2);
}

// ── CONTENT PIPELINE ─────────────────────────────────────────

let contentData = null;

async function loadContent() {
  try {
    const resp = await fetch('/api/content-pipeline');
    contentData = await resp.json();
    renderContentStats();
    renderContentList();
  } catch (e) {
    console.error('loadContent:', e);
  }
}

function renderContentStats() {
  const items = contentData?.items || [];
  const stats = { all: items.length, draft: 0, scheduled: 0, published: 0, killed: 0 };
  items.forEach(item => {
    const stage = item.stage || '';
    if (item.killed) { stats.killed++; }
    else if (item.approved || stage === 'approved') { stats.published++; }
    else if (stage === 'scheduled') { stats.scheduled++; }
    else { stats.draft++; }
  });

  document.getElementById('content-stats').innerHTML = `
    <div class="content-stat"><strong>${stats.all}</strong><span>TOTAL</span></div>
    <div class="content-stat"><strong style="color:var(--yellow)">${stats.draft}</strong><span>DRAFT</span></div>
    <div class="content-stat"><strong style="color:var(--orange)">${stats.scheduled}</strong><span>SCHED</span></div>
    <div class="content-stat"><strong style="color:var(--green)">${stats.published}</strong><span>LIVE</span></div>
  `;
}

function renderContentList() {
  const items = contentData?.items || [];
  const tab = activeContentTab;
  const el = document.getElementById('content-list');

  const filtered = items.filter(item => {
    if (tab === 'all') return !item.killed;
    if (tab === 'draft') return !item.killed && !item.approved && item.stage !== 'scheduled';
    if (tab === 'scheduled') return !item.killed && item.stage === 'scheduled';
    if (tab === 'published') return !item.killed && (item.approved || item.stage === 'approved');
    return true;
  });

  if (!filtered.length) { el.innerHTML = '<div class="mc-empty">No items</div>'; return; }

  el.innerHTML = filtered.map(item => {
    const stageClass = item.killed ? 'ci-killed' :
      item.approved ? 'ci-approved' :
      `ci-${(item.stage||'trending').replace(/\s/g,'-')}`;
    const stageLabel = item.killed ? 'KILLED' :
      item.approved ? 'LIVE' :
      (item.stage || 'DRAFT').toUpperCase();

    return `
      <div class="content-item">
        <span class="ci-stage ${stageClass}">${stageLabel}</span>
        <div>
          <div class="ci-title">${escHtml(item.title || 'Untitled')}</div>
          ${item.channels ? `<div class="ci-channels">${escHtml(item.channels)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ── GATEWAY FEED ──────────────────────────────────────────────

function startGatewayFeed() {
  const feedEl = document.getElementById('agent-feed');
  const feedDot = document.getElementById('feed-status');

  if (feedEventSource) feedEventSource.close();

  feedEventSource = new EventSource('/api/gateway/events');

  feedEventSource.onopen = () => {
    feedDot.classList.add('active');
    document.getElementById('gw-status').style.color = 'var(--green)';
  };

  feedEventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'heartbeat' || data.type === 'connected') return;
      if (data.type === 'disconnected') {
        feedDot.classList.remove('active');
        document.getElementById('gw-status').style.color = 'var(--red)';
        return;
      }
      appendFeedEntry(feedEl, data);
    } catch (_) {}
  };

  feedEventSource.onerror = () => {
    feedDot.classList.remove('active');
    document.getElementById('gw-status').style.color = 'var(--orange)';
    // Reconnect after 5s
    setTimeout(startGatewayFeed, 5000);
  };
}

function appendFeedEntry(feedEl, data) {
  const entry = document.createElement('div');
  const type = data.type || data.kind || 'info';
  const cls = type.includes('error') ? 'error' : type.includes('warn') ? 'warn' : type.includes('tool') ? 'tool' : 'info';
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let content = '';
  if (data.session || data.agent) {
    content += `<span class="feed-agent">${escHtml(data.session || data.agent)}</span>`;
  }
  const msg = data.message || data.text || data.content || data.method || JSON.stringify(data).substring(0, 80);
  content += escHtml(msg.substring(0, 100));

  entry.className = `feed-entry ${cls}`;
  entry.innerHTML = `<span class="feed-time">${time}</span>${content}`;
  feedEl.insertBefore(entry, feedEl.firstChild);

  // Keep max 100 entries
  while (feedEl.children.length > 100) feedEl.removeChild(feedEl.lastChild);
}

// ── AGENT DISCOVERY ───────────────────────────────────────────

async function discoverAgents() {
  const listEl = document.getElementById('agent-list');
  listEl.innerHTML = '<span class="mc-loading">scanning...</span>';

  try {
    const resp = await fetch('/api/gateway/sessions');
    const data = await resp.json();

    const sessions = data.sessions || data.items || data.result?.sessions || [];
    if (!sessions.length) {
      listEl.innerHTML = '<span style="color:var(--text3);font-size:10px;padding:4px">No active sessions</span>';
      return;
    }

    listEl.innerHTML = sessions.map(s => {
      const label = s.label || s.key || s.id || 'unknown';
      const isOnline = s.status === 'online' || s.active === true;
      return `<span class="agent-chip ${isOnline ? 'online' : ''}" title="${escAttr(JSON.stringify(s))}">${escHtml(label)}</span>`;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<span style="color:var(--red);font-size:10px;padding:4px">discovery failed</span>`;
  }
}

// ── UTILS ─────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Auto-refresh board every 30s
setInterval(loadTasks, 30000);
setInterval(loadSignals, 60000);
setInterval(loadContent, 60000);
