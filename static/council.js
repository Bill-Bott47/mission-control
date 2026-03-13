let councilItems = [];

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
}

function formatScore(value) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(1);
}

function renderQueue() {
  const queueEl = document.getElementById('council-queue');
  if (!queueEl) return;
  queueEl.innerHTML = '';

  if (!councilItems.length) {
    queueEl.innerHTML = '<div class="council-empty">No pending approvals.</div>';
    return;
  }

  councilItems.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'council-queue-card';

    const votes = item.votes || {};
    const votesList = Object.entries(votes)
      .map(([name, data]) => {
        const score = data && data.score !== undefined ? ` (${data.score})` : '';
        const perspective = data && data.perspective ? data.perspective : '—';
        return `<li><strong>${name}${score}:</strong> ${perspective}</li>`;
      })
      .join('');

    card.innerHTML = `
      <div class="council-queue-title">${item.title || 'Untitled idea'}</div>
      <div class="council-queue-meta">${item.council || 'Council'} · ${item.category || 'general'} · ${formatDate(item.created_at)}</div>
      <div class="council-queue-metrics">
        <span class="council-pill">Verdict: ${item.verdict || '—'}</span>
        <span class="council-pill">Avg score: ${formatScore(item.avg_score)}</span>
        <span class="council-pill">Votes: ${item.passing_votes ?? 0}/${item.required_votes ?? 0}</span>
        <span class="council-pill">Members: ${item.total_members ?? '—'}</span>
      </div>
      <details class="council-box" open>
        <summary>Top objection</summary>
        <div class="council-body">${item.top_objection || '—'}</div>
      </details>
      <details class="council-box">
        <summary>Member votes</summary>
        <div class="council-body">
          <ul class="council-votes">${votesList || '<li>No votes recorded.</li>'}</ul>
        </div>
      </details>
    `;

    queueEl.appendChild(card);
  });
}

function renderSummary() {
  const summaryEl = document.getElementById('council-summary');
  if (!summaryEl) return;
  summaryEl.innerHTML = '';

  if (!councilItems.length) {
    summaryEl.innerHTML = '<div class="council-empty">No active council items.</div>';
    return;
  }

  const totals = councilItems.reduce((acc, item) => {
    const key = item.council || 'Council';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  Object.entries(totals).forEach(([council, count]) => {
    const card = document.createElement('div');
    card.className = 'council-summary-card';
    card.innerHTML = `
      <div class="council-summary-title">${council}</div>
      <div class="council-summary-count">${count} pending</div>
    `;
    summaryEl.appendChild(card);
  });
}

async function loadCouncilQueue() {
  try {
    const resp = await fetch('/api/council/queue');
    const data = await resp.json();
    councilItems = data.items || [];
    renderQueue();
    renderSummary();
  } catch (err) {
    const queueEl = document.getElementById('council-queue');
    if (queueEl) {
      queueEl.innerHTML = '<div class="council-empty">Unable to load council queue.</div>';
    }
  }
}

document.addEventListener('DOMContentLoaded', loadCouncilQueue);
