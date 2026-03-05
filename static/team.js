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
  const { agent, task_groups, next_runs, prompt_excerpt, rules_confirmed } = data;
  const detail = document.getElementById('team-detail-body');
  document.getElementById('team-detail-title').textContent = `${agent.emoji || ''} ${agent.name}`;

  const renderTaskRows = (items) => (
    items && items.length
      ? items.map(t => `<div class="detail-row">#${t.id} · ${t.title} <span class="detail-chip">${t.column}</span></div>`).join('')
      : '<div class="detail-row">None</div>'
  );

  const runsHtml = next_runs.length
    ? next_runs.slice(0, 6).map(r => `<div class="detail-row">${r.name} · ${r.schedule} · ${formatTimeMs(r.next_run_at)}</div>`).join('')
    : '<div class="detail-row">No scheduled runs.</div>';

  detail.innerHTML = `
    <div><strong>Role:</strong> ${agent.role}</div>
    <div><strong>Description:</strong> ${agent.notes || '—'}</div>
    <div><strong>Status:</strong> ${agent.status} · <strong>Last Active:</strong> ${agent.last_active}</div>
    <div class="detail-section">
      <h3>Tasks by Status</h3>
      <div class="task-group-grid">
        <div class="task-group-box">
          <h4>Working On</h4>
          ${renderTaskRows(task_groups?.working_on || [])}
        </div>
        <div class="task-group-box">
          <h4>Next Up</h4>
          ${renderTaskRows(task_groups?.next_up || [])}
        </div>
        <div class="task-group-box">
          <h4>Blocked</h4>
          ${renderTaskRows(task_groups?.blocked || [])}
        </div>
        <div class="task-group-box">
          <h4>Completed</h4>
          ${renderTaskRows(task_groups?.completed || [])}
        </div>
      </div>
    </div>
    <div class="detail-section">
      <h3>Next Scheduled Runs</h3>
      ${runsHtml}
    </div>
    <div class="detail-section">
      <h3>Rules of the Road</h3>
      <div class="detail-row">${rules_confirmed ? 'Confirmed in prompt' : 'Needs prompt rule update'}</div>
      <div class="detail-row">Escalation: 2 consecutive Forge FAILs trigger Jonathan escalation.</div>
      <div class="detail-row">Escalation: security or financial risk halts execution and notifies Jonathan.</div>
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
