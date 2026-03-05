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
  const longsEl = document.getElementById('signals-longs');
  const shortsEl = document.getElementById('signals-shorts');
  const note = document.getElementById('signals-note');
  longsEl.innerHTML = '';
  shortsEl.innerHTML = '';
  if (note) note.classList.add('hidden');
  if (!items.length) {
    longsEl.innerHTML = '<div class="placeholder">No signals available.</div>';
    shortsEl.innerHTML = '<div class="placeholder">No signals available.</div>';
    return;
  }

  const sorted = [...items].sort((a, b) => {
    const at = new Date(a.time || a.timestamp || a.created_at || 0).getTime() || 0;
    const bt = new Date(b.time || b.timestamp || b.created_at || 0).getTime() || 0;
    return bt - at;
  });

  const longs = sorted.filter((item) => (item.direction || '').toLowerCase() === 'long');
  const shorts = sorted.filter((item) => (item.direction || '').toLowerCase() === 'short');
  let allMissingLevels = true;
  const buildRow = (item) => {
    const row = document.createElement('div');
    row.className = 'signal-row';
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
    const symbol = item.symbol || item.asset || item.pair || '—';
    const assetName = item.asset_name || symbol;
    if (!isMissingLevel(rawSl) || !isMissingLevel(rawTp1) || !isMissingLevel(rawTp2)) {
      allMissingLevels = false;
    }

    row.innerHTML = `
      <div class="signal-line-1">
        <span class="signal-direction ${dir}">${(item.direction || '—').toUpperCase()}</span>
        <span class="signal-asset">${assetName}</span>
        <span class="signal-symbol">${symbol}</span>
      </div>
      <div class="signal-line-2">
        <span>${time === '—' ? '—' : new Date(time).toLocaleString()}</span>
        <span>${pattern}</span>
        <span>${confidence}</span>
        <span>Entry ${entry}</span>
        <span>TP ${tp1}</span>
        <span>SL ${sl}</span>
      </div>
    `;
    return row;
  };

  longs.forEach((item) => longsEl.appendChild(buildRow(item)));
  shorts.forEach((item) => shortsEl.appendChild(buildRow(item)));
  if (!longs.length) longsEl.innerHTML = '<div class="placeholder">No long signals.</div>';
  if (!shorts.length) shortsEl.innerHTML = '<div class="placeholder">No short signals.</div>';

  if (note && allMissingLevels) {
    note.textContent = 'SL/TP auto-calculation coming soon';
    note.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', loadSignalsPage);
