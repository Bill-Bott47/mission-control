const AGENT_COLORS = {
  'Bill': '#7C3AED',
  'Bob': '#F59E0B',
  'Forge': '#3B82F6',
  'Truth': '#14B8A6',
  'Shark': '#DC2626',
  'ACE': '#22C55E',
  'Sam': '#4F46E5',
  'Marty': '#EAB308',
  'Quill': '#EF4444',
  'Pixel': '#EC4899',
  'Scrub': '#06B6D4',
  'Scout': '#059669',
  'Content PM': '#D97706',
  'Librarian': '#8B5CF6',
  'Music Biz': '#F43F5E',
  'Vitruviano PM': '#84CC16',
  'Ops': '#71717A',
  'SENTINEL': '#64748B',
  'main': '#7C3AED'
};

function inferAgent(job) {
  const agentId = job.agentId || job.agent || job.owner || 'main';
  if (agentId === 'main') return 'Bill';
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

function formatTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scheduleLabel(job) {
  if (job.schedule?.kind === 'every') {
    const mins = Math.round(job.schedule.everyMs / 60000);
    return `Every ${mins}m`;
  }
  if (job.schedule?.kind === 'cron') {
    return job.schedule.expr;
  }
  return job.schedule?.expr || '—';
}

async function loadCalendar() {
  const resp = await fetch('/api/cron-jobs-live');
  const data = await resp.json();
  let jobs = [];
  if (Array.isArray(data)) {
    jobs = data;
  } else if (Array.isArray(data.jobs)) {
    jobs = data.jobs;
  } else if (data.jobs?.jobs && Array.isArray(data.jobs.jobs)) {
    jobs = data.jobs.jobs;
  } else if (data.jobs && data.jobs.jobs && Array.isArray(data.jobs.jobs)) {
    jobs = data.jobs.jobs;
  }
  renderLegend(jobs);
  renderDay(jobs);
  renderAlwaysRunning(jobs);
}

function renderLegend(jobs) {
  const legend = document.getElementById('calendar-legend');
  const agents = Array.from(new Set(jobs.map(job => inferAgent(job))));
  legend.innerHTML = agents.map(agent => {
    const color = AGENT_COLORS[agent] || '#7C3AED';
    return `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span>${agent}</div>`;
  }).join('');
}

function renderDay(jobs) {
  const container = document.getElementById('calendar-container');
  const sorted = [...jobs].sort((a,b) => (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0));
  container.innerHTML = '';
  sorted.forEach(job => {
    const agent = inferAgent(job);
    const color = AGENT_COLORS[agent] || '#7C3AED';
    const block = document.createElement('div');
    block.className = 'job-block';
    block.style.borderLeftColor = color;
    block.innerHTML = `
      <div>
        <div class="job-time">Next: ${formatTime(job.state?.nextRunAtMs)}</div>
        <div class="job-time">Last: ${formatTime(job.state?.lastRunAtMs)}</div>
      </div>
      <div>
        <div class="job-title">${job.name || job.id}</div>
        <div class="job-meta">${agent} · ${scheduleLabel(job)} · ${job.enabled ? 'enabled' : 'disabled'}</div>
      </div>
    `;
    block.addEventListener('click', () => showDetail(job, agent, color));
    container.appendChild(block);
  });
}

function renderAlwaysRunning(jobs) {
  const container = document.getElementById('running-jobs');
  const fast = jobs.filter(job => job.schedule?.kind === 'every' && job.schedule.everyMs <= 900000);
  container.innerHTML = '';
  fast.forEach(job => {
    const agent = inferAgent(job);
    const color = AGENT_COLORS[agent] || '#7C3AED';
    const card = document.createElement('div');
    card.className = 'running-card';
    card.style.borderLeft = `4px solid ${color}`;
    card.innerHTML = `
      <div class="job-title">${job.name || job.id}</div>
      <div class="job-meta">${agent} · Every ${Math.round(job.schedule.everyMs/60000)}m</div>
      <div class="job-meta">Next: ${formatTime(job.state?.nextRunAtMs)}</div>
    `;
    card.addEventListener('click', () => showDetail(job, agent, color));
    container.appendChild(card);
  });
}

function showDetail(job, agent, color) {
  const panel = document.getElementById('job-detail');
  document.getElementById('detail-title').textContent = job.name || job.id;
  const detail = document.getElementById('detail-body');
  detail.innerHTML = `
    <div><strong>Agent:</strong> <span style="color:${color}">${agent}</span></div>
    <div><strong>Schedule:</strong> ${scheduleLabel(job)}</div>
    <div><strong>Next Run:</strong> ${formatTime(job.state?.nextRunAtMs)}</div>
    <div><strong>Last Run:</strong> ${formatTime(job.state?.lastRunAtMs)}</div>
    <div><strong>Status:</strong> ${job.state?.lastStatus || '—'}</div>
    <div><strong>Delivery:</strong> ${job.delivery?.mode || '—'}</div>
    <div><strong>Model:</strong> ${job.payload?.model || job.payload?.modelOverride || '—'}</div>
  `;
  panel.classList.add('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('calendar-date').textContent = new Date().toLocaleDateString();
  document.getElementById('refresh-calendar').addEventListener('click', loadCalendar);
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('job-detail').classList.remove('open');
  });
  loadCalendar();
});
