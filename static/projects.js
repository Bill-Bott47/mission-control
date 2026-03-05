const PRIORITY_MAP = {
  'mission-control': { level: 'High', reason: 'Ops backbone' },
  'vitruviano': { level: 'High', reason: 'Product pivot' },
  'outbound-engine': { level: 'Medium', reason: 'Sales leverage' },
  'music-biz': { level: 'Low', reason: 'Stable client' },
  'trading-systems': { level: 'High', reason: 'Revenue + signals' }
};

const STATUS_PROGRESS = {
  'planning': 20,
  'building': 55,
  'live': 90
};

let allProjects = [];
let activeBucket = 'projects';

async function loadProjects() {
  const resp = await fetch('/api/projects');
  const data = await resp.json();
  allProjects = data.projects || [];
  renderTabs();
  renderProjects();
}

function renderTabs() {
  const tabs = document.getElementById('project-tabs');
  if (!tabs) return;
  const counts = {
    projects: allProjects.filter(p => (p.bucket || 'projects') === 'projects').length,
    operations: allProjects.filter(p => p.bucket === 'operations').length,
    wiki: allProjects.filter(p => p.bucket === 'wiki').length
  };
  tabs.innerHTML = ['projects', 'operations', 'wiki'].map((bucket) => `
    <button class="project-tab ${activeBucket === bucket ? 'active' : ''}" data-bucket="${bucket}">
      ${bucket[0].toUpperCase() + bucket.slice(1)} (${counts[bucket] || 0})
    </button>
  `).join('');
  tabs.querySelectorAll('.project-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeBucket = btn.dataset.bucket;
      renderTabs();
      renderProjects();
    });
  });
}

function renderProjects() {
  const grid = document.getElementById('projects-grid');
  grid.innerHTML = '';
  const projects = allProjects
    .filter((project) => (project.bucket || 'projects') === activeBucket)
    .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0));
  if (!projects.length) {
    grid.innerHTML = '<div class="placeholder">No items in this bucket.</div>';
    return;
  }
  projects.forEach(project => {
    const priority = PRIORITY_MAP[project.id] || { level: 'Medium', reason: 'Active build' };
    const status = project.status || 'planning';
    const statusClass = String(status).toLowerCase().replace(/\s+/g, '-');
    const progress = Number.isFinite(project.progress) ? project.progress : (STATUS_PROGRESS[status] || 40);
    const ongoing = activeBucket !== 'projects';
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-title">${project.name}</div>
      <div class="project-desc">${project.description || ''}</div>
      <div class="project-meta">
        <span class="status-pill status-${statusClass}">${status}</span>
        <span class="priority-pill">${priority.level} · ${priority.reason}</span>
        <span>Owner: ${project.owner || '—'}</span>
        <span class="task-pill">${project.task_count || 0} tasks</span>
        ${(project.task_count || 0) === 0 ? '<span class="no-task-pill">⚠️ No tasks</span>' : ''}
      </div>
      <a class="view-tasks-link" href="/kanban?project=${encodeURIComponent(project.id)}">View Tasks</a>
      ${ongoing ? `<div class="ongoing-badge">${activeBucket === 'wiki' ? 'Wiki / Research' : 'Ongoing Operation'}</div>` : `<div class="progress-row"><span class="progress-label">${progress}%</span><div class="progress-bar"><span style="width:${progress}%"></span></div></div>`}
    `;
    card.querySelector('.view-tasks-link').addEventListener('click', (e) => e.stopPropagation());
    card.addEventListener('click', () => showDetail(project, priority, progress));
    grid.appendChild(card);
  });
}

async function showDetail(project, priority, progress) {
  const panel = document.getElementById('project-detail');
  const overlay = document.getElementById('project-overlay');
  document.getElementById('detail-name').textContent = project.name;
  const body = document.getElementById('detail-body');

  let tasks = [];
  try {
    const resp = await fetch('/api/kanban/tasks');
    const data = await resp.json();
    const projectTokens = [project.id, project.name, ...(project.tags || [])]
      .filter(Boolean)
      .map(t => String(t).toLowerCase());
    const taskList = Array.isArray(data) ? data : (data.tasks || []);
    tasks = taskList.filter(t => {
      const hay = `${t.title} ${t.description || ''} ${t.tags || ''}`.toLowerCase();
      return projectTokens.some(tok => tok && hay.includes(tok));
    });
  } catch (e) {
    tasks = [];
  }

  const openTasks = tasks.filter(t => t.column_name !== 'DONE');
  const nextTask = openTasks[0];

  body.innerHTML = `
    <div>${project.description || ''}</div>
    <div class="detail-row">
      <span class="detail-chip">Status: ${project.status}</span>
      <span class="detail-chip">Priority: ${priority.level}</span>
      <span class="detail-chip">Progress: ${progress}%</span>
    </div>
    <div><strong>Owner:</strong> ${project.owner || '—'}</div>
    <div><strong>Team:</strong> ${(project.team || []).join(', ') || '—'}</div>
    ${nextTask ? `<div><strong>What's next:</strong> ${nextTask.title}</div>` : '<div><strong>What\'s next:</strong> —</div>'}
    ${project.github_repo ? `<div><strong>Repo:</strong> ${project.github_repo}</div>` : ''}
    ${project.discord_channel ? `<div><strong>Discord:</strong> ${project.discord_channel}</div>` : ''}
    ${project.spec_path ? `<div><strong>Spec:</strong> ${project.spec_path}</div>` : ''}
    <div class="detail-row">${(project.tags || []).map(tag => `<span class="detail-chip">${tag}</span>`).join('')}</div>
    <div class="detail-section">
      <strong>Related Tasks</strong>
      ${tasks.length ? tasks.slice(0, 6).map(t => `<div class="detail-row">#${t.id} · ${t.title} <span class="detail-chip">${t.column_name}</span></div>`).join('') : '<div class="detail-row">No tasks found.</div>'}
    </div>
  `;
  panel.classList.add('open');
  overlay.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  loadProjects();
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('project-detail').classList.remove('open');
    document.getElementById('project-overlay').classList.add('hidden');
  });
  document.getElementById('project-overlay').addEventListener('click', () => {
    document.getElementById('project-detail').classList.remove('open');
    document.getElementById('project-overlay').classList.add('hidden');
  });
});
