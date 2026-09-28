"use strict";

/**
 * TermChat Virtual File System & Workspace Manager (VFS)
 * Provides persistent project storage, file tree, snapshots & rollback.
 */
class TermVFS {
  constructor() {
    this.storageKey = 'tc_workspaces';
    this.currentWsKey = 'tc_current_workspace';
    this.currentWorkspace = localStorage.getItem(this.currentWsKey) || 'default';
    this.listeners = new Set();
    this.init();
  }

  init() {
    window.addEventListener('online', () => {
      this.syncOfflineQueue();
    });
    window.addEventListener('offline', () => {
      if (window.TermLogs) {
        window.TermLogs.add('VFS', '⚡ Modo Offline Ativo: Edições no VFS mantidas localmente.', 'warn');
      }
    });

    const all = this.getAllWorkspaces();
    if (!all['default']) {
      all['default'] = {
        id: 'default',
        name: 'TermChat App Starter',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        files: {
          'index.html': {
            path: 'index.html',
            name: 'index.html',
            content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meu App Criado no TermChat</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="card">
    <div class="badge">🚀 TermChat Web IDE</div>
    <h1>Olá do seu Workspace!</h1>
    <p>Edite os arquivos <code>index.html</code>, <code>style.css</code> ou <code>main.js</code> no editor e veja o resultado no Preview em tempo real.</p>
    <div class="counter-box">
      <button id="btn-count">Cliques: <span id="count">0</span></button>
    </div>
  </div>
  <script src="main.js"></script>
</body>
</html>`,
            type: 'html',
            updated: new Date().toISOString()
          },
          'style.css': {
            path: 'style.css',
            name: 'style.css',
            content: `:root {
  --bg: #0d1117;
  --card: #161b22;
  --accent: #37e6a0;
  --text: #e6edf3;
  --border: #30363d;
}

body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding: 20px;
}

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 32px;
  max-width: 480px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  text-align: center;
}

.badge {
  display: inline-block;
  background: rgba(55, 230, 160, 0.15);
  color: var(--accent);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 16px;
}

h1 {
  margin: 0 0 12px;
  font-size: 24px;
}

p {
  color: #8b949e;
  line-height: 1.6;
}

code {
  background: #21262d;
  color: var(--accent);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.counter-box {
  margin-top: 24px;
}

button {
  background: var(--accent);
  color: #06251a;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 15px;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}

button:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}`,
            type: 'css',
            updated: new Date().toISOString()
          },
          'main.js': {
            path: 'main.js',
            name: 'main.js',
            content: `// Código do seu projeto
let count = 0;
const btn = document.getElementById('btn-count');
const display = document.getElementById('count');

if (btn && display) {
  btn.addEventListener('click', () => {
    count++;
    display.textContent = count;
    console.log('[TermChat Preview] Contador atualizado:', count);
  });
}
`,
            type: 'javascript',
            updated: new Date().toISOString()
          },
          'README.md': {
            path: 'README.md',
            name: 'README.md',
            content: `# TermChat Starter App

Este projeto foi gerado automaticamente no TermChat.
Você pode:
- Executar comandos no Terminal integrado (\`ls\`, \`cat\`, \`git status\`, \`npm test\`)
- Pedir para o Agente Coder ou Debugger criar novos componentes
- Visualizar em tempo real no painel de Preview
- Gerar deploys para Vercel, Netlify ou GitHub Pages
`,
            type: 'markdown',
            updated: new Date().toISOString()
          }
        },
        snapshots: [],
        git: {
          branch: 'main',
          branches: ['main', 'feature/ui'],
          commits: [
            {
              hash: 'init001',
              message: 'feat: inicialização do workspace TermChat',
              author: 'TermChat Agent',
              date: new Date().toISOString()
            }
          ]
        }
      };
      this.saveAllWorkspaces(all);
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, data) {
    this.listeners.forEach(fn => {
      try { fn(event, data); } catch (e) { console.error('VFS listener error:', e); }
    });
  }

  getAllWorkspaces() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  saveAllWorkspaces(all) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(all));
    } catch (e) {
      console.warn('Storage limit reached in localStorage:', e);
    }
  }

  getCurrentWorkspace() {
    const all = this.getAllWorkspaces();
    return all[this.currentWorkspace] || all['default'];
  }

  setWorkspace(id) {
    const all = this.getAllWorkspaces();
    if (all[id]) {
      this.currentWorkspace = id;
      localStorage.setItem(this.currentWsKey, id);
      this.notify('workspace_changed', { id, ws: all[id] });
      return true;
    }
    return false;
  }

  createWorkspace(id, name) {
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const all = this.getAllWorkspaces();
    if (all[cleanId]) throw new Error('Workspace com esse ID já existe.');

    all[cleanId] = {
      id: cleanId,
      name: name || cleanId,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      files: {
        'index.html': {
          path: 'index.html',
          name: 'index.html',
          content: '<!DOCTYPE html>\n<html>\n<head><title>' + cleanId + '</title></head>\n<body><h1>' + cleanId + '</h1></body>\n</html>',
          type: 'html',
          updated: new Date().toISOString()
        }
      },
      snapshots: [],
      git: {
        branch: 'main',
        branches: ['main'],
        commits: [{ hash: 'init001', message: 'Initial commit', author: 'User', date: new Date().toISOString() }]
      }
    };

    this.saveAllWorkspaces(all);
    this.setWorkspace(cleanId);
    return cleanId;
  }

  deleteWorkspace(id) {
    if (id === 'default') throw new Error('Não é possível apagar o workspace default.');
    const all = this.getAllWorkspaces();
    delete all[id];
    this.saveAllWorkspaces(all);
    if (this.currentWorkspace === id) {
      this.setWorkspace('default');
    }
    this.notify('workspace_deleted', { id });
  }

  // --- Offline Sync Queue Methods ---
  getOfflineSyncQueue() {
    try {
      const raw = localStorage.getItem('tc_offline_sync_queue');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveOfflineSyncQueue(queue) {
    try {
      localStorage.setItem('tc_offline_sync_queue', JSON.stringify(queue));
    } catch (e) {}
  }

  enqueueOfflineSync(action) {
    const queue = this.getOfflineSyncQueue();
    const filtered = queue.filter(item => item.path !== action.path);
    filtered.push(action);
    this.saveOfflineSyncQueue(filtered);

    if (navigator.serviceWorker && navigator.serviceWorker.controller && action.type === 'write') {
      navigator.serviceWorker.controller.postMessage({
        type: 'CACHE_VFS_FILE',
        path: action.path,
        content: action.content
      });
    }
  }

  async syncOfflineQueue() {
    const queue = this.getOfflineSyncQueue();
    if (!queue.length) return;

    if (!navigator.onLine) {
      if (window.TermLogs) {
        window.TermLogs.add('VFS', `Modo offline: ${queue.length} alteração(ões) no VFS salvas no cache local.`, 'info');
      }
      return;
    }

    if (window.TermLogs) {
      window.TermLogs.add('VFS', `🟢 Conexão restabelecida: Sincronizando ${queue.length} arquivo(s) pendente(s) com a nuvem...`, 'info');
    }

    const remaining = [];
    for (const item of queue) {
      try {
        if (item.type === 'write') {
          if (window.TermFirebase) {
            await window.TermFirebase.saveWorkspaceFile(item.path, item.content, item.ext || 'javascript');
          }
        }
      } catch (err) {
        console.warn('Sync failed for item:', item, err);
        remaining.push(item);
      }
    }

    this.saveOfflineSyncQueue(remaining);

    if (remaining.length === 0) {
      if (window.TermLogs) {
        window.TermLogs.add('VFS', '✓ Todos os arquivos do workspace foram sincronizados na nuvem!', 'success');
      }
    } else if (window.TermLogs) {
      window.TermLogs.add('VFS', `⚠️ ${remaining.length} arquivo(s) permanecem na fila de sincronização.`, 'warn');
    }
  }

  // --- File CRUD ---
  getFile(path) {
    const ws = this.getCurrentWorkspace();
    return ws.files[path] || null;
  }

  writeFile(path, content, author = 'user') {
    const cleanPath = path.replace(/^\/+/, '');
    const ws = this.getCurrentWorkspace();
    const ext = cleanPath.split('.').pop().toLowerCase();

    const isNew = !ws.files[cleanPath];
    ws.files[cleanPath] = {
      path: cleanPath,
      name: cleanPath.split('/').pop(),
      content: content,
      type: ext,
      updated: new Date().toISOString(),
      author
    };
    ws.updated = new Date().toISOString();

    const all = this.getAllWorkspaces();
    all[ws.id] = ws;
    this.saveAllWorkspaces(all);

    // Queue sync for online restore or direct sync to Firebase
    const syncAction = {
      type: 'write',
      path: cleanPath,
      content: content,
      ext: ext,
      timestamp: Date.now()
    };

    if (navigator.onLine && window.TermFirebase) {
      window.TermFirebase.saveWorkspaceFile(cleanPath, content, ext).catch(() => {
        this.enqueueOfflineSync(syncAction);
      });
    } else {
      this.enqueueOfflineSync(syncAction);
    }

    this.notify(isNew ? 'file_created' : 'file_updated', { path: cleanPath, content, author });
    return ws.files[cleanPath];
  }

  deleteFile(path) {
    const ws = this.getCurrentWorkspace();
    if (ws.files[path]) {
      delete ws.files[path];
      ws.updated = new Date().toISOString();
      const all = this.getAllWorkspaces();
      all[ws.id] = ws;
      this.saveAllWorkspaces(all);
      this.notify('file_deleted', { path });
      return true;
    }
    return false;
  }

  renameFile(oldPath, newPath) {
    const ws = this.getCurrentWorkspace();
    if (!ws.files[oldPath]) return false;
    const content = ws.files[oldPath].content;
    delete ws.files[oldPath];
    this.writeFile(newPath, content);
    this.notify('file_renamed', { oldPath, newPath });
    return true;
  }

  listFiles() {
    const ws = this.getCurrentWorkspace();
    return Object.keys(ws.files).sort();
  }

  getTree() {
    const files = this.listFiles();
    const root = { name: '/', type: 'dir', children: {} };

    files.forEach(path => {
      const parts = path.split('/');
      let current = root;
      parts.forEach((part, idx) => {
        const isFile = idx === parts.length - 1;
        if (isFile) {
          current.children[part] = {
            name: part,
            path: path,
            type: 'file',
            ext: part.split('.').pop()
          };
        } else {
          if (!current.children[part]) {
            current.children[part] = {
              name: part,
              path: parts.slice(0, idx + 1).join('/'),
              type: 'dir',
              children: {}
            };
          }
          current = current.children[part];
        }
      });
    });

    return root;
  }

  search(query) {
    const ws = this.getCurrentWorkspace();
    const q = query.toLowerCase();
    const matches = [];

    Object.values(ws.files).forEach(file => {
      if (file.path.toLowerCase().includes(q)) {
        matches.push({ file: file.path, line: 1, text: file.name, type: 'name' });
      }
      const lines = file.content.split('\n');
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(q)) {
          matches.push({ file: file.path, line: index + 1, text: line.trim(), type: 'content' });
        }
      });
    });

    return matches;
  }

  // --- Snapshots & Safe Rollback (Section 25) ---
  createSnapshot(label = 'Snapshot Automático') {
    const ws = this.getCurrentWorkspace();
    const snapshot = {
      id: `snap-${Date.now()}`,
      label,
      date: new Date().toISOString(),
      files: JSON.parse(JSON.stringify(ws.files))
    };

    if (!Array.isArray(ws.snapshots)) ws.snapshots = [];
    ws.snapshots.unshift(snapshot);
    // keep max 20 snapshots
    if (ws.snapshots.length > 20) ws.snapshots.pop();

    const all = this.getAllWorkspaces();
    all[ws.id] = ws;
    this.saveAllWorkspaces(all);

    this.notify('snapshot_created', { snapshot });
    return snapshot;
  }

  getSnapshots() {
    const ws = this.getCurrentWorkspace();
    return ws.snapshots || [];
  }

  rollbackToSnapshot(id) {
    const ws = this.getCurrentWorkspace();
    const target = (ws.snapshots || []).find(s => s.id === id);
    if (!target) throw new Error('Snapshot não encontrado: ' + id);

    // Save pre-rollback state just in case
    this.createSnapshot('Pre-Rollback de ' + target.label);

    ws.files = JSON.parse(JSON.stringify(target.files));
    ws.updated = new Date().toISOString();

    const all = this.getAllWorkspaces();
    all[ws.id] = ws;
    this.saveAllWorkspaces(all);

    this.notify('workspace_restored', { snapshot: target });
    return target;
  }

  deleteSnapshot(id) {
    const ws = this.getCurrentWorkspace();
    if (ws.snapshots) {
      ws.snapshots = ws.snapshots.filter(s => s.id !== id);
      const all = this.getAllWorkspaces();
      all[ws.id] = ws;
      this.saveAllWorkspaces(all);
      this.notify('snapshot_deleted', { id });
    }
  }

  // Generate unified diff between two text strings
  static diff(oldStr, newStr) {
    const oldLines = (oldStr || '').split('\n');
    const newLines = (newStr || '').split('\n');
    const diff = [];

    const max = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < max; i++) {
      const o = oldLines[i];
      const n = newLines[i];
      if (o === undefined) {
        diff.push({ type: 'add', line: n, lineNum: i + 1 });
      } else if (n === undefined) {
        diff.push({ type: 'del', line: o, lineNum: i + 1 });
      } else if (o !== n) {
        diff.push({ type: 'del', line: o, lineNum: i + 1 });
        diff.push({ type: 'add', line: n, lineNum: i + 1 });
      } else {
        diff.push({ type: 'same', line: o, lineNum: i + 1 });
      }
    }
    return diff;
  }
}

// Global instance
window.TermVFS = new TermVFS();
