const providerGrid = document.getElementById('provider-grid');
const minimaxBody = document.getElementById('minimax-body');
const minimaxMeta = document.getElementById('minimax-meta');
const channelTable = document.getElementById('channel-table');
const channelMeta = document.getElementById('channel-meta');
const reportDaily = document.getElementById('report-daily');
const reportMonthly = document.getElementById('report-monthly');
const reportMeta = document.getElementById('report-meta');

const statusClass = (status) => {
  if (!status) return 'warn';
  const normalized = status.toLowerCase();
  if (['ok', 'online', 'up', 'healthy', 'running'].includes(normalized)) return 'up';
  if (['dead', 'down', 'error', 'billing-error', 'offline', 'stopped'].includes(normalized)) return 'down';
  return 'warn';
};

const renderProviders = (providers) => {
  if (!providers || providers.length === 0) {
    providerGrid.innerHTML = '<div class="card">No provider data available.</div>';
    return;
  }

  providerGrid.innerHTML = providers.map((provider) => {
    const state = statusClass(provider.status);
    return `
      <div class="provider-card">
        <div class="provider-header">
          <div class="provider-title">${provider.name}</div>
          <div class="provider-status ${state}">
            <span class="provider-dot"></span>
            ${provider.status || 'unknown'}
          </div>
        </div>
        <div class="provider-cost">${provider.cost || '—'}</div>
        <div class="provider-meta">${provider.usage || ''}</div>
        <div class="provider-note">${provider.note || ''}</div>
      </div>
    `;
  }).join('');
};

const renderMinimax = (payload) => {
  if (!payload || payload.error) {
    minimaxBody.textContent = payload?.error || 'MiniMax usage unavailable.';
    minimaxMeta.textContent = 'Error';
    return;
  }

  const models = payload.models || [];
  minimaxMeta.textContent = payload.window_remaining || 'Rolling window';

  if (!models.length) {
    minimaxBody.textContent = 'No usage details returned.';
    return;
  }

  minimaxBody.innerHTML = models.map((model) => {
    const used = Number(model.used || 0);
    const total = Number(model.total || 0);
    const remaining = Number(model.remaining || 0);
    const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;

    return `
      <div class="minimax-row">
        <div class="minimax-row-header">
          <strong>${model.name || 'Model'}</strong>
          <span>${pct}%</span>
        </div>
        <div class="progress-bar"><span style="width:${pct}%"></span></div>
        <div class="minimax-foot">${used.toLocaleString()} used / ${total.toLocaleString()} total • ${remaining.toLocaleString()} remaining</div>
      </div>
    `;
  }).join('');
};

const renderChannels = (channels) => {
  if (!channels || channels.length === 0) {
    channelTable.innerHTML = '<div class="placeholder">No channel burn data.</div>';
    return;
  }

  const topFive = [...channels].sort((a, b) => (b.total_calls_per_day || 0) - (a.total_calls_per_day || 0)).slice(0, 5);

  channelTable.innerHTML = topFive.map((channel) => `
    <div class="channel-card-item">
      <div class="channel-title">${channel.channel_name || 'Unknown channel'}</div>
      <div class="channel-usage">${Number(channel.total_calls_per_day || 0).toLocaleString()} calls/day</div>
    </div>
  `).join('');
};

const escapeHtml = (text) => {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const renderMarkdown = (raw) => {
  if (!raw) return '';
  const lines = escapeHtml(raw).split('\n');
  let html = '';
  let inList = false;

  const flushList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };

  lines.forEach((line) => {
    if (line.startsWith('### ')) {
      flushList();
      html += `<h4>${line.slice(4)}</h4>`;
      return;
    }
    if (line.startsWith('## ')) {
      flushList();
      html += `<h3>${line.slice(3)}</h3>`;
      return;
    }
    if (line.startsWith('# ')) {
      flushList();
      html += `<h2>${line.slice(2)}</h2>`;
      return;
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${line.slice(2)}</li>`;
      return;
    }

    flushList();
    if (line.trim() === '') {
      html += '<br>';
    } else {
      const bolded = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html += `<p>${bolded}</p>`;
    }
  });

  flushList();
  return html;
};

const renderReports = (payload) => {
  if (!payload || payload.error) {
    reportDaily.textContent = payload?.error || 'Reports unavailable.';
    reportMonthly.textContent = '';
    return;
  }

  reportDaily.innerHTML = renderMarkdown(payload.daily || '');
  reportMonthly.innerHTML = renderMarkdown(payload.monthly || '');
  if (payload.updated_at) {
    reportMeta.textContent = `Updated ${new Date(payload.updated_at).toLocaleString()}`;
  }
};

const renderCodex = (data) => {
  const el = document.getElementById('codex-body');
  if (!el) return;
  if (!data || data.error) {
    el.textContent = data?.error || 'Codex data unavailable';
    return;
  }

  const fmt = (n) => Number(n || 0).toLocaleString();
  el.innerHTML = `
    <div class="codex-stats">
      <div class="codex-stat">
        <div class="codex-stat-value">${fmt(data.last_24h_tokens)}</div>
        <div class="codex-stat-label">Today (${fmt(data.last_24h_sessions)} sessions)</div>
      </div>
      <div class="codex-stat">
        <div class="codex-stat-value">${fmt(data.last_7d_tokens)}</div>
        <div class="codex-stat-label">This week (${fmt(data.last_7d_sessions)} sessions)</div>
      </div>
    </div>
  `;
};

const loadCoreUsage = async () => {
  try {
    const [providerRes, minimaxRes, codexRes] = await Promise.all([
      fetch('/api/usage/providers'),
      fetch('/api/usage/minimax'),
      fetch('/api/usage/codex')
    ]);

    const providers = await providerRes.json();
    renderProviders(providers.providers || providers);

    const minimax = await minimaxRes.json();
    renderMinimax(minimax);

    const codex = await codexRes.json();
    renderCodex(codex);
  } catch (err) {
    providerGrid.innerHTML = '<div class="card">Failed to load usage data.</div>';
  }
};

const loadChannels = async () => {
  try {
    const channelRes = await fetch('/api/usage/channels');
    const channels = await channelRes.json();
    renderChannels(channels.channels || channels);
    if (channels.updated_at) {
      channelMeta.textContent = `Updated ${new Date(channels.updated_at).toLocaleString()}`;
    }
  } catch (err) {
    channelTable.innerHTML = '<div class="placeholder">Channel burn unavailable.</div>';
  }
};

const loadReports = async () => {
  try {
    const reportRes = await fetch('/api/usage/reports');
    const reports = await reportRes.json();
    renderReports(reports);
  } catch (err) {
    reportDaily.textContent = 'Reports unavailable.';
    reportMonthly.textContent = '';
  }
};

const setupLazyLoading = () => {
  const channelCard = document.getElementById('channel-card');
  const reportCard = document.getElementById('report-card');
  let channelsLoaded = false;
  let reportsLoaded = false;

  const loadChannelsOnce = () => {
    if (channelsLoaded) return;
    channelsLoaded = true;
    loadChannels();
  };

  if (channelCard && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadChannelsOnce();
          observer.disconnect();
        }
      });
    }, { rootMargin: '120px' });
    observer.observe(channelCard);
  } else {
    setTimeout(loadChannelsOnce, 300);
  }

  if (reportCard) {
    reportCard.addEventListener('toggle', () => {
      if (reportCard.open && !reportsLoaded) {
        reportsLoaded = true;
        loadReports();
      }
    });
    if (reportCard.open && !reportsLoaded) {
      reportsLoaded = true;
      loadReports();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadCoreUsage();
  if ('requestIdleCallback' in window) {
    requestIdleCallback(setupLazyLoading, { timeout: 600 });
  } else {
    setTimeout(setupLazyLoading, 150);
  }
});
