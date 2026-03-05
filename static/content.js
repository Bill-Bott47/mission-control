const STAGES = ['trending','research','script','approved','visual','published'];
let pipelineData = { items: [] };
let draggedId = null;
let activeDetail = null;

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

  card.addEventListener('click', () => openDetail(item));

  return card;
}

function openDetail(item) {
  activeDetail = item;
  renderDetail(item);
  document.getElementById('content-overlay').classList.remove('hidden');
}

function closeDetail() {
  activeDetail = null;
  document.getElementById('content-overlay').classList.add('hidden');
}

function renderDetail(item) {
  const agent = inferAgent(item);
  const detail = document.getElementById('content-detail-body');
  const actions = document.getElementById('content-detail-actions');
  const created = item.created_at ? new Date(item.created_at).toLocaleString() : '—';
  const updated = item.updated_at ? new Date(item.updated_at).toLocaleString() : '—';
  const content = item.content || {};

  document.getElementById('content-detail-title').textContent = item.topic || 'Content Detail';

  detail.innerHTML = `
    <div><strong>Assigned Agent:</strong> ${escapeHtml(agent)}</div>
    <div><strong>Stage:</strong> ${escapeHtml(item.stage || 'trending')}</div>
    <div><strong>Source:</strong> ${escapeHtml(item.source || '—')}</div>
    <div><strong>Created:</strong> ${created}</div>
    <div><strong>Updated:</strong> ${updated}</div>
    ${content.research ? `<div><strong>Research</strong><div class="content-detail-block">${escapeHtml(content.research)}</div></div>` : ''}
    ${content.script ? `<div><strong>Script</strong><div class="content-detail-block">${escapeHtml(content.script)}</div></div>` : ''}
    ${content.visual_url ? `<div><strong>Visual</strong><div class="content-detail-block">${escapeHtml(content.visual_url)}</div></div>` : ''}
  `;

  const approveBtn = `<button class="btn btn-primary" data-action="approve">Approve</button>`;
  const rejectBtn = `<button class="btn btn-ghost" data-action="reject">Reject</button>`;
  const closeBtn = `<button class="btn btn-secondary" data-action="close">Close</button>`;

  actions.innerHTML = `${item.stage !== 'approved' && item.stage !== 'published' ? approveBtn : ''}
    ${!item.killed ? rejectBtn : ''}
    ${closeBtn}`;

  actions.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.action === 'approve') {
        await fetch(`/api/content-pipeline/${item.id}/approve`, { method: 'PUT' });
        await loadPipeline();
        const updated = pipelineData.items.find(i => i.id === item.id) || item;
        activeDetail = updated;
        renderDetail(updated);
      } else if (btn.dataset.action === 'reject') {
        await fetch(`/api/content-pipeline/${item.id}/kill`, { method: 'PUT' });
        await loadPipeline();
        const updated = pipelineData.items.find(i => i.id === item.id) || item;
        activeDetail = updated;
        renderDetail(updated);
      } else if (btn.dataset.action === 'close') {
        closeDetail();
      }
    });
  });
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
  document.getElementById('content-detail-close').addEventListener('click', closeDetail);
  document.getElementById('content-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'content-overlay') closeDetail();
  });
});
