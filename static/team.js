async function fetchTeamDetail(slug) {
  const resp = await fetch(`/api/team/${slug}/detail`);
  if (!resp.ok) return null;
  return resp.json();
}

function formatTimeMs(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString();
}

function renderDetail(data) {
  const { agent, tasks, next_runs, prompt_excerpt } = data;
  const detail = document.getElementById('team-detail-body');
  document.getElementById('team-detail-title').textContent = `${agent.emoji || ''} ${agent.name}`;

  const tasksHtml = tasks.length
    ? tasks.map(t => `<div class="detail-row">#${t.id} · ${t.title} <span class="detail-chip">${t.column}</span></div>`).join('')
    : '<div class="detail-row">No assigned tasks.</div>';

  const runsHtml = next_runs.length
    ? next_runs.slice(0, 6).map(r => `<div class="detail-row">${r.name} · ${r.schedule} · ${formatTimeMs(r.next_run_at)}</div>`).join('')
    : '<div class="detail-row">No scheduled runs.</div>';

  detail.innerHTML = `
    <div><strong>Role:</strong> ${agent.role}</div>
    <div><strong>Description:</strong> ${agent.notes || '—'}</div>
    <div><strong>Status:</strong> ${agent.status} · <strong>Last Active:</strong> ${agent.last_active}</div>
    <div class="detail-section">
      <h3>Current Tasks</h3>
      ${tasksHtml}
    </div>
    <div class="detail-section">
      <h3>Next Scheduled Runs</h3>
      ${runsHtml}
    </div>
    <div class="detail-section">
      <h3>Prompt Excerpt</h3>
      <div class="detail-block">${prompt_excerpt || '—'}</div>
    </div>
  `;
}

function openModal() {
  document.getElementById('team-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('team-overlay').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.agent-card').forEach(card => {
    card.classList.add('clickable');
    card.addEventListener('click', async () => {
      const slug = card.dataset.slug;
      if (!slug) return;
      const data = await fetchTeamDetail(slug);
      if (!data) return;
      renderDetail(data);
      openModal();
    });
  });

  document.getElementById('team-detail-close').addEventListener('click', closeModal);
  document.getElementById('team-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'team-overlay') closeModal();
  });
});
