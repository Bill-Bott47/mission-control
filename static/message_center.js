const eventListEl = document.getElementById('event-list');
const eventDetailEl = document.getElementById('event-detail');

const sourceEl = document.getElementById('filter-source');
const levelEl = document.getElementById('filter-level');
const kindEl = document.getElementById('filter-kind');
const channelEl = document.getElementById('filter-channel');
const limitEl = document.getElementById('filter-limit');
const applyBtn = document.getElementById('apply-filters');

let events = [];
let selectedId = null;

function buildQuery() {
    const params = new URLSearchParams();

    const source = sourceEl.value.trim();
    const level = levelEl.value.trim();
    const kind = kindEl.value.trim();
    const channel = channelEl.value.trim();
    const limit = limitEl.value.trim() || '100';

    params.set('limit', limit);
    if (source) params.set('source', source);
    if (level) params.set('level', level);
    if (kind) params.set('kind', kind);
    if (channel) params.set('channel', channel);

    return params;
}

async function loadEvents() {
    eventListEl.textContent = 'Loading...';
    const params = buildQuery();

    try {
        const response = await fetch(`/api/message-events?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
            eventListEl.textContent = data.error || 'Failed to load events';
            return;
        }

        events = data.events || [];
        if (!events.length) {
            selectedId = null;
            eventListEl.textContent = 'No events found.';
            eventDetailEl.textContent = 'Select an event.';
            return;
        }

        if (!selectedId || !events.find((e) => e.id === selectedId)) {
            selectedId = events[0].id;
        }

        renderEventList();
        renderDetail(selectedId);
    } catch (error) {
        eventListEl.textContent = `Error: ${error.message}`;
    }
}

function renderEventList() {
    eventListEl.innerHTML = '';

    events.forEach((event) => {
        const item = document.createElement('div');
        item.className = 'event-item';
        if (event.id === selectedId) {
            item.classList.add('active');
        }

        item.innerHTML = `
            <div class="event-title">${escapeHtml(event.title)}</div>
            <div class="event-meta">
                #${event.id} | ${escapeHtml(event.created_at)} | ${escapeHtml(event.source)} | ${escapeHtml(event.level)}
            </div>
            <div class="event-meta">
                ${escapeHtml(event.kind)} | ${escapeHtml(event.channel)}
            </div>
        `;

        item.addEventListener('click', () => {
            selectedId = event.id;
            renderEventList();
            renderDetail(event.id);
        });

        eventListEl.appendChild(item);
    });
}

function renderDetail(id) {
    const event = events.find((item) => item.id === id);
    if (!event) {
        eventDetailEl.textContent = 'Select an event.';
        return;
    }

    let metaPretty = 'null';
    if (event.meta_json) {
        try {
            metaPretty = JSON.stringify(JSON.parse(event.meta_json), null, 2);
        } catch (_) {
            metaPretty = event.meta_json;
        }
    }

    eventDetailEl.textContent = [
        `id: ${event.id}`,
        `created_at: ${event.created_at}`,
        `source: ${event.source}`,
        `level: ${event.level}`,
        `channel: ${event.channel}`,
        `kind: ${event.kind}`,
        `title: ${event.title}`,
        '',
        'body:',
        event.body || '(empty)',
        '',
        'meta_json:',
        metaPretty,
    ].join('\n');
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

applyBtn.addEventListener('click', () => {
    loadEvents();
});

document.addEventListener('DOMContentLoaded', () => {
    loadEvents();
    setInterval(loadEvents, 10000);
});
