const statusEl = document.getElementById('filter-status');
const priorityEl = document.getElementById('filter-priority');
const agentEl = document.getElementById('filter-agent');
const ownerEl = document.getElementById('filter-owner');
const searchEl = document.getElementById('filter-search');
const tableWrapEl = document.getElementById('tasks-table-wrap');
const countEl = document.getElementById('task-count');
const metaEl = document.getElementById('tasks-meta');

const DEFAULT_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
let searchDebounce = null;

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function normalizeBadgeClass(prefix, value) {
    return `${prefix}-${String(value || '').toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')}`;
}

function priorityClass(priority) {
    const value = String(priority || '').toUpperCase();
    if (value.startsWith('P1')) return 'priority-p1';
    if (value.startsWith('P2')) return 'priority-p2';
    if (value.startsWith('P3')) return 'priority-p3';
    if (value.startsWith('P4')) return 'priority-p4';
    return 'priority-p3';
}

function setOptions(selectEl, values, includeDefaults = false) {
    const current = selectEl.value || 'ALL';
    const seen = new Set(['ALL']);
    let options = ['ALL'];

    if (includeDefaults) {
        DEFAULT_STATUSES.forEach((value) => {
            seen.add(value);
            options.push(value);
        });
    }

    values.forEach((value) => {
        if (!value) return;
        if (seen.has(value)) return;
        seen.add(value);
        options.push(value);
    });

    selectEl.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    selectEl.value = options.includes(current) ? current : 'ALL';
}

function buildQuery() {
    const params = new URLSearchParams();
    const status = statusEl.value;
    const priority = priorityEl.value;
    const agent = agentEl.value;
    const owner = ownerEl.value;
    const query = searchEl.value.trim();

    if (status && status !== 'ALL') params.set('status', status);
    if (priority && priority !== 'ALL') params.set('priority', priority);
    if (agent && agent !== 'ALL') params.set('agent', agent);
    if (owner && owner !== 'ALL') params.set('owner', owner);
    if (query) params.set('q', query);

    return params.toString();
}

function renderTasks(tasks) {
    if (!tasks.length) {
        tableWrapEl.innerHTML = '<div class="empty-state">No tasks match the current filters.</div>';
        return;
    }

    const rows = tasks.map((task) => `
        <tr>
            <td class="task-id">${escapeHtml(task.id || '-')}</td>
            <td class="task-details">
                <strong>${escapeHtml(task.title || task.header || 'Untitled')}</strong>
                <div class="what">${escapeHtml(task.what || '')}</div>
            </td>
            <td><span class="badge ${normalizeBadgeClass('status', task.status)}">${escapeHtml(task.status || 'UNKNOWN')}</span></td>
            <td><span class="badge ${priorityClass(task.priority)}">${escapeHtml(task.priority || 'Unspecified')}</span></td>
            <td>${escapeHtml(task.who || '-')}</td>
            <td>${escapeHtml(task.due || '-')}</td>
            <td>${escapeHtml(task.agent || '-')}</td>
            <td class="context-text">${escapeHtml(task.context || '-')}</td>
        </tr>
    `).join('');

    tableWrapEl.innerHTML = `
        <table class="tasks-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Owner</th>
                    <th>Due</th>
                    <th>Agent</th>
                    <th>Context</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

async function loadTasks() {
    const query = buildQuery();
    tableWrapEl.innerHTML = '<div class="loading">Loading tasks...</div>';

    try {
        const response = await fetch(`/api/tasks${query ? `?${query}` : ''}`);
        const data = await response.json();

        if (!response.ok) {
            tableWrapEl.innerHTML = `<div class="loading">Failed to load tasks: ${escapeHtml(data.error || response.statusText)}</div>`;
            return;
        }

        setOptions(statusEl, data.statuses || [], true);
        setOptions(priorityEl, data.priorities || []);
        setOptions(agentEl, data.agents || []);
        setOptions(ownerEl, data.owners || []);
        countEl.textContent = `(${data.count}/${data.total_count})`;

        const syncedAt = new Date(data.timestamp);
        const fileAt = data.file_modified_at ? new Date(data.file_modified_at) : null;
        metaEl.textContent = `Source: ${data.file_path} | Synced: ${syncedAt.toLocaleTimeString()}${fileAt ? ` | File updated: ${fileAt.toLocaleString()}` : ''}`;

        renderTasks(data.tasks || []);
    } catch (error) {
        tableWrapEl.innerHTML = `<div class="loading">Error loading tasks: ${escapeHtml(error.message)}</div>`;
    }
}

function scheduleSearchRefresh() {
    if (searchDebounce) {
        clearTimeout(searchDebounce);
    }
    searchDebounce = setTimeout(loadTasks, 250);
}

document.addEventListener('DOMContentLoaded', () => {
    statusEl.addEventListener('change', loadTasks);
    priorityEl.addEventListener('change', loadTasks);
    agentEl.addEventListener('change', loadTasks);
    ownerEl.addEventListener('change', loadTasks);
    searchEl.addEventListener('input', scheduleSearchRefresh);

    loadTasks();
    setInterval(loadTasks, 10000);
});
