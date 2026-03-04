let memoryFiles = [];

async function loadMemoryFiles() {
  const resp = await fetch('/api/memory/files');
  const data = await resp.json();
  memoryFiles = data.files || [];
  renderFileList();
  if (memoryFiles.length) loadFile(memoryFiles[0]);
}

function renderFileList() {
  const list = document.getElementById('files-list');
  list.innerHTML = '';
  memoryFiles.forEach(path => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.textContent = path.split('/').pop();
    item.addEventListener('click', () => {
      document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      loadFile(path);
    });
    list.appendChild(item);
  });
  if (list.firstChild) list.firstChild.classList.add('active');
}

async function loadFile(path) {
  const resp = await fetch(`/api/memory/file?path=${encodeURIComponent(path)}`);
  const data = await resp.json();
  const content = data.content || '';
  document.getElementById('file-content').innerHTML = renderMarkdown(content);
}

async function searchMemory(query) {
  if (!query) {
    document.getElementById('search-results').textContent = 'Enter search query';
    return;
  }
  const resp = await fetch(`/api/memory/search?q=${encodeURIComponent(query)}`);
  const data = await resp.json();
  const results = data.results || [];
  const container = document.getElementById('search-results');
  if (!results.length) {
    container.textContent = 'No matches found';
    return;
  }
  container.innerHTML = results.map(result => {
    const filename = result.path.split('/').pop();
    const matches = (result.matches || []).map(m => `<div>${escapeHtml(m)}</div>`).join('');
    return `<div class="search-hit"><strong>${filename}</strong>${matches}</div>`;
  }).join('');
}

function renderMarkdown(text) {
  const lines = text.split('\n');
  return lines.map(line => {
    if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
    if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
    if (line.startsWith('# ')) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
    if (line.startsWith('- ')) return `<div>• ${escapeHtml(line.slice(2))}</div>`;
    return `<div>${escapeHtml(line)}</div>`;
  }).join('');
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let searchTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  loadMemoryFiles();
  document.getElementById('memory-refresh').addEventListener('click', loadMemoryFiles);
  document.getElementById('memory-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const value = e.target.value.trim();
    searchTimer = setTimeout(() => searchMemory(value), 300);
  });
});
