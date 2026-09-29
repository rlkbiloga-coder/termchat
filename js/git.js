"use strict";

/**
 * TermChat Virtual Git Engine & GitHub OAuth 2.0 Integration
 * Features:
 * - Local virtual git (commits, branches, snapshots, diffs)
 * - GitHub OAuth 2.0 popup authentication + Personal Access Token fallback
 * - List repositories
 * - Direct Pull (import remote repo into workspace)
 * - Direct Push (commit and push workspace files to GitHub)
 * - Create new repository on GitHub
 */
class TermGitManager {
  constructor() {
    this.tokenKey = 'tc_gh_token';
    this.userKey = 'tc_gh_user';
    this.selectedRepoKey = 'tc_gh_selected_repo';

    this.token = localStorage.getItem(this.tokenKey) || null;
    this.user = null;
    try {
      this.user = JSON.parse(localStorage.getItem(this.userKey) || 'null');
    } catch (e) {
      this.user = null;
    }

    this.repos = [];
    this.initOAuthListener();
  }

  async safeJson(res) {
    try {
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        const isHtml = text.trim().startsWith('<');
        const err = isHtml ? `Servidor retornou resposta HTML (Status ${res.status})` : text.slice(0, 100);
        return { ok: false, status: res.status, error: err, raw: text };
      }
      if (!res.ok && data.ok === undefined) {
        data.ok = false;
      }
      return data;
    } catch (netErr) {
      return { ok: false, error: netErr.message || 'Erro de conexão' };
    }
  }

  // ─── Direct GitHub Mode (funciona no site publicado, sem backend) ───
  async ghApi(path, opts = {}) {
    const res = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'TermChat-IDE-Platform',
        ...(opts.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `GitHub API erro ${res.status}`);
    return data;
  }

  async hasBackend() {
    if (this._backendMode !== undefined) return this._backendMode;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch('/api/auth/github/url', { signal: ctrl.signal });
      clearTimeout(timer);
      this._backendMode = Boolean(res && res.ok);
    } catch (err) {
      this._backendMode = false;
    }
    return this._backendMode;
  }

  staticUserShape(u) {
    return {
      login: u.login,
      name: u.name || u.login,
      avatar_url: u.avatar_url,
      html_url: u.html_url,
      public_repos: u.public_repos
    };
  }

  b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  // ─── Modal do Conector GitHub ───
  openConnectModal() {
    const existing = document.getElementById('tc-gh-connect');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'tc-gh-connect';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(3,6,10,.82);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-panel,#131b24);border:1px solid var(--border,#1b2530);border-radius:10px;max-width:420px;width:100%;padding:22px;color:var(--text,#c8d6e5);font-family:inherit;max-height:90vh;overflow-y:auto';
    const connected = Boolean(this.token && this.user);
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor" style="color:#fff"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
        <h3 style="margin:0;font-size:16px;color:#fff">Conector GitHub</h3>
      </div>
      <p style="margin:0 0 14px;font-size:12px;color:var(--text-dim,#5c7189)">Acesso real aos seus repositórios: listar, importar, editar e enviar commits.</p>
      ${connected ? `
        <div style="display:flex;align-items:center;gap:10px;background:rgba(55,230,160,.08);border:1px solid rgba(55,230,160,.25);border-radius:8px;padding:10px;margin-bottom:14px">
          <img src="${this.user.avatar_url}" alt="" style="width:34px;height:34px;border-radius:50%">
          <div style="flex:1">
            <div style="font-weight:bold;color:#37e6a0;font-size:13px">@${this.user.login}</div>
            <div style="font-size:11px;color:var(--text-dim,#5c7189)">conectado</div>
          </div>
          <button id="tc-gh-logout" class="btn btn-sm">Sair</button>
        </div>` : ''}
      <div>
        <div style="font-size:12px;font-weight:bold;color:#fff;margin-bottom:8px">Conectar com Token Pessoal (funciona em qualquer lugar)</div>
        <ol style="font-size:11px;color:var(--text-dim,#7a8da3);margin:0 0 10px;padding-left:18px;line-height:1.7">
          <li>Toque em "Criar token no GitHub"</li>
          <li>Confirme sua senha e toque em "Generate token"</li>
          <li>Copie o token e cole abaixo</li>
        </ol>
        <button id="tc-gh-newtoken" class="btn btn-sm" style="width:100%;margin-bottom:10px">Criar token no GitHub</button>
        <input id="tc-gh-token-input" type="password" placeholder="ghp_... ou github_pat_..." style="width:100%;box-sizing:border-box;background:var(--bg,#0b0f14);border:1px solid var(--border,#1b2530);border-radius:6px;padding:9px 10px;color:#fff;font-size:12px;margin-bottom:10px">
        <div id="tc-gh-err" style="color:#ff6b6b;font-size:11px;margin-bottom:8px;display:none"></div>
        <button id="tc-gh-token-connect" class="btn btn-primary" style="width:100%">Conectar com Token</button>
      </div>
      <button id="tc-gh-close" class="btn" style="width:100%;margin-top:10px">Fechar</button>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    card.querySelector('#tc-gh-close').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    card.querySelector('#tc-gh-newtoken').onclick = () =>
      window.open('https://github.com/settings/tokens/new?scopes=repo&description=TermChat%20IDE', '_blank');
    if (connected) {
      card.querySelector('#tc-gh-logout').onclick = () => { this.logout(); close(); };
    }
    card.querySelector('#tc-gh-token-connect').onclick = async () => {
      const val = card.querySelector('#tc-gh-token-input').value.trim();
      if (!val) return;
      const btn = card.querySelector('#tc-gh-token-connect');
      btn.disabled = true;
      btn.textContent = 'Validando...';
      try {
        this.token = val;
        const user = await this.fetchUser();
        if (!user) throw new Error('Token inválido, expirado ou sem permissão.');
        this.setAuth(val, user);
        if (window.renderGitPanel) window.renderGitPanel();
        if (window.TermLogs) window.TermLogs.add('Git', `GitHub conectado: @${user.login}`, 'success');
        close();
        alert(`✓ Conectado ao GitHub como @${user.login}!`);
      } catch (err) {
        card.querySelector('#tc-gh-err').textContent = err.message;
        card.querySelector('#tc-gh-err').style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Conectar com Token';
      }
    };
  }

  initOAuthListener() {
    window.addEventListener('message', (event) => {
      // Validate origin
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'github') {
        this.setAuth(event.data.token, event.data.user);
        if (window.renderGitPanel) window.renderGitPanel();
        if (window.TermLogs) {
          window.TermLogs.add('Git', `Autenticado com GitHub como @${event.data.user?.login}`, 'success');
        }
        alert(`✓ Conectado ao GitHub com sucesso como @${event.data.user?.login}!`);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        if (window.TermLogs) {
          window.TermLogs.add('Git', `Erro na autenticação GitHub: ${event.data.error}`, 'error');
        }
        alert(`Erro na autenticação com GitHub: ${event.data.error}`);
      }
    });

    // Check token validity if saved
    if (this.token && !this.user) {
      this.fetchUser().catch(() => this.logout());
    }
  }

  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  logout() {
    this.token = null;
    this.user = null;
    this.repos = [];
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.selectedRepoKey);
    if (window.renderGitPanel) window.renderGitPanel();
    if (window.TermLogs) {
      window.TermLogs.add('Git', 'Desconectado do GitHub', 'info');
    }
  }

  isAuthenticated() {
    return Boolean(this.token);
  }

  // --- OAuth 2.0 / Conector GitHub (dual-mode) ---
  async loginWithGitHub() {
    let data = null;
    try {
      if (await this.hasBackend()) {
        const redirectUri = `${window.location.origin}/auth/callback`;
        const res = await fetch(`/api/auth/github/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
        data = await this.safeJson(res);
      }
    } catch (err) {
      data = null;
    }

    if (data && data.configured && data.url) {
      const authWindow = window.open(
        data.url,
        'github_oauth_popup',
        'width=600,height=700,status=no,resizable=yes'
      );
      if (!authWindow) {
        alert('Por favor, permita popups para este site para conectar sua conta GitHub.');
      }
      return;
    }

    this.openConnectModal();
  }

  async loginWithToken(patToken) {
    const token = (patToken || '').trim();
    if (!token) return;
    const prev = this.token;
    this.token = token;
    let user = null;
    try {
      user = await this.fetchUser();
    } catch (err) {
      user = null;
    }
    if (!user) {
      this.token = prev;
      alert('Erro ao validar token: token inválido, expirado ou sem permissão.');
      return;
    }
    this.setAuth(token, user);
    if (window.renderGitPanel) window.renderGitPanel();
    if (window.TermLogs) {
      window.TermLogs.add('Git', `Conectado com Personal Access Token: @${user.login}`, 'success');
    }
    alert(`✓ Conectado ao GitHub como @${user.login}!`);
  }

  async fetchUser() {
    if (!this.token) return null;
    if (await this.hasBackend()) {
      const res = await fetch('/api/github/user', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await this.safeJson(res);
      if (data.ok) {
        this.user = data.user;
        localStorage.setItem(this.userKey, JSON.stringify(data.user));
        return data.user;
      }
      return null;
    }
    try {
      const u = await this.ghApi('/user');
      const user = this.staticUserShape(u);
      this.user = user;
      localStorage.setItem(this.userKey, JSON.stringify(user));
      return user;
    } catch (err) {
      return null;
    }
  }

  async fetchRepositories() {
    if (!this.token) throw new Error('Não autenticado com GitHub.');
    if (await this.hasBackend()) {
      const res = await fetch('/api/github/repos', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await this.safeJson(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao buscar repositórios.');
      }
      this.repos = data.repos || [];
      return this.repos;
    }
    const data = await this.ghApi('/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator');
    this.repos = data.map(r => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      owner: r.owner.login,
      private: r.private,
      html_url: r.html_url,
      description: r.description || '',
      default_branch: r.default_branch || 'main',
      updated_at: r.updated_at
    }));
    return this.repos;
  }

  // --- Pull: Import GitHub Repo into TermChat Workspace ---
  async pullRepository(fullName, branch = 'main', onProgress = () => {}) {
    if (!this.token) throw new Error('Conecte-se ao GitHub antes de puxar repositórios.');
    const [owner, repo] = fullName.split('/');

    onProgress(`Criando snapshot de segurança antes do pull...`);
    window.TermVFS.createSnapshot(`Pré-Pull: ${fullName}@${branch}`);

    onProgress(`Baixando árvore e arquivos de ${fullName}@${branch}...`);
    let files = {};

    if (await this.hasBackend()) {
      const res = await fetch('/api/github/pull', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ owner, repo, branch })
      });
      const data = await this.safeJson(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao baixar arquivos do GitHub.');
      }
      files = data.files || {};
    } else {
      const tree = await this.ghApi(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
      const entries = (tree.tree || [])
        .filter(e => e.type === 'blob' && (e.size || 0) <= 300000)
        .slice(0, 400);
      let done = 0;
      for (const e of entries) {
        done++;
        onProgress(`Baixando ${done}/${entries.length}: ${e.path}`);
        try {
          const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${e.path}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
          });
          if (raw.ok) files[e.path] = await raw.text();
        } catch (err) {
          // arquivo ignorado (binário ou inacessível)
        }
      }
      if (Object.keys(files).length === 0) {
        throw new Error('Nenhum arquivo baixado (verifique branch e permissões do token).');
      }
    }
    const count = Object.keys(files).length;
    if (count === 0) {
      throw new Error('Nenhum arquivo encontrado no repositório/branch selecionado.');
    }

    onProgress(`Importando ${count} arquivos para o workspace...`);
    Object.entries(files).forEach(([filePath, content]) => {
      window.TermVFS.writeFile(filePath, content, `GitHub:${owner}`);
    });

    // Update git state
    const ws = window.TermVFS.getCurrentWorkspace();
    if (!ws.git) ws.git = { branch, branches: [branch], commits: [] };
    ws.git.branch = branch;
    ws.git.commits.unshift({
      hash: 'gh-pull',
      message: `pull: sincronizado com ${fullName}@${branch}`,
      author: `@${this.user?.login || owner}`,
      date: new Date().toISOString()
    });

    const all = window.TermVFS.getAllWorkspaces();
    all[ws.id] = ws;
    window.TermVFS.saveAllWorkspaces(all);

    localStorage.setItem(this.selectedRepoKey, fullName);

    if (window.renderFileTree) window.renderFileTree();
    if (window.updatePreview) window.updatePreview();
    if (window.TermEditorInst) window.TermEditorInst.openFile(Object.keys(files)[0] || 'index.html');

    if (window.TermLogs) {
      window.TermLogs.add('Git', `Pull bem-sucedido de ${fullName}@${branch} (${count} arquivos)`, 'success');
    }

    return count;
  }

  // --- Push: Push Current Workspace Files to GitHub Repo ---
  async pushRepository(fullName, branch = 'main', commitMsg = 'update: sincronização via TermChat', onProgress = () => {}) {
    if (!this.token) throw new Error('Conecte-se ao GitHub antes de fazer push.');
    const [owner, repo] = fullName.split('/');

    onProgress(`Preparando arquivos do workspace para envio...`);
    const filePaths = window.TermVFS.listFiles();
    const files = filePaths.map(p => {
      const f = window.TermVFS.getFile(p);
      return { path: p, content: f ? f.content : '' };
    });

    if (files.length === 0) {
      throw new Error('Workspace vazio. Nada para enviar.');
    }

    onProgress(`Enviando ${files.length} arquivos para ${fullName}@${branch}...`);
    let data;

    if (await this.hasBackend()) {
      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          commitMessage: commitMsg,
          files
        })
      });

      data = await this.safeJson(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao sincronizar arquivos com GitHub.');
      }
    } else {
      const results = [];
      const errors = [];
      let done = 0;
      for (const f of files) {
        done++;
        const cleanPath = f.path.replace(/^\/+/, '');
        onProgress(`Enviando ${done}/${files.length}: ${cleanPath}`);
        try {
          let currentSha;
          const meta = await this.ghApi(`/repos/${owner}/${repo}/contents/${cleanPath}?ref=${encodeURIComponent(branch)}`).catch(() => null);
          if (meta && meta.sha) currentSha = meta.sha;
          const putBody = {
            message: `${commitMsg} [${cleanPath}]`,
            content: this.b64encode(f.content || ''),
            branch
          };
          if (currentSha) putBody.sha = currentSha;
          const putData = await this.ghApi(`/repos/${owner}/${repo}/contents/${cleanPath}`, {
            method: 'PUT',
            body: JSON.stringify(putBody)
          });
          results.push({ path: cleanPath, commit: (putData.commit && putData.commit.sha || '').slice(0, 7) || 'ok' });
        } catch (err) {
          errors.push(`${f.path}: ${err.message}`);
        }
      }
      if (results.length === 0) {
        throw new Error(`Falha ao fazer push: ${errors.join('; ')}`);
      }
      data = {
        ok: true,
        pushedCount: results.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
        message: `Push concluído para ${owner}/${repo}@${branch} (${results.length} arquivos sincronizados).`
      };
    }

    // Record commit in local git state too
    this.createCommit(`push: ${commitMsg} (${fullName}@${branch})`);
    localStorage.setItem(this.selectedRepoKey, fullName);

    if (window.TermLogs) {
      window.TermLogs.add('Git', `Push concluído para ${fullName}@${branch} (${data.pushedCount} arquivos)`, 'success');
    }

    return data;
  }

  // --- Create Repository on GitHub ---
  async createRepoOnGitHub(name, description = '', isPrivate = false) {
    if (!this.token) throw new Error('Não autenticado com GitHub.');
    let repo;

    if (await this.hasBackend()) {
      const res = await fetch('/api/github/create-repo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ name, description, private: isPrivate })
      });
      const data = await this.safeJson(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao criar repositório no GitHub.');
      }
      repo = data.repo;
    } else {
      const created = await this.ghApi('/user/repos', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
          description: description || 'Criado pelo TermChat Web IDE',
          private: isPrivate,
          auto_init: true
        })
      });
      repo = {
        name: created.name,
        full_name: created.full_name,
        owner: created.owner.login,
        html_url: created.html_url,
        default_branch: created.default_branch || 'main'
      };
    }

    if (window.TermLogs) {
      window.TermLogs.add('Git', `Repositório criado no GitHub: ${repo.full_name}`, 'success');
    }

    return repo;
  }

  // --- Local Virtual Git Operations ---
  getRepoState() {
    const ws = window.TermVFS.getCurrentWorkspace();
    if (!ws.git) {
      ws.git = {
        branch: 'main',
        branches: ['main'],
        commits: [
          {
            hash: 'c0a1b2c',
            message: 'feat: inicialização do projeto',
            author: this.user ? `@${this.user.login}` : 'Developer',
            date: new Date().toISOString()
          }
        ]
      };
    }
    return ws.git;
  }

  createCommit(message) {
    if (!message || !message.trim()) throw new Error('Mensagem de commit é obrigatória.');
    const ws = window.TermVFS.getCurrentWorkspace();
    const git = this.getRepoState();

    const commit = {
      hash: Math.random().toString(36).substring(2, 9),
      message: message.trim(),
      author: this.user ? `@${this.user.login}` : 'TermChat Developer',
      date: new Date().toISOString()
    };

    git.commits.unshift(commit);
    window.TermVFS.createSnapshot(`Commit: ${commit.hash} - ${commit.message.slice(0, 25)}`);

    const all = window.TermVFS.getAllWorkspaces();
    all[ws.id] = ws;
    window.TermVFS.saveAllWorkspaces(all);

    if (window.TermLogs) {
      window.TermLogs.add('Git', `Commit [${commit.hash}] ${commit.message}`, 'success');
    }

    return commit;
  }

  createBranch(name) {
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9/_-]/g, '-');
    const git = this.getRepoState();
    if (git.branches.includes(clean)) throw new Error('Branch já existe: ' + clean);
    git.branches.push(clean);
    this.save();
    return clean;
  }

  switchBranch(name) {
    const git = this.getRepoState();
    if (!git.branches.includes(name)) throw new Error('Branch não encontrado: ' + name);
    git.branch = name;
    this.save();
    return name;
  }

  save() {
    const ws = window.TermVFS.getCurrentWorkspace();
    const all = window.TermVFS.getAllWorkspaces();
    all[ws.id] = ws;
    window.TermVFS.saveAllWorkspaces(all);
  }

  async suggestCommitMessage() {
    const files = window.TermVFS.listFiles();
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'auto',
          messages: [
            {
              role: 'system',
              content: 'Você é um assistente Git. Gere uma mensagem de commit no formato convencional (ex: feat: ..., fix: ..., refactor: ...) concisa de uma linha baseada nos arquivos alterados.'
            },
            {
              role: 'user',
              content: `Arquivos no projeto: ${files.join(', ')}. Sugira uma boa mensagem de commit.`
            }
          ]
        })
      });
      const data = await resp.json();
      return (data.text || '').replace(/^["']|["']$/g, '').trim().split('\n')[0];
    } catch (e) {
      return `update: sincronização de arquivos (${files.length} arquivos)`;
    }
  }

  exportZip() {
    const files = window.TermVFS.listFiles();
    const project = window.TermVFS.getCurrentWorkspace().name;
    const data = {
      project,
      exportedAt: new Date().toISOString(),
      files: {}
    };

    files.forEach(f => {
      const file = window.TermVFS.getFile(f);
      if (file) data.files[f] = file.content;
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.toLowerCase().replace(/[^a-z0-9]/g, '-')}-export.json`;
    a.click();

    if (window.TermLogs) {
      window.TermLogs.add('Git', `Projeto exportado: ${data.project}`, 'info');
    }
  }

  // --- GitHub Repository Security & Bugs Audit Scanner ---
  async auditGitHubRepo(fullName) {
    if (!fullName) {
      fullName = localStorage.getItem(this.selectedRepoKey) || 'rlkbiloga-coder/termchat';
    }
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) throw new Error('Repositório inválido. Formato esperado: dono/repo');

    if (window.TermLogs) {
      window.TermLogs.add('Auditoria', `Escaneando vulnerabilidades, bugs e Dependabot de ${fullName}...`, 'info');
    }

    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(`/api/github/audit?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`, {
      headers
    });

    const data = await this.safeJson(res);
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Falha ao auditar repositório.');
    }

    this.lastRepoAudit = data;
    localStorage.setItem('tc_last_repo_audit', JSON.stringify(data));

    if (window.TermLogs) {
      window.TermLogs.add('Auditoria', `Auditoria concluída para ${fullName}. Score de Segurança: ${data.securityScore}/100 [Risco ${data.riskLevel}]`, data.riskLevel === 'BAIXO' ? 'success' : 'warn');
    }

    return data;
  }

  // --- AI Code Review & Bug Scanner for Workspace Files ---
  async runWorkspaceCodeReview(focus = 'all', onProgress = () => {}) {
    onProgress('Coletando arquivos do projeto para auditoria...');
    const filePaths = window.TermVFS ? window.TermVFS.listFiles() : [];
    if (filePaths.length === 0) {
      throw new Error('Nenhum arquivo no workspace para analisar.');
    }

    const files = filePaths.slice(0, 15).map(p => {
      const f = window.TermVFS.getFile(p);
      return { path: p, content: f ? f.content : '' };
    });

    onProgress(`Analisando ${files.length} arquivos com IA (bugs, vulnerabilidades e riscos)...`);
    const repoName = window.TermVFS.getCurrentWorkspace()?.name || 'meu-projeto';

    const res = await fetch('/api/code-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files,
        repoName,
        focus
      })
    });

    const data = await this.safeJson(res);
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Falha ao executar Code Review.');
    }

    this.lastCodeReview = data;
    localStorage.setItem('tc_last_code_review', JSON.stringify(data));

    if (window.TermLogs) {
      window.TermLogs.add('CodeReview', `Revisão de código concluída. Score: ${data.overallScore}/100. Problemas detectados: ${data.issues?.length || 0}`, 'info');
    }

    return data;
  }

  // --- Apply automated fix suggested by AI ---
  applyCodeFix(issueId) {
    if (!this.lastCodeReview || !this.lastCodeReview.issues) {
      throw new Error('Nenhuma revisão de código recente encontrada.');
    }
    const issue = this.lastCodeReview.issues.find(i => i.id === issueId);
    if (!issue) throw new Error('Problema não encontrado.');

    if (issue.fixCode && window.TermVFS) {
      window.TermVFS.writeFile(issue.file, issue.fixCode, 'AI-Fix');
      if (window.TermEditorInst && window.TermEditorInst.activeFile === issue.file) {
        window.TermEditorInst.openFile(issue.file);
      }
      if (window.TermLogs) {
        window.TermLogs.add('CodeReview', `Correção aplicada com sucesso em ${issue.file}`, 'success');
      }
      return true;
    }
    return false;
  }
}

window.TermGit = new TermGitManager();
