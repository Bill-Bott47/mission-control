let approvals = [];

async function loadApprovals() {
  const resp = await fetch('/api/approvals');
  const data = await resp.json();
  approvals = data.approvals || [];
  renderApprovals();
}

function renderApprovals() {
  const list = document.getElementById('approvals-list');
  list.innerHTML = '';
  if (!approvals.length) {
    list.innerHTML = '<div class="placeholder">No approvals in queue.</div>';
    return;
  }
  approvals.forEach(item => {
    const card = document.createElement('div');
    card.className = 'approval-card';
    card.innerHTML = `
      <div class="approval-title">${item.title}</div>
      <div class="approval-desc">${item.description || ''}</div>
      <div class="approval-meta">${item.submitted_by || 'Unknown'} · ${new Date(item.created_at).toLocaleString()} · <span class="approval-status status-${item.status}">${item.status}</span></div>
    `;
    card.addEventListener('click', () => showDetail(item));
    list.appendChild(card);
  });
  if (approvals[0]) showDetail(approvals[0]);
}

function showDetail(item) {
  const detail = document.getElementById('approval-detail-body');
  detail.innerHTML = `
    <div><strong>Title:</strong> ${item.title}</div>
    <div><strong>Submitted by:</strong> ${item.submitted_by || '—'}</div>
    <div><strong>Description:</strong> ${item.description || '—'}</div>
    <div><strong>Status:</strong> ${item.status}</div>
    <label>Reply</label>
    <textarea class="reply-input" id="reply-text" rows="3">${item.reply_text || ''}</textarea>
    <div class="detail-actions">
      <button class="btn btn-primary" data-action="approve">Approve</button>
      <button class="btn btn-ghost" data-action="reject">Reject</button>
      <button class="btn btn-secondary" data-action="reply">Save Reply</button>
    </div>
  `;
  detail.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const replyText = document.getElementById('reply-text').value;
      if (btn.dataset.action === 'approve') {
        await updateApproval(item.id, 'approved', replyText);
      } else if (btn.dataset.action === 'reject') {
        await updateApproval(item.id, 'rejected', replyText);
      } else {
        await updateApproval(item.id, item.status, replyText);
      }
      await loadApprovals();
    });
  });
}

async function updateApproval(id, status, replyText) {
  await fetch(`/api/approvals/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reply_text: replyText })
  });
}

document.addEventListener('DOMContentLoaded', loadApprovals);
