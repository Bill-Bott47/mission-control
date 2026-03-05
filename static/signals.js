function fmtAgo(seconds) {
  const s = Number(seconds || 0);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function asDisplay(value, prefixDollar = false) {
  if (value === null || value === undefined || value === '') return '—';
  if (prefixDollar && typeof value === 'number') return `$${value}`;
  return String(value);
}

async function loadSignalsPage() {
  const resp = await fetch('/api/signals');
  const data = await resp.json();
  const items = data.items || [];
  const meta = document.getElementById('signals-meta');
  if (meta) {
    const stamp = data.data_updated_at || data.updated_at;
    meta.textContent = stamp ? `Last updated: ${fmtAgo(data.age_seconds || 0)} (${new Date(stamp).toLocaleString()})` : 'Last updated: unknown';
  }

  const staleEl = document.getElementById('signals-stale');
  if (staleEl) {
    if (data.stale) {
      staleEl.textContent = `⚠️ Stale — last update ${fmtAgo(data.age_seconds || 0)}`;
      staleEl.classList.remove('hidden');
    } else {
      staleEl.classList.add('hidden');
    }
  }

  renderSignals(items);
}

function renderSignals(items) {
  const grid = document.getElementById('signals-grid');
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<div class="placeholder">No signals available.</div>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'signal-card';
    const dir = (item.direction || '').toLowerCase();
    const time = item.time || item.timestamp || item.created_at || '—';
    const pattern = item.pattern || item.setup || item.model || '—';
    const confidence = item.confidence || item.confidence_score || '—';
    const entry = asDisplay(item.entry || item.price || item.entry_price);
    const sl = asDisplay(item.sl || item.stop || item.stop_loss);
    const tp1 = asDisplay(item.tp1 || item.target1);
    const tp2 = asDisplay(item.tp2 || item.target2);
    const asset = item.symbol || item.asset || item.pair || '—';

    card.innerHTML = `
      <div class="signal-header">
        <div class="signal-asset">${asset}</div>
        <div class="signal-direction ${dir}">${(item.direction || '—').toUpperCase()}</div>
      </div>
      <div class="signal-meta">
        <div><strong>Time:</strong> ${time === '—' ? '—' : new Date(time).toLocaleString()}</div>
        <div><strong>Pattern:</strong> ${pattern}</div>
        <div><strong>Confidence:</strong> ${confidence}</div>
        <div><strong>Entry:</strong> ${entry}</div>
      </div>
      <div class="signal-levels">
        <div class="signal-level"><strong>SL:</strong> ${sl}</div>
        <div class="signal-level"><strong>TP1:</strong> ${tp1}</div>
        <div class="signal-level"><strong>TP2:</strong> ${tp2}</div>
      </div>
      <div class="signal-actions">
        <a href="https://discord.com/channels/1475879552101257328/1475882686840311982" target="_blank" rel="noopener noreferrer">View in Discord</a>
      </div>
    `;
    grid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', loadSignalsPage);
