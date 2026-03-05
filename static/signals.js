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

function isMissingLevel(value) {
  return value === null || value === undefined || value === '' || String(value).toLowerCase() === 'null';
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
  const note = document.getElementById('signals-note');
  grid.innerHTML = '';
  if (note) note.classList.add('hidden');
  if (!items.length) {
    grid.innerHTML = '<div class="placeholder">No signals available.</div>';
    return;
  }

  let allMissingLevels = true;
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'signal-card';
    const dir = (item.direction || '').toLowerCase();
    const time = item.time || item.timestamp || item.created_at || '—';
    const pattern = item.pattern || item.setup || item.model || '—';
    const confidence = item.confidence || item.confidence_score || '—';
    const entry = asDisplay(item.entry || item.price || item.entry_price);
    const rawSl = item.sl ?? item.stop ?? item.stop_loss;
    const rawTp1 = item.tp1 ?? item.target1;
    const rawTp2 = item.tp2 ?? item.target2;
    const sl = asDisplay(rawSl);
    const tp1 = asDisplay(rawTp1);
    const tp2 = asDisplay(rawTp2);
    const asset = item.symbol || item.asset || item.pair || '—';
    if (!isMissingLevel(rawSl) || !isMissingLevel(rawTp1) || !isMissingLevel(rawTp2)) {
      allMissingLevels = false;
    }

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

  if (note && allMissingLevels) {
    note.textContent = 'SL/TP auto-calculation coming soon';
    note.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', loadSignalsPage);
