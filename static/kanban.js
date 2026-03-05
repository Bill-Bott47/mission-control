/* ═══════════════════════════════════════════════════════
   MISSION CONTROL v2 — KANBAN JS
   Vanilla JS, no framework
   ═══════════════════════════════════════════════════════ */

'use strict';

const COLUMNS = ['INBOX','PLANNING','IN PROGRESS','TESTING','REVIEW','BLOCKED','DONE'];
const COL_COLORS = {
  'INBOX':       'var(--col-inbox)',
  'PLANNING':    'var(--col-planning)',
  'IN PROGRESS': 'var(--col-inprogress)',
  'TESTING':     'var(--col-testing)',
  'REVIEW':      'var(--col-review)',
  'BLOCKED':     'var(--col-blocked)',
  'DONE':        'var(--col-done)',
};

const AGENT_COLORS = {
  'main': '#7C3AED',
  'Bill': '#7C3AED',
  'Bob': '#F59E0B',
  'Forge': '#3B82F6',
  'Truth': '#14B8A6',
  'Shark': '#DC2626',
  'ACE': '#22C55E',
  'Sam': '#4F46E5',
  'Marty': '#EAB308',
  'Quill': '#EF4444',
  'Pixel': '#EC4899',
  'Scrub': '#06B6D4',
  'Scout': '#059669',
  'Content PM': '#D97706',
  'SENTINEL': '#64748B',
  'Librarian': '#8B5CF6',
  'Music Biz': '#F43F5E',
  'Vitruviano PM': '#84CC16',
  'Ops': '#71717A',
};

let allTasks = [];
let draggedId = null;
let editingTaskId = null;
let projectMap = new Map();

// ── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildBoard();
  loadProjectsFilter();
  loadTasks();
  loadSummary();
  loadRecentActivity();

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

  // Filters
  ['filter-project', 'filter-priority', 'filter-search'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderBoard);
  });

  document.querySelectorAll('.agent-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.agent-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('filter-agent').value = btn.dataset.agent || '';
      renderBoard();
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
        <div class="col-title">
          <span class="col-dot" style="background:${COL_COLORS[col]}"></span>
          <span>${col}</span>
        </div>
        <div class="col-meta">
          <span class="col-count" id="count-${col.replace(/ /g,'_')}">0</span>
          <button class="col-add" data-col="${col}">+</button>
        </div>
      </div>
      <div class="col-body" id="col-${col.replace(/ /g,'_')}"
           ondragover="handleDragOver(event)"
           ondragleave="handleDragLeave(event)"
           ondrop="handleDrop(event,'${col}')">
      </div>
    `;
    board.appendChild(colEl);
  });

  board.querySelectorAll('.col-add').forEach(btn => {
    btn.addEventListener('click', () => {
      openCreateModal();
      document.getElementById('task-column').value = btn.dataset.col;
    });
  });
}

function getFilters() {
  return {
    project: document.getElementById('filter-project').value,
    priority: document.getElementById('filter-priority').value,
    agent: document.getElementById('filter-agent').value,
    search: document.getElementById('filter-search').value.toLowerCase(),
  };
}

function renderBoard() {
  const { project, priority, agent, search } = getFilters();

  COLUMNS.forEach(col => {
    const tasks = allTasks.filter(t => {
      if (t.column_name !== col) return false;
      if (project && !taskMatchesProject(t, project)) return false;
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
  });
}

function taskMatchesProject(task, projectId) {
  const project = projectMap.get(projectId);
  if (!project) return true;
  if ((project.task_ids || []).includes(task.id)) return true;
  const hay = `${task.title} ${task.description || ''} ${task.tags || ''}`.toLowerCase();
  const tokens = [
    project.id,
    project.name,
    ...(project.tags || []),
    project.discord_channel || '',
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .filter((s) => s.length >= 3);
  return tokens.some((token) => hay.includes(token));
}

function buildCard(task) {
  const card = document.createElement('div');
  card.className = `task-card priority-${task.priority}`;
  card.dataset.id = task.id;
  card.draggable = true;

  const tag = (task.tags || '').split(',').map(t => t.trim()).filter(Boolean)[0];
  const agent = task.assigned_agent || '';
  const avatarLabel = agent ? agent[0].toUpperCase() : '?';
  const avatarColor = AGENT_COLORS[agent] || AGENT_COLORS[agent?.toString()?.trim()] || '#71717A';
  const timeLabel = task.created_at ? formatTime(task.created_at) : '';

  card.innerHTML = `
    <div class="priority-dot"></div>
    <div class="card-title">${escHtml(task.title)}</div>
    ${task.description ? `<div class="card-desc">${escHtml(task.description)}</div>` : ''}
    <div class="card-footer">
      <div class="card-meta-left">
        <span class="avatar" style="background:${avatarColor}">${avatarLabel}</span>
        <span class="agent-name">${escHtml(agent || 'Unassigned')}</span>
        ${tag ? `<span class="tag-badge">${escHtml(tag)}</span>` : ''}
      </div>
      <span class="card-time">${escHtml(timeLabel)}</span>
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

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    if (Array.isArray(allTasks) && allTasks.length === 0) {
      await fetch('/api/import-tasks', { method: 'POST' });
      const retry = await fetch('/api/kanban/tasks');
      allTasks = await retry.json();
    }
    renderBoard();
  } catch (e) {
    console.error('loadTasks:', e);
  }
}

async function loadProjectsFilter() {
  const select = document.getElementById('filter-project');
  if (!select) return;
  try {
    const resp = await fetch('/api/projects');
    const data = await resp.json();
    const projects = data.projects || [];
    projectMap = new Map(projects.map((p) => [p.id, p]));
    const options = projects
      .map((p) => `<option value="${escAttr(p.id)}">${escHtml(p.name)} (${p.task_count || 0})</option>`)
      .join('');
    select.innerHTML = `<option value="">All projects</option>${options}`;

    const url = new URL(window.location.href);
    const projectParam = url.searchParams.get('project');
    if (projectParam && projectMap.has(projectParam)) {
      select.value = projectParam;
    }
    renderBoard();
  } catch (e) {
    console.error('loadProjectsFilter:', e);
  }
}

async function loadSummary() {
  try {
    const resp = await fetch('/api/task-summary');
    const data = await resp.json();
    const total = data.total ?? 0;
    const inProgress = data.in_progress ?? 0;
    const thisWeek = data.this_week ?? 0;
    const completion = data.completion ?? (total ? Math.round((data.done ?? 0) / total * 100) : 0);

    document.getElementById('kanban-stats').innerHTML = `
      <span class="stat-item"><strong>${thisWeek}</strong> This week</span>
      <span class="stat-dot">·</span>
      <span class="stat-item"><strong>${inProgress}</strong> In progress</span>
      <span class="stat-dot">·</span>
      <span class="stat-item"><strong>${total}</strong> Total</span>
      <span class="stat-dot">·</span>
      <span class="stat-item"><strong>${completion}%</strong> Completion</span>
    `;
  } catch (e) {
    console.error('loadSummary:', e);
  }
}

async function loadRecentActivity() {
  const list = document.getElementById('activity-list');
  list.innerHTML = '<div style="color:var(--muted);font-size:12px">Loading...</div>';
  try {
    const resp = await fetch('/api/recent-activity');
    const data = await resp.json();
    const items = data.items || data.activity || data || [];

    if (!items.length) {
      list.innerHTML = '<div style="color:var(--muted);font-size:12px">No recent activity</div>';
      return;
    }

    list.innerHTML = items.map(item => {
      const source = item.source || 'activity';
      const color = source === 'git' ? '#3B82F6' : (source === 'cron' ? '#14B8A6' : '#7C3AED');
      const time = item.timestamp || item.time || '';
      const label = time ? new Date(time).toLocaleString() : '';
      const title = item.title || 'Event';
      const msg = item.description || item.message || item.text || '';
      const detail = `${title}: ${msg}${label ? ` · ${label}` : ''}`;
      return `
        <div class="activity-item" title="${escAttr(detail)}">
          <span class="activity-dot" style="background:${color}"></span>
          <div class="activity-content">
            <strong style="color:${color}">${escHtml(title)}</strong> ${escHtml(msg)}
            ${label ? `<span class="activity-time">${escHtml(label)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('loadRecentActivity:', e);
    list.innerHTML = '<div style="color:var(--muted);font-size:12px">No recent activity</div>';
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
      await loadSummary();
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
      <span style="font-size:12px;color:var(--muted)">${task.created_at}</span>
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
    await loadSummary();
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
    await loadSummary();
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
    resultEl.innerHTML = '<div style="color:var(--pri-urgent)">AI planning unavailable</div>';
    resultEl.classList.remove('hidden');
  } finally {
    btn.textContent = '🤖 AI PLAN THIS TASK';
    btn.disabled = false;
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

// Auto-refresh
setInterval(loadTasks, 30000);
setInterval(loadSummary, 60000);
setInterval(loadRecentActivity, 30000);
