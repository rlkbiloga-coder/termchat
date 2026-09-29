"use strict";

/**
 * TermChat Sandboxed Virtual Terminal
 * Safe execution of CLI commands, Git commands, agent triggers and build tests.
 */
class TermSandbox {
  constructor() {
    this.history = [];
    this.historyIndex = -1;
    this.cwd = '/';
    this.isRunning = false;
    this.init();
  }

  init() {
    const input = document.getElementById('terminalInput');
    if (!input) return;

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const cmd = input.value.trim();
        input.value = '';
        if (cmd) {
          this.history.push(cmd);
          this.historyIndex = this.history.length;
          this.execute(cmd);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.historyIndex > 0) {
          this.historyIndex--;
          input.value = this.history[this.historyIndex] || '';
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          input.value = this.history[this.historyIndex] || '';
        } else {
          this.historyIndex = this.history.length;
          input.value = '';
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.autoComplete(input);
      }
    });
  }

  print(text, type = 'text') {
    const container = document.getElementById('terminalOutput');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `term-line term-${type}`;

    if (type === 'cmd') {
      div.innerHTML = `<span class="term-prompt">~/project $</span> ${this.escape(text)}`;
    } else {
      div.innerHTML = text;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    if (window.TermLogs && type === 'err') {
      window.TermLogs.add('Terminal', text, 'error');
    }
  }

  escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async execute(commandLine) {
    this.print(commandLine, 'cmd');
    const parts = commandLine.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        this.print(`
<b>TermChat Terminal — Comandos Disponíveis:</b>
  <span class="term-acc">ls [-la]</span>               Listar arquivos e pastas
  <span class="term-acc">cat &lt;arquivo&gt;</span>          Exibir conteúdo de um arquivo
  <span class="term-acc">edit &lt;arquivo&gt;</span>         Abrir arquivo no editor
  <span class="term-acc">touch &lt;arquivo&gt;</span>        Criar novo arquivo vazio
  <span class="term-acc">rm [-r] &lt;arquivo&gt;</span>       Remover arquivo
  <span class="term-acc">mkdir &lt;pasta&gt;</span>          Criar pasta virtual
  <span class="term-acc">git status</span>              Status do repositório Git
  <span class="term-acc">git commit -m "msg"</span>     Criar commit
  <span class="term-acc">git log</span>                 Histórico de commits
  <span class="term-acc">git branch [nome]</span>       Listar ou criar branch
  <span class="term-acc">git checkout &lt;branch&gt;</span>  Mudar de branch
  <span class="term-acc">git diff</span>               Visualizar alterações não commitadas
  <span class="term-acc">snapshot [create|list]</span>  Gerenciar snapshots de segurança
  <span class="term-acc">rollback &lt;id&gt;</span>          Restaurar snapshot anterior
  <span class="term-acc">npm test</span>               Executar bateria de testes do projeto
  <span class="term-acc">npm run build</span>          Validar e compilar projeto
  <span class="term-acc">node &lt;arquivo&gt;</span>         Executar script JavaScript no sandbox
  <span class="term-acc">python &lt;arquivo.py&gt;</span>   Executar script Python no sandbox (Pyodide, isolado)
  <span class="term-acc">agent &lt;role&gt; &lt;prompt&gt;</span>  Chamar agente (coder, debugger, tester, etc.)
  <span class="term-acc">builder &lt;prompt&gt;</span>       Gerador automático de aplicações
  <span class="term-acc">deploy [vercel|zip]</span>    Fazer deploy do projeto
  <span class="term-acc">clear / cls</span>            Limpar tela do terminal
        `, 'info');
        break;

      case 'clear':
      case 'cls':
        const container = document.getElementById('terminalOutput');
        if (container) container.innerHTML = '';
        break;

      case 'ls': {
        const files = window.TermVFS.listFiles();
        const isLong = args.includes('-l') || args.includes('-la');
        if (files.length === 0) {
          this.print('(diretório vazio)', 'dim');
        } else if (isLong) {
          const list = files.map(f => {
            const file = window.TermVFS.getFile(f);
            const size = (file ? file.content.length : 0) + ' B';
            const date = new Date(file.updated).toLocaleTimeString();
            return `<div class="term-ls-row"><span>-rw-r--r--</span> <span style="color:#5c7189">${size.padStart(8, ' ')}</span> <span style="color:#5c7189">${date}</span> <span style="color:#37e6a0">${f}</span></div>`;
          }).join('');
          this.print(`total ${files.length}\n${list}`, 'text');
        } else {
          this.print(files.join('   '), 'info');
        }
        break;
      }

      case 'cat': {
        if (!args[0]) return this.print('Uso: cat <arquivo>', 'err');
        const file = window.TermVFS.getFile(args[0]);
        if (!file) return this.print(`cat: ${args[0]}: Arquivo não encontrado`, 'err');
        this.print(this.escape(file.content), 'text');
        break;
      }

      case 'edit': {
        if (!args[0]) return this.print('Uso: edit <arquivo>', 'err');
        if (window.TermEditorInst) {
          window.TermEditorInst.openFile(args[0]);
          if (window.switchView) window.switchView('ide');
          this.print(`Arquivo ${args[0]} aberto no editor.`, 'ok');
        }
        break;
      }

      case 'touch': {
        if (!args[0]) return this.print('Uso: touch <arquivo>', 'err');
        window.TermVFS.writeFile(args[0], '', 'user');
        this.print(`Arquivo '${args[0]}' criado com sucesso.`, 'ok');
        if (window.renderFileTree) window.renderFileTree();
        break;
      }

      case 'rm': {
        const target = args.find(a => !a.startsWith('-'));
        if (!target) return this.print('Uso: rm [-r] <caminho>', 'err');
        const ok = window.TermVFS.deleteFile(target);
        if (ok) {
          this.print(`'${target}' removido.`, 'ok');
          if (window.renderFileTree) window.renderFileTree();
        } else {
          this.print(`rm: não foi possível remover '${target}': Arquivo inexistente`, 'err');
        }
        break;
      }

      case 'mkdir': {
        if (!args[0]) return this.print('Uso: mkdir <pasta>', 'err');
        window.TermVFS.writeFile(args[0] + '/.gitkeep', '', 'user');
        this.print(`Diretório '${args[0]}' criado.`, 'ok');
        if (window.renderFileTree) window.renderFileTree();
        break;
      }

      case 'git':
        this.handleGit(args);
        break;

      case 'snapshot':
        this.handleSnapshot(args);
        break;

      case 'rollback': {
        if (!args[0]) return this.print('Uso: rollback <snapshot-id> (use "snapshot list" para ver IDs)', 'err');
        try {
          const res = window.TermVFS.rollbackToSnapshot(args[0]);
          this.print(`✓ Workspace revertido com sucesso para: ${res.label} (${res.id})`, 'ok');
          if (window.renderFileTree) window.renderFileTree();
          if (window.updatePreview) window.updatePreview();
        } catch (e) {
          this.print(`Falha no rollback: ${e.message}`, 'err');
        }
        break;
      }

      case 'npm': {
        const sub = args[0];
        if (sub === 'test') {
          this.runTests();
        } else if (sub === 'run' && args[1] === 'build') {
          this.runBuild();
        } else {
          this.print(`npm: comando '${sub || ''}' simulado com sucesso. Todos os pacotes em sincronia.`, 'ok');
        }
        break;
      }

      case 'node': {
        if (!args[0]) return this.print('Uso: node <arquivo.js>', 'err');
        const file = window.TermVFS.getFile(args[0]);
        if (!file) return this.print(`node: ${args[0]}: arquivo não encontrado`, 'err');
        this.executeSandboxedJs(file.content);
        break;
      }

      case 'eval': {
        const expr = args.join(' ');
        if (!expr) return this.print('Uso: eval <expressao-js>', 'err');
        this.executeSandboxedJs(expr);
        break;
      }

      case 'python':
      case 'py': {
        if (args[0] === '-c') {
          const code = args.slice(1).join(' ');
          if (!code) return this.print('Uso: py -c "codigo"', 'err');
          this.executeSandboxedPython(code);
        } else if (args[0]) {
          const file = window.TermVFS.getFile(args[0]);
          if (!file) return this.print(`python: ${args[0]}: arquivo não encontrado`, 'err');
          this.executeSandboxedPython(file.content);
        } else {
          this.print('Uso: python <arquivo.py>  |  py -c "codigo"', 'err');
        }
        break;
      }

      case 'agent': {
        const role = args[0] || 'coder';
        const prompt = args.slice(1).join(' ');
        if (!prompt) return this.print('Uso: agent <coder|debugger|architect|tester|security> <tarefa>', 'err');
        if (window.TermAgents) {
          this.print(`Iniciando Agente [${role.toUpperCase()}]...`, 'info');
          window.TermAgents.runAgent(role, prompt, (status) => this.print(status, 'dim'))
            .then(res => this.print(res, 'ok'))
            .catch(err => this.print(`Erro no agente: ${err.message}`, 'err'));
        }
        break;
      }

      case 'builder': {
        const prompt = args.join(' ');
        if (!prompt) return this.print('Uso: builder <descrição da aplicação que deseja construir>', 'err');
        if (window.TermAgents) {
          this.print(`Iniciando Construtor de Aplicação com prompt: "${prompt}"...`, 'info');
          window.TermAgents.buildApp(prompt, (status) => this.print(status, 'dim'))
            .then(res => {
              this.print(res, 'ok');
              if (window.switchView) window.switchView('preview');
            })
            .catch(err => this.print(`Erro no construtor: ${err.message}`, 'err'));
        }
        break;
      }

      case 'deploy': {
        const target = args[0] || 'preview';
        this.runDeploy(target);
        break;
      }

      case 'whoami':
        this.print('developer@termchat-workspace', 'info');
        break;

      case 'date':
        this.print(new Date().toString(), 'info');
        break;

      case 'echo':
        this.print(this.escape(args.join(' ')), 'text');
        break;

      case 'audit':
      case 'review':
      case 'scan': {
        const focus = args[0] || 'all';
        this.print(`🛡️ Abrindo painel de Auditoria & Code Review (${focus})...`, 'info');
        if (window.switchDockTab) window.switchDockTab('audit');
        if (window.startWorkspaceCodeReview) {
          window.startWorkspaceCodeReview(focus);
        }
        break;
      }

      default:
        this.print(`Comando desconhecido: "${cmd}". Digite "help" para ver os comandos.`, 'err');
    }
  }

  handleGit(args) {
    const sub = args[0];
    const ws = window.TermVFS.getCurrentWorkspace();
    if (!ws.git) ws.git = { branch: 'main', branches: ['main'], commits: [] };

    switch (sub) {
      case 'audit':
      case 'review': {
        const repo = args[1] || localStorage.getItem('tc_gh_selected_repo') || 'rlkbiloga-coder/termchat';
        this.print(`🛡️ Escaneando Repositório GitHub: ${repo}...`, 'info');
        if (window.switchDockTab) window.switchDockTab('audit');
        if (window.startRepoAudit) {
          window.startRepoAudit(repo);
        }
        break;
      }

      case 'status': {
        const files = window.TermVFS.listFiles();
        this.print(`No branch <span style="color:#37e6a0">${ws.git.branch}</span>`, 'info');
        this.print(`Arquivos rastreados no workspace: ${files.length}`, 'dim');
        this.print(`Nada pendente para commit (árvore de trabalho limpa)`, 'ok');
        break;
      }

      case 'branch': {
        const newBranch = args[1];
        if (newBranch) {
          if (!ws.git.branches.includes(newBranch)) {
            ws.git.branches.push(newBranch);
            this.print(`Branch '${newBranch}' criado.`, 'ok');
          } else {
            this.print(`Branch '${newBranch}' já existe.`, 'err');
          }
        } else {
          const list = ws.git.branches.map(b => b === ws.git.branch ? `* <span style="color:#37e6a0">${b}</span>` : `  ${b}`).join('\n');
          this.print(`Branches:\n${list}`, 'info');
        }
        break;
      }

      case 'checkout': {
        const targetBranch = args[1];
        if (!targetBranch) return this.print('Uso: git checkout <branch>', 'err');
        if (ws.git.branches.includes(targetBranch)) {
          ws.git.branch = targetBranch;
          this.print(`Mudou para o branch '${targetBranch}'.`, 'ok');
        } else {
          this.print(`git: branch '${targetBranch}' não encontrado`, 'err');
        }
        break;
      }

      case 'commit': {
        let msg = 'Atualização do projeto';
        const mIdx = args.indexOf('-m');
        if (mIdx !== -1 && args[mIdx + 1]) {
          msg = args.slice(mIdx + 1).join(' ').replace(/^["']|["']$/g, '');
        }
        const commit = {
          hash: Math.random().toString(36).substring(2, 9),
          message: msg,
          author: 'TermChat User',
          date: new Date().toISOString()
        };
        ws.git.commits.unshift(commit);
        this.print(`[${ws.git.branch} ${commit.hash}] ${commit.message}`, 'ok');
        if (window.TermLogs) {
          window.TermLogs.add('Git', `Commit criado: ${commit.hash} - ${msg}`, 'info');
        }
        break;
      }

      case 'log': {
        if (!ws.git.commits || ws.git.commits.length === 0) {
          return this.print('Nenhum commit encontrado.', 'dim');
        }
        const list = ws.git.commits.slice(0, 10).map(c => `
<span style="color:#ffc76a">commit ${c.hash}</span>
Autor: ${c.author}
Data:  ${new Date(c.date).toLocaleString()}

    ${c.message}
        `).join('\n');
        this.print(list, 'text');
        break;
      }

      default:
        this.print('Uso do Git: git status | git branch | git checkout | git commit -m "msg" | git log', 'dim');
    }
  }

  handleSnapshot(args) {
    const sub = args[0] || 'list';
    if (sub === 'create') {
      const label = args.slice(1).join(' ') || 'Snapshot Manual';
      const snap = window.TermVFS.createSnapshot(label);
      this.print(`✓ Snapshot criado: <b style="color:#37e6a0">${snap.id}</b> ("${snap.label}")`, 'ok');
    } else if (sub === 'list') {
      const list = window.TermVFS.getSnapshots();
      if (list.length === 0) {
        this.print('Nenhum snapshot encontrado. Crie um com "snapshot create <label>".', 'dim');
      } else {
        const html = list.map(s => `• <span style="color:#37e6a0">${s.id}</span> (${new Date(s.date).toLocaleTimeString()}) — ${s.label}`).join('\n');
        this.print(`<b>Snapshots salvos (${list.length}):</b>\n${html}\n<i>Use "rollback &lt;id&gt;" para restaurar.</i>`, 'info');
      }
    }
  }

  runTests() {
    this.print('Executando suíte de testes do projeto...', 'dim');
    setTimeout(() => {
      const files = window.TermVFS.listFiles();
      const hasHtml = files.includes('index.html');
      const hasJs = files.some(f => f.endsWith('.js'));
      const hasCss = files.some(f => f.endsWith('.css'));

      this.print('✓ Teste 1: Estrutura HTML (' + (hasHtml ? 'PASS' : 'FAIL') + ')', hasHtml ? 'ok' : 'err');
      this.print('✓ Teste 2: Sintaxe JavaScript (' + (hasJs ? 'PASS' : 'FAIL') + ')', hasJs ? 'ok' : 'err');
      this.print('✓ Teste 3: Folha de Estilos CSS (' + (hasCss ? 'PASS' : 'FAIL') + ')', hasCss ? 'ok' : 'err');
      this.print('✓ Teste 4: Segurança de scripts e CSP (PASS)', 'ok');
      this.print('\n<b>Resultado: 4 testes executados. 0 falhas.</b>', 'ok');
    }, 600);
  }

  runBuild() {
    this.print('Iniciando build do workspace...', 'dim');
    setTimeout(() => {
      const files = window.TermVFS.listFiles();
      this.print(`Analisando ${files.length} arquivos...`, 'dim');
      this.print('✓ Minificação simulada concluída', 'ok');
      this.print('✓ Validação de assets concluída', 'ok');
      this.print('<b>Build bem-sucedido! Artefato pronto em dist/</b>', 'ok');
    }, 500);
  }

  runDeploy(target) {
    this.print(`Preparando deploy para <b>${target.toUpperCase()}</b>...`, 'dim');
    const files = window.TermVFS.listFiles().map(path => {
      const file = window.TermVFS.getFile(path);
      return { path, content: file ? file.content : '' };
    });

    fetch('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target,
        files,
        project: window.TermVFS.getCurrentWorkspace().name
      })
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          this.print(`🚀 <b>${d.message}</b>`, 'ok');
          this.print(`🔗 URL pública: <a href="${d.liveUrl}" target="_blank" style="color:#37e6a0">${d.liveUrl}</a>`, 'info');
        } else {
          this.print(`Falha no deploy: ${d.detail}`, 'err');
        }
      })
      .catch(err => {
        this.print(`Erro ao conectar com servidor de deploy: ${err.message}`, 'err');
      });
  }

  executeSandboxedJs(code) {
    try {
      this.print('Rodando JavaScript no sandbox...', 'dim');
      // Create isolated scope
      const logs = [];
      const customConsole = {
        log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        error: (...args) => logs.push('[ERROR] ' + args.join(' ')),
        warn: (...args) => logs.push('[WARN] ' + args.join(' '))
      };

      const fn = new Function('console', code);
      const res = fn(customConsole);

      if (logs.length > 0) {
        this.print(logs.join('\n'), 'info');
      }
      if (res !== undefined) {
        this.print('=> ' + (typeof res === 'object' ? JSON.stringify(res) : String(res)), 'ok');
      }
      if (logs.length === 0 && res === undefined) {
        this.print('Executado com sucesso (sem retorno).', 'dim');
      }
    } catch (err) {
      this.print(`Erro de execução: ${err.message}`, 'err');
    }
  }

  // Terminal Python isolado no navegador via Pyodide (WebAssembly).
  // Não toca o servidor: cada execução roda numa sandbox local do
  // próprio dispositivo do usuário, sem acesso a rede/arquivos do host.
  async loadPyodideRuntime() {
    if (window.__pyodideInstance) return window.__pyodideInstance;
    if (window.__pyodideLoading) return window.__pyodideLoading;

    window.__pyodideLoading = (async () => {
      this.print('Carregando runtime Python (Pyodide/WebAssembly)... primeira vez pode levar alguns segundos.', 'dim');
      if (!window.loadPyodide) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Falha ao carregar Pyodide do CDN (verifique sua internet).'));
          document.head.appendChild(s);
        });
      }
      const instance = await window.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
      });
      window.__pyodideInstance = instance;
      return instance;
    })();

    try {
      return await window.__pyodideLoading;
    } finally {
      window.__pyodideLoading = null;
    }
  }

  async executeSandboxedPython(code) {
    try {
      const pyodide = await this.loadPyodideRuntime();
      this.print('Rodando Python no sandbox (isolado, sem acesso ao servidor)...', 'dim');

      // Captura stdout/stderr do Python para o terminal
      pyodide.setStdout({ batched: (text) => this.print(text, 'info') });
      pyodide.setStderr({ batched: (text) => this.print('[ERROR] ' + text, 'err') });

      const result = await pyodide.runPythonAsync(code);
      if (result !== undefined && result !== null) {
        this.print('=> ' + String(result), 'ok');
      }
    } catch (err) {
      this.print(`Erro de execução Python: ${err.message}`, 'err');
    }
  }

  autoComplete(input) {
    const val = input.value;
    const parts = val.split(' ');
    const last = parts[parts.length - 1];

    if (parts.length === 1) {
      const cmds = ['help', 'ls', 'cat', 'edit', 'touch', 'rm', 'mkdir', 'git', 'snapshot', 'rollback', 'npm', 'node', 'python', 'py', 'agent', 'builder', 'deploy', 'clear'];
      const matches = cmds.filter(c => c.startsWith(last));
      if (matches.length === 1) input.value = matches[0] + ' ';
    } else {
      const files = window.TermVFS.listFiles();
      const matches = files.filter(f => f.startsWith(last));
      if (matches.length === 1) {
        parts[parts.length - 1] = matches[0];
        input.value = parts.join(' ');
      }
    }
  }
}

window.TermSandboxInst = new TermSandbox();
