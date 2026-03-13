let approvals = [];
let selectedApprovalId = null;

const STATUS_LABELS = {
  pending_approval: 'pending',
  approved: 'approved',
  skipped: 'skipped'
};

function showBanner(message) {
  const el = document.getElementById('approval-banner');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

async function loadApprovals() {
  const resp = await fetch('/api/council/queue?all=1');
  const data = await resp.json();
  approvals = data.items || [];
  renderApprovals();
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'unknown';
}

function approvalMetaText(item) {
  const council = item.council || 'Council';
  const category = item.category ? item.category.toUpperCase() : 'GENERAL';
  const created = item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown date';
  return `${council} · ${category} · ${created}`;
}

function renderCard(item, listEl) {
  const card = document.createElement('div');
  card.className = 'approval-card';
  if (selectedApprovalId === item.id) card.classList.add('selected');
  card.dataset.id = String(item.id);
  const score = item.avg_score ? `Score ${Number(item.avg_score).toFixed(1)}` : 'Score —';
  card.innerHTML = `
    <div class="approval-title">${item.title}</div>
    <div class="approval-desc">${item.top_objection || item.verdict || ''}</div>
    <div class="approval-meta">${approvalMetaText(item)} · ${score} · <span class="approval-status status-${statusLabel(item.status)}">${statusLabel(item.status)}</span></div>
  `;
  card.addEventListener('click', () => showDetail(item));
  listEl.appendChild(card);
}

function renderApprovals() {
  const openList = document.getElementById('approvals-list');
  const resolvedList = document.getElementById('resolved-list');
  openList.innerHTML = '';
  resolvedList.innerHTML = '';

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const openItems = approvals.filter((item) => item.status === 'pending_approval');
  const resolvedItems = approvals.filter((item) => {
    if (!['approved', 'skipped'].includes(item.status)) return false;
    const timestamp = item.actioned_at || item.created_at;
    if (!timestamp) return false;
    const t = new Date(timestamp).getTime();
    return Number.isFinite(t) && (now - t) <= sevenDaysMs;
  });

  if (!openItems.length) {
    openList.innerHTML = '<div class="placeholder">No approvals in queue.</div>';
  } else {
    openItems.forEach((item) => renderCard(item, openList));
  }

  if (!resolvedItems.length) {
    resolvedList.innerHTML = '<div class="placeholder">No recently resolved approvals.</div>';
  } else {
    resolvedItems.forEach((item) => renderCard(item, resolvedList));
  }

  const selected = approvals.find((item) => item.id === selectedApprovalId) || openItems[0] || resolvedItems[0];
  if (selected) showDetail(selected);
}

function renderVotes(item) {
  if (!item.votes) return '<div>Votes unavailable.</div>';
  return Object.entries(item.votes)
    .map(([name, vote]) => `<div><strong>${name}:</strong> ${vote.score} — ${vote.perspective}</div>`)
    .join('');
}

function showDetail(item) {
  selectedApprovalId = item.id;
  document.querySelectorAll('.approval-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.id === String(item.id));
  });

  const detail = document.getElementById('approval-detail-body');
  detail.innerHTML = `
    <div><strong>Title:</strong> ${item.title}</div>
    <div><strong>Council:</strong> ${item.council || '—'}</div>
    <div><strong>Category:</strong> ${item.category || '—'}</div>
    <div><strong>Verdict:</strong> ${item.verdict || '—'}</div>
    <div><strong>Average Score:</strong> ${item.avg_score || '—'} (${item.passing_votes || 0}/${item.total_members || 0})</div>
    <div><strong>Top Objection:</strong> ${item.top_objection || '—'}</div>
    <div><strong>Status:</strong> <span class="approval-status status-${statusLabel(item.status)}">${statusLabel(item.status)}</span></div>
    <div><strong>Votes:</strong></div>
    <div class="vote-list">${renderVotes(item)}</div>
    <div class="detail-actions">
      <button class="btn btn-primary" data-action="approve">Approve</button>
      <button class="btn btn-ghost" data-action="skip">Skip</button>
    </div>
  `;

  detail.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const result = await updateApproval(item.id, btn.dataset.action);
      if (result) showBanner('✅ Decision saved — routed to feedback log');
      await loadApprovals();
    });
  });
}

async function updateApproval(id, action) {
  const resp = await fetch('/api/council/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action })
  });
  if (!resp.ok) return null;
  return resp.json();
}

document.addEventListener('DOMContentLoaded', loadApprovals);
