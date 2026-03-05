let approvals = [];
let selectedApprovalId = null;

function showBanner(message) {
  const el = document.getElementById('approval-banner');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

async function loadApprovals() {
  const resp = await fetch('/api/approvals');
  const data = await resp.json();
  approvals = data.approvals || [];
  renderApprovals();
}

function approvalMetaText(item) {
  return `${item.submitted_by || 'Unknown'} · ${new Date(item.created_at).toLocaleString()}`;
}

function renderCard(item, listEl) {
  const card = document.createElement('div');
  card.className = 'approval-card';
  if (selectedApprovalId === item.id) card.classList.add('selected');
  card.dataset.id = String(item.id);
  card.innerHTML = `
    <div class="approval-title">${item.title}</div>
    <div class="approval-desc">${item.description || ''}</div>
    <div class="approval-meta">${approvalMetaText(item)} · <span class="approval-status status-${item.status}">${item.status}</span></div>
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

  const openItems = approvals.filter((item) => item.status === 'pending');
  const resolvedItems = approvals.filter((item) => {
    if (!['approved', 'rejected'].includes(item.status)) return false;
    if (!item.resolved_at) return false;
    const t = new Date(item.resolved_at).getTime();
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

function showDetail(item) {
  selectedApprovalId = item.id;
  document.querySelectorAll('.approval-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.id === String(item.id));
  });

  const detail = document.getElementById('approval-detail-body');
  detail.innerHTML = `
    <div><strong>Title:</strong> ${item.title}</div>
    <div><strong>Submitted by:</strong> ${item.submitted_by || '—'}</div>
    <div><strong>Description:</strong> ${item.description || '—'}</div>
    <div><strong>Status:</strong> <span class="approval-status status-${item.status}">${item.status}</span></div>
    <label for="reply-text">Reply</label>
    <textarea class="reply-input" id="reply-text" rows="4" placeholder="Type Jonathan's reply...">${item.reply_text || ''}</textarea>
    <div class="detail-actions">
      <button class="btn btn-primary" data-action="approve">Approve</button>
      <button class="btn btn-ghost" data-action="reject">Reject</button>
      <button class="btn btn-secondary" data-action="reply">Send Reply</button>
    </div>
  `;

  detail.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const replyText = document.getElementById('reply-text').value;
      let result = null;
      if (btn.dataset.action === 'approve') {
        result = await updateApproval(item.id, 'approved', replyText);
      } else if (btn.dataset.action === 'reject') {
        result = await updateApproval(item.id, 'rejected', replyText);
      } else {
        result = await updateApproval(item.id, item.status, replyText);
      }
      if (result?.routed_to_discord) {
        showBanner('✅ Reply routed to Discord #inbox');
      } else {
        showBanner('✅ Reply saved');
      }
      await loadApprovals();
    });
  });
}

async function updateApproval(id, status, replyText) {
  const resp = await fetch(`/api/approvals/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reply_text: replyText })
  });
  if (!resp.ok) return null;
  return resp.json();
}

document.addEventListener('DOMContentLoaded', loadApprovals);
