let docsFiles = [];

async function loadDocs() {
  const resp = await fetch('/api/docs/files');
  const data = await resp.json();
  docsFiles = data.files || [];
  renderDocsList();
  if (docsFiles.length) loadDocFile(docsFiles[0]);
  loadGithub();
}

function renderDocsList() {
  const list = document.getElementById('docs-file-list');
  list.innerHTML = '';
  docsFiles.forEach(path => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.textContent = path.split('/').pop();
    item.addEventListener('click', () => {
      document.querySelectorAll('.docs-files .file-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      loadDocFile(path);
    });
    list.appendChild(item);
  });
  if (list.firstChild) list.firstChild.classList.add('active');
}

async function loadDocFile(path) {
  const resp = await fetch(`/api/docs/file?path=${encodeURIComponent(path)}`);
  const data = await resp.json();
  document.getElementById('docs-file-content').innerHTML = renderMarkdown(data.content || '');
}

async function loadGithub() {
  const resp = await fetch('/api/docs/github');
  const data = await resp.json();
  const repos = data.repos || [];
  const container = document.getElementById('github-repos');
  container.innerHTML = repos.map(repo => `
    <div class="repo-card">
      <div class="repo-title">${repo.name}</div>
      <div class="repo-desc">${repo.description || ''}</div>
      <div class="repo-meta">Updated: ${new Date(repo.updatedAt).toLocaleDateString()} · <a href="${repo.url}" target="_blank">Open</a></div>
    </div>
  `).join('');
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

document.addEventListener('DOMContentLoaded', loadDocs);
