const STAGES = ['trending','research','script','visual','approved','published'];
let pipelineData = { items: [] };
let draggedId = null;

const agentFallbacks = {
  trending: 'Scout',
  research: 'Scrub',
  script: 'Quill',
  visual: 'Pixel',
  approved: 'Content PM',
  published: 'Content PM'
};

function inferAgent(item) {
  if (item.assigned_agent) return item.assigned_agent;
  const source = (item.source || '').toLowerCase();
  if (source.includes('scrub')) return 'Scrub';
  if (source.includes('quill')) return 'Quill';
  if (source.includes('pixel')) return 'Pixel';
  return agentFallbacks[item.stage] || 'Content PM';
}

async function loadPipeline() {
  const resp = await fetch('/api/content-pipeline');
  pipelineData = await resp.json();
  renderPipeline();
}

function renderPipeline() {
  STAGES.forEach(stage => {
    const el = document.getElementById(`stage-${stage}`);
    if (!el) return;
    const items = pipelineData.items.filter(i => (i.stage || 'trending') === stage && !i.killed);
    el.innerHTML = '';
    document.querySelector(`.pipeline-stage[data-stage="${stage}"] .count`).textContent = items.length;
    items.forEach(item => el.appendChild(buildCard(item)));
  });

  renderRejected();
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = `pipeline-card`;
  card.draggable = true;
  card.dataset.id = item.id;
  const agent = inferAgent(item);
  const created = item.created_at ? new Date(item.created_at).toLocaleDateString() : '—';

  card.innerHTML = `
    <div class="pipeline-title">${escapeHtml(item.topic || 'Untitled')}</div>
    <div class="pipeline-meta">
      <span class="pipeline-tag">${agent}</span>
      <span>${escapeHtml(item.stage || 'trending')}</span>
      <span>${created}</span>
    </div>
    <div class="pipeline-actions">
      ${item.stage !== 'approved' && item.stage !== 'published' ? '<button class="btn btn-secondary" data-action="approve">Approve</button>' : ''}
      ${!item.killed ? '<button class="btn btn-ghost" data-action="reject">Reject</button>' : ''}
    </div>
  `;

  card.addEventListener('dragstart', () => {
    draggedId = item.id;
    card.classList.add('dragging');
  });

  card.addEventListener('dragend', () => {
    draggedId = null;
    card.classList.remove('dragging');
  });

  card.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.dataset.action === 'approve') {
        await fetch(`/api/content-pipeline/${item.id}/approve`, { method: 'PUT' });
      } else if (btn.dataset.action === 'reject') {
        await fetch(`/api/content-pipeline/${item.id}/kill`, { method: 'PUT' });
      }
      await loadPipeline();
    });
  });

  return card;
}

function renderRejected() {
  const killed = pipelineData.items.filter(i => i.killed);
  let section = document.getElementById('killed-section');
  if (!section) {
    section = document.createElement('section');
    section.id = 'killed-section';
    section.className = 'rejected-section';
    section.innerHTML = '<h2>Rejected / Killed</h2><div class="rejected-grid" id="rejected-grid"></div>';
    document.querySelector('.pipeline-board').after(section);
  }
  const grid = document.getElementById('rejected-grid');
  grid.innerHTML = '';
  killed.forEach(item => {
    const card = document.createElement('div');
    card.className = 'pipeline-card pipeline-killed';
    const agent = inferAgent(item);
    const created = item.created_at ? new Date(item.created_at).toLocaleDateString() : '—';
    card.innerHTML = `
      <div class="pipeline-title">${escapeHtml(item.topic || 'Untitled')}</div>
      <div class="pipeline-meta">
        <span class="pipeline-tag">${agent}</span>
        <span>killed</span>
        <span>${created}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function addContent() {
  const topic = prompt('Content topic/title:');
  if (!topic) return;
  const source = prompt('Source (e.g. Twitter/@handle):') || 'unknown';
  const payload = { topic, source, stage: 'trending' };
  await fetch('/api/content-pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadPipeline();
}

function setupDrag() {
  document.querySelectorAll('.pipeline-stage').forEach(stage => {
    stage.addEventListener('dragover', e => e.preventDefault());
    stage.addEventListener('drop', async e => {
      e.preventDefault();
      if (!draggedId) return;
      const newStage = stage.dataset.stage;
      await fetch(`/api/content-pipeline/${draggedId}/stage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage })
      });
      await loadPipeline();
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  loadPipeline();
  setupDrag();
  document.getElementById('add-content').addEventListener('click', addContent);
  document.getElementById('refresh-pipeline').addEventListener('click', loadPipeline);
});
