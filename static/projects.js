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

async function loadProjects() {
  const resp = await fetch('/api/projects');
  const data = await resp.json();
  renderProjects(data.projects || []);
}

function renderProjects(projects) {
  const grid = document.getElementById('projects-grid');
  grid.innerHTML = '';
  projects.forEach(project => {
    const priority = PRIORITY_MAP[project.id] || { level: 'Medium', reason: 'Active build' };
    const status = project.status || 'planning';
    const progress = STATUS_PROGRESS[status] || 40;
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-title">${project.name}</div>
      <div class="project-desc">${project.description || ''}</div>
      <div class="project-meta">
        <span class="status-pill status-${status}">${status}</span>
        <span class="priority-pill">${priority.level} · ${priority.reason}</span>
        <span>Owner: ${project.owner || '—'}</span>
      </div>
      <div class="progress-bar"><span style="width:${progress}%"></span></div>
    `;
    card.addEventListener('click', () => showDetail(project, priority, progress));
    grid.appendChild(card);
  });
}

function showDetail(project, priority, progress) {
  const panel = document.getElementById('project-detail');
  document.getElementById('detail-name').textContent = project.name;
  const body = document.getElementById('detail-body');
  body.innerHTML = `
    <div>${project.description || ''}</div>
    <div class="detail-row">
      <span class="detail-chip">Status: ${project.status}</span>
      <span class="detail-chip">Priority: ${priority.level}</span>
      <span class="detail-chip">Progress: ${progress}%</span>
    </div>
    <div><strong>Owner:</strong> ${project.owner || '—'}</div>
    <div><strong>Forge Status:</strong> ${project.forge_status || '—'}</div>
    ${project.github_repo ? `<div><strong>Repo:</strong> ${project.github_repo}</div>` : ''}
    ${project.discord_channel ? `<div><strong>Discord:</strong> ${project.discord_channel}</div>` : ''}
    ${project.spec_path ? `<div><strong>Spec:</strong> ${project.spec_path}</div>` : ''}
    <div class="detail-row">${(project.tags || []).map(tag => `<span class="detail-chip">${tag}</span>`).join('')}</div>
  `;
  panel.classList.add('open');
}

document.addEventListener('DOMContentLoaded', () => {
  loadProjects();
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('project-detail').classList.remove('open');
  });
});
