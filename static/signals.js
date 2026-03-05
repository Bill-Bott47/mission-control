async function loadSignalsPage() {
  const resp = await fetch('/api/signals');
  const data = await resp.json();
  const items = data.items || data.signals || [];
  renderSignals(items);
}

function renderSignals(items) {
  const grid = document.getElementById('signals-grid');
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<div class="placeholder">No signals available.</div>';
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'signal-card';
    const dir = (item.direction || '').toLowerCase();
    const time = item.time || item.timestamp || item.created_at || '—';
    const pattern = item.pattern || item.setup || item.model || '—';
    const confidence = item.confidence || item.confidence_score || '—';
    const entry = item.entry || item.price || item.entry_price || '—';
    const sl = item.sl || item.stop || item.stop_loss || '—';
    const tp1 = item.tp1 || item.target1 || '—';
    const tp2 = item.tp2 || item.target2 || '—';
    const asset = item.symbol || item.asset || item.pair || '—';

    card.innerHTML = `
      <div class="signal-header">
        <div class="signal-asset">${asset}</div>
        <div class="signal-direction ${dir}">${(item.direction || '—').toUpperCase()}</div>
      </div>
      <div class="signal-meta">
        <div><strong>Time:</strong> ${time}</div>
        <div><strong>Pattern:</strong> ${pattern}</div>
        <div><strong>Confidence:</strong> ${confidence}</div>
        <div><strong>Entry:</strong> ${entry}</div>
      </div>
      <div class="signal-levels">
        <div class="signal-level"><strong>SL:</strong> ${sl || '—'}</div>
        <div class="signal-level"><strong>TP1:</strong> ${tp1 || '—'}</div>
        <div class="signal-level"><strong>TP2:</strong> ${tp2 || '—'}</div>
      </div>
      <div class="signal-actions">
        <a href="https://discord.com/channels/1475879552101257328/1475882686840311982" target="_blank">View in Discord</a>
      </div>
    `;
    grid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', loadSignalsPage);
