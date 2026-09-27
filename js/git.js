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

  // --- OAuth 2.0 Flow ---
  async loginWithGitHub() {
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const res = await fetch(`/api/auth/github/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();

      if (!data.configured) {
        // Offer manual token fallback if client secret not yet configured
        const manual = prompt(
          'OAuth Client ID não configurado no servidor (.env).\n' +
          'Deseja inserir um GitHub Personal Access Token (PAT) com escopo "repo"?\n' +
          'Cole seu token aqui:'
        );
        if (manual && manual.trim()) {
          await this.loginWithToken(manual.trim());
        }
        return;
      }

      // Open OAuth provider's authorization URL directly in popup
      const authWindow = window.open(
        data.url,
        'github_oauth_popup',
        'width=600,height=700,status=no,resizable=yes'
      );

      if (!authWindow) {
        alert('Por favor, permita popups para este site para conectar sua conta GitHub.');
      }
    } catch (err) {
      alert(`Falha ao iniciar autenticação: ${err.message}`);
    }
  }

  async loginWithToken(patToken) {
    try {
      const res = await fetch('/api/github/user', {
        headers: { 'Authorization': `Bearer ${patToken}` }
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Token inválido ou expirado.');
      }
      this.setAuth(patToken, data.user);
      if (window.renderGitPanel) window.renderGitPanel();
      if (window.TermLogs) {
        window.TermLogs.add('Git', `Conectado com Personal Access Token: @${data.user.login}`, 'success');
      }
      alert(`✓ Conectado como @${data.user.login}!`);
    } catch (err) {
      alert(`Erro ao validar token: ${err.message}`);
    }
  }

  async fetchUser() {
    if (!this.token) return null;
    const res = await fetch('/api/github/user', {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    const data = await res.json();
    if (data.ok) {
      this.user = data.user;
      localStorage.setItem(this.userKey, JSON.stringify(data.user));
      return data.user;
    }
    return null;
  }

  async fetchRepositories() {
    if (!this.token) throw new Error('Não autenticado com GitHub.');
    const res = await fetch('/api/github/repos', {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Falha ao buscar repositórios.');
    }
    this.repos = data.repos || [];
    return this.repos;
  }

  // --- Pull: Import GitHub Repo into TermChat Workspace ---
  async pullRepository(fullName, branch = 'main', onProgress = () => {}) {
    if (!this.token) throw new Error('Conecte-se ao GitHub antes de puxar repositórios.');
    const [owner, repo] = fullName.split('/');

    onProgress(`Criando snapshot de segurança antes do pull...`);
    window.TermVFS.createSnapshot(`Pré-Pull: ${fullName}@${branch}`);

    onProgress(`Baixando árvore e arquivos de ${fullName}@${branch}...`);
    const res = await fetch('/api/github/pull', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ owner, repo, branch })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Falha ao baixar arquivos do GitHub.');
    }

    const files = data.files || {};
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

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Falha ao sincronizar arquivos com GitHub.');
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
    const res = await fetch('/api/github/create-repo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ name, description, private: isPrivate })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Falha ao criar repositório no GitHub.');
    }

    if (window.TermLogs) {
      window.TermLogs.add('Git', `Repositório criado no GitHub: ${data.repo.full_name}`, 'success');
    }

    return data.repo;
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
}

window.TermGit = new TermGitManager();
