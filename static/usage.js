const providerGrid = document.getElementById('provider-grid');
const minimaxBody = document.getElementById('minimax-body');
const minimaxMeta = document.getElementById('minimax-meta');
const channelTable = document.getElementById('channel-table');
const channelMeta = document.getElementById('channel-meta');
const costTable = document.getElementById('cost-table');
const reportDaily = document.getElementById('report-daily');
const reportMonthly = document.getElementById('report-monthly');
const reportMeta = document.getElementById('report-meta');

const statusClass = (status) => {
  if (!status) return 'warn';
  const normalized = status.toLowerCase();
  if (['ok', 'online', 'up', 'healthy'].includes(normalized)) return 'up';
  if (['dead', 'down', 'error', 'billing-error', 'offline'].includes(normalized)) return 'down';
  return 'warn';
};

const jobStatusClass = (status) => {
  if (!status) return 'warn';
  const normalized = status.toLowerCase();
  if (normalized === 'ok' || normalized === 'success') return 'ok';
  if (normalized === 'error' || normalized === 'failed') return 'error';
  return 'warn';
};

const renderProviders = (providers) => {
  if (!providers || providers.length === 0) {
    providerGrid.innerHTML = '<div class="card">No provider data available.</div>';
    return;
  }
  providerGrid.innerHTML = providers.map(provider => {
    const state = statusClass(provider.status);
    return `
      <div class="provider-card">
        <div class="provider-header">
          <div class="provider-title">${provider.name}</div>
          <span class="status-pill ${state}">${provider.status || 'unknown'}</span>
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
  if (payload.window_remaining) {
    minimaxMeta.textContent = payload.window_remaining;
  } else {
    minimaxMeta.textContent = payload.window_remaining_seconds ? `${payload.window_remaining_seconds}s remaining` : 'Live quota';
  }
  if (!models.length) {
    minimaxBody.textContent = 'No usage details returned.';
    return;
  }
  minimaxBody.innerHTML = models.map(model => {
    const used = model.used ?? 0;
    const total = model.total ?? 0;
    const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return `
      <div class="minimax-row">
        <div class="minimax-row-header">
          <strong>${model.name || 'Model'}</strong>
          <span>${used} / ${total}</span>
        </div>
        <div class="progress-bar"><span style="width:${pct}%"></span></div>
        <div class="provider-meta">${pct}% used ${model.remaining ? `• ${model.remaining} remaining` : ''}</div>
      </div>
    `;
  }).join('');
};

const renderChannels = (channels) => {
  if (!channels || channels.length === 0) {
    channelTable.innerHTML = '<div class="placeholder">No cron usage data.</div>';
    return;
  }
  channelTable.innerHTML = channels.map(channel => {
    const jobsMarkup = (channel.jobs || []).map(job => {
      return `
        <div class="channel-job">
          <strong>${job.name}</strong>
          <div>Model: ${job.model || '—'}</div>
          <div>Frequency: ${job.frequency || '—'}</div>
          <div>Est. calls/day: ${job.calls_per_day || '—'}</div>
          <div><span class="status-tag ${jobStatusClass(job.last_status)}">${job.last_status || 'unknown'}</span></div>
        </div>
      `;
    }).join('');

    return `
      <div class="channel-card-item">
        <div class="channel-header">
          <div class="channel-title">${channel.channel_name}</div>
          <div class="channel-usage">${channel.total_calls_per_day} calls/day</div>
        </div>
        <div class="channel-jobs">${jobsMarkup}</div>
      </div>
    `;
  }).join('');
};

const renderCostTable = (providers) => {
  if (!providers || providers.length === 0) {
    costTable.innerHTML = '<div class="placeholder">Cost estimates unavailable.</div>';
    return;
  }
  const header = `
    <div class="cost-row header">
      <div>Provider</div>
      <div>Monthly Cost</div>
      <div>Channels / Use</div>
      <div>Status</div>
    </div>
  `;
  const rows = providers.map(provider => `
    <div class="cost-row">
      <div>${provider.name}</div>
      <div>${provider.cost || '—'}</div>
      <div>${provider.usage || ''}</div>
      <div><span class="status-tag ${statusClass(provider.status)}">${provider.status || 'unknown'}</span></div>
    </div>
  `).join('');
  costTable.innerHTML = header + rows;
};

const escapeHtml = (text) => {
  return text
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
  lines.forEach(line => {
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
    reportMeta.textContent = `Updated ${payload.updated_at}`;
  }
};

const loadUsage = async () => {
  try {
    const [providerRes, minimaxRes, channelRes, reportRes] = await Promise.all([
      fetch('/api/usage/providers'),
      fetch('/api/usage/minimax'),
      fetch('/api/usage/channels'),
      fetch('/api/usage/reports')
    ]);

    const providers = await providerRes.json();
    renderProviders(providers.providers || providers);
    renderCostTable(providers.providers || providers);

    const minimax = await minimaxRes.json();
    renderMinimax(minimax);

    const channels = await channelRes.json();
    renderChannels(channels.channels || channels);
    if (channels.updated_at) {
      channelMeta.textContent = `Updated ${channels.updated_at}`;
    }

    const reports = await reportRes.json();
    renderReports(reports);
  } catch (err) {
    providerGrid.innerHTML = '<div class="card">Failed to load usage data.</div>';
  }
};

loadUsage();
