const eventListEl = document.getElementById('event-list');
const eventDetailEl = document.getElementById('event-detail');
const statusPostEl = document.getElementById('status-post');
const entryCountEl = document.getElementById('entry-count');

const channelEl = document.getElementById('filter-channel');
const agentEl = document.getElementById('filter-agent');
const runEl = document.getElementById('filter-run');
const levelEl = document.getElementById('filter-level');
const deliveryStatusEl = document.getElementById('filter-delivery-status');
const limitEl = document.getElementById('filter-limit');
const applyBtn = document.getElementById('apply-filters');

let entries = [];
let selectedId = null;

function buildQuery() {
    const params = new URLSearchParams();

    const channel = channelEl.value.trim();
    const agent = agentEl.value.trim();
    const runId = runEl.value.trim();
    const level = levelEl.value.trim();
    const deliveryStatus = deliveryStatusEl.value.trim();
    const limit = limitEl.value.trim() || '200';

    params.set('limit', limit);
    if (channel) params.set('channel', channel);
    if (agent) params.set('agent', agent);
    if (runId) params.set('run_id', runId);
    if (level) params.set('level', level);
    if (deliveryStatus) params.set('delivery_status', deliveryStatus);

    return params;
}

function getEntryFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('entry') || null;
}

function setEntryInUrl(entryId) {
    const params = new URLSearchParams(window.location.search);
    if (entryId) {
        params.set('entry', entryId);
    } else {
        params.delete('entry');
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
}

async function loadEvents() {
    eventListEl.textContent = 'Loading timeline...';
    const params = buildQuery();

    try {
        const response = await fetch(`/api/messages/timeline?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
            eventListEl.textContent = data.error || 'Failed to load timeline';
            return;
        }

        entries = data.entries || [];
        entryCountEl.textContent = `${data.count || 0} entries`;

        if (!entries.length) {
            selectedId = null;
            eventListEl.textContent = 'No entries found.';
            eventDetailEl.textContent = 'Select an entry.';
            statusPostEl.textContent = 'Select an entry.';
            return;
        }

        const entryFromUrl = getEntryFromUrl();
        if (entryFromUrl && entries.find((entry) => entry.id === entryFromUrl)) {
            selectedId = entryFromUrl;
        }

        if (!selectedId || !entries.find((entry) => entry.id === selectedId)) {
            selectedId = entries[0].id;
        }

        renderEventList();
        renderDetail(selectedId);
        await loadStatusPost(selectedId);
    } catch (error) {
        eventListEl.textContent = `Error: ${error.message}`;
    }
}

function renderEventList() {
    eventListEl.innerHTML = '';

    entries.forEach((entry) => {
        const item = document.createElement('article');
        item.className = 'event-item';
        if (entry.id === selectedId) {
            item.classList.add('active');
        }

        const time = formatTimestamp(entry.timestamp);
        const levelClass = `badge level-${escapeClass(entry.level)}`;
        const statusClass = `badge status-${escapeClass(entry.delivery_status)}`;

        item.innerHTML = `
            <div class="event-top-row">
                <div class="event-title">${escapeHtml(entry.title || '(untitled)')}</div>
                <div class="event-time">${escapeHtml(time)}</div>
            </div>
            <div class="event-meta-row">
                <span class="meta-pill">${escapeHtml(entry.channel || 'unknown')}</span>
                <span class="meta-pill">${escapeHtml(entry.agent || 'unknown-agent')}</span>
                <span class="${levelClass}">${escapeHtml(entry.level || 'info')}</span>
                <span class="${statusClass}">${escapeHtml(entry.delivery_status || 'unknown')}</span>
            </div>
            <div class="event-sub-row">
                <span>run: ${escapeHtml(entry.run_id || 'n/a')}</span>
                <span>source: ${escapeHtml(entry.source || 'unknown')}</span>
            </div>
        `;

        item.addEventListener('click', async () => {
            selectedId = entry.id;
            setEntryInUrl(entry.id);
            renderEventList();
            renderDetail(entry.id);
            await loadStatusPost(entry.id);
        });

        eventListEl.appendChild(item);
    });
}

function renderDetail(id) {
    const entry = entries.find((item) => item.id === id);
    if (!entry) {
        eventDetailEl.textContent = 'Select an entry.';
        return;
    }

    const mcUrl = entry.mc_url || `${window.location.origin}${entry.mc_path || '/messages'}`;
    const lines = [];

    lines.push(`id: ${entry.id}`);
    lines.push(`timestamp: ${entry.timestamp || 'unknown'}`);
    lines.push(`channel: ${entry.channel || 'unknown'}`);
    lines.push(`agent: ${entry.agent || 'unknown'}`);
    lines.push(`run_id: ${entry.run_id || 'n/a'}`);
    lines.push(`level: ${entry.level || 'info'}`);
    lines.push(`delivery_status: ${entry.delivery_status || 'unknown'}`);
    lines.push(`source: ${entry.source || 'unknown'}`);
    lines.push(`discord_url: ${entry.discord_url || 'n/a'}`);
    lines.push(`mission_control_url: ${mcUrl}`);
    lines.push('');
    lines.push('title:');
    lines.push(entry.title || '(empty)');
    lines.push('');
    lines.push('body:');
    lines.push(entry.body || '(empty)');
    lines.push('');
    lines.push('error:');
    lines.push(entry.error || '(none)');
    lines.push('');
    lines.push('meta_json:');
    lines.push(prettyJson(entry.meta_json));

    if (entry.discord_url) {
        lines.push('');
        lines.push(`Discord link: ${entry.discord_url}`);
    }

    eventDetailEl.textContent = lines.join('\n');
}

async function loadStatusPost(entryId) {
    statusPostEl.textContent = 'Loading status-only text...';
    try {
        const params = new URLSearchParams();
        params.set('entry', entryId);
        const response = await fetch(`/api/messages/status-post?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
            statusPostEl.textContent = data.error || 'Unable to build status text';
            return;
        }
        statusPostEl.textContent = data.status_only_text || 'See details in Mission Control.';
    } catch (error) {
        statusPostEl.textContent = `Error: ${error.message}`;
    }
}

function formatTimestamp(value) {
    if (!value) return 'unknown-time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function prettyJson(value) {
    if (value === null || value === undefined || value === '') {
        return 'null';
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch (_) {
        return String(value);
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeClass(value) {
    return String(value || 'unknown').replaceAll(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

applyBtn.addEventListener('click', () => {
    loadEvents();
});

document.addEventListener('DOMContentLoaded', () => {
    const entryFromUrl = getEntryFromUrl();
    if (entryFromUrl) {
        selectedId = entryFromUrl;
    }

    loadEvents();
    setInterval(loadEvents, 10000);
});
