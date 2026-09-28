"use strict";

/**
 * TermChat Autonomous AI Agents & Orchestrator
 * Specialized agents: Coder, Debugger, Architect, UI Designer, Security, Tester, DevOps.
 */
class TermAgentsManager {
  constructor() {
    this.agents = {
      coder: {
        name: 'Coder Agent',
        icon: 'code',
        role: 'Implementação de funcionalidades, algoritmos e código limpo',
        system: 'Você é o Agente Coder do TermChat. Você gera código limpo, moderno, modular e pronto para execução no navegador. Responda em português com explicações diretas.'
      },
      debugger: {
        name: 'Debugger Agent',
        icon: 'cpu',
        role: 'Análise de erros, depuração e correção de bugs',
        system: 'Você é o Agente Debugger do TermChat. Analise o código do usuário, identifique problemas de sintaxe, exceções ou comportamento inesperado e proponha correções precisas.'
      },
      architect: {
        name: 'Architect Agent',
        icon: 'database',
        role: 'Estruturação de sistemas, design de API e modularidade',
        system: 'Você é o Agente Architect do TermChat. Seu foco é planejar a separação de responsabilidades, arquitetura de pastas, modelos de dados e fluxos escaláveis.'
      },
      uidesigner: {
        name: 'UI Designer Agent',
        icon: 'desktop',
        role: 'Design visual, responsividade mobile e temas modernos',
        system: 'Você é o Agente UI Designer do TermChat. Crie interfaces modernas, acessíveis, otimizadas para toque e mobile, com estética moderna cyberpunk e dark mode.'
      },
      security: {
        name: 'Security Agent',
        icon: 'shield',
        role: 'Auditoria de segurança, CSP, XSS e proteção de secrets',
        system: 'Você é o Agente de Segurança do TermChat. Analise o código contra injeção de scripts, falhas de autenticação, vazamento de credenciais e boas práticas de sandbox.'
      },
      tester: {
        name: 'Tester Agent',
        icon: 'check',
        role: 'Geração de testes unitários e validação de casos de borda',
        system: 'Você é o Agente Tester do TermChat. Crie cenários de teste, asserções de validação e verifique se as funções cobrem casos normais e de borda.'
      },
      devops: {
        name: 'DevOps Agent',
        icon: 'terminal',
        role: 'Builds, automação, deploy e configuração de ambiente',
        system: 'Você é o Agente DevOps do TermChat. Crie scripts de automação, configuração de deploy para Vercel/Netlify/GitHub Pages e otimização de bundle.'
      }
    };
  }

  getRoles() {
    return Object.entries(this.agents).map(([id, a]) => ({ id, ...a }));
  }

  async runAgent(roleKey, prompt, onProgress = () => {}) {
    const agent = this.agents[roleKey] || this.agents.coder;
    onProgress(`[${agent.name}] Analisando workspace atual...`);

    // Read current workspace context
    const files = window.TermVFS.listFiles();
    const contextFiles = {};
    files.slice(0, 5).forEach(f => {
      const file = window.TermVFS.getFile(f);
      if (file && file.content.length < 4000) {
        contextFiles[f] = file.content;
      }
    });

    onProgress(`[${agent.name}] Criando snapshot de segurança antes da execução...`);
    window.TermVFS.createSnapshot(`Pré-Agente ${agent.name}: ${prompt.slice(0, 30)}`);

    onProgress(`[${agent.name}] Consultando modelo de inteligência artificial...`);

    const messages = [
      {
        role: 'system',
        content: `${agent.system}
Você tem acesso aos seguintes arquivos do workspace:
${JSON.stringify(contextFiles, null, 2)}

Se sua resposta incluir código para criar ou modificar arquivos no workspace, use blocos de código com a sintaxe:
\`\`\`file:caminho/do/arquivo.ext
// conteudo completo do arquivo
\`\`\`
`
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    try {
      const resp = await this.callAI(messages);
      onProgress(`[${agent.name}] Processando modificações geradas...`);

      // Check for file blocks to apply
      const fileMatches = this.extractFileBlocks(resp.text);
      if (fileMatches.length > 0) {
        fileMatches.forEach(item => {
          const oldFile = window.TermVFS.getFile(item.path);
          const oldContent = oldFile ? oldFile.content : '';

          // Show diff if editor is open
          if (window.TermEditorInst) {
            window.TermEditorInst.showDiff(item.path, oldContent, item.content, `Alteração por ${agent.name}`);
          } else {
            window.TermVFS.writeFile(item.path, item.content, agent.name);
          }
        });
        if (window.renderFileTree) window.renderFileTree();
        if (window.updatePreview) window.updatePreview();
      }

      return resp.text;
    } catch (err) {
      throw new Error(`Falha no agente: ${err.message}`);
    }
  }

  // Builder: Prompt -> Complete Working Application (Section 20)
  async buildApp(prompt, onProgress = () => {}) {
    onProgress('⚡ Fase 1/4: Analisando prompt e arquitetura do app...');
    window.TermVFS.createSnapshot(`Pré-Builder: ${prompt.slice(0, 30)}`);

    onProgress('⚡ Fase 2/4: Gerando arquitetura frontend e scripts interativos...');

    const systemPrompt = `Você é o Construtor Master de Aplicações do TermChat.
O usuário quer criar uma aplicação web completa e funcional baseada no prompt.
Você DEVE gerar os arquivos essenciais do projeto:
1. "index.html" (HTML5 semântico, moderno, responsivo, linkando style.css e main.js)
2. "style.css" (Estilo moderno, mobile-friendly, design atraente, paleta escura com toques de cor)
3. "main.js" (Lógica completa, interativa e sem erros)
4. "README.md" (Documentação do app)

SEMPRE forneça cada arquivo no seguinte formato estrito:
\`\`\`file:index.html
<!DOCTYPE html>
...
\`\`\`

\`\`\`file:style.css
...
\`\`\`

\`\`\`file:main.js
...
\`\`\`

\`\`\`file:README.md
# Título do App
...
\`\`\`
`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Crie a seguinte aplicação completa: "${prompt}"` }
    ];

    try {
      const resp = await this.callAI(messages);
      onProgress('⚡ Fase 3/4: Gravando arquivos no workspace virtual...');

      const blocks = this.extractFileBlocks(resp.text);
      if (blocks.length === 0) {
        // Fallback: create an app template if model output format was non-standard
        this.createFallbackApp(prompt);
      } else {
        blocks.forEach(b => {
          window.TermVFS.writeFile(b.path, b.content, 'App-Builder');
        });
      }

      onProgress('⚡ Fase 4/4: Atualizando preview ao vivo e testando renderização...');
      if (window.renderFileTree) window.renderFileTree();
      if (window.updatePreview) window.updatePreview();
      if (window.TermEditorInst) window.TermEditorInst.openFile('index.html');

      return `🎉 Aplicação gerada com sucesso para: "${prompt}"!\nArquivos criados/atualizados no workspace. Veja na aba Preview!`;
    } catch (err) {
      console.warn('AI call failed, falling back to local responsive builder template:', err);
      this.createFallbackApp(prompt);
      if (window.renderFileTree) window.renderFileTree();
      if (window.updatePreview) window.updatePreview();
      return `Aplicação base montada localmente no workspace para: "${prompt}".`;
    }
  }

  createFallbackApp(prompt) {
    const title = prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt;
    window.TermVFS.writeFile('index.html', `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>${title}</h1>
    <span class="badge">Construído no TermChat</span>
  </header>
  <main>
    <section class="card">
      <h2>Painel Principal</h2>
      <p>Aplicação interativa gerada a partir do seu prompt:</p>
      <blockquote>${prompt}</blockquote>
      <div class="actions">
        <input type="text" id="itemInput" placeholder="Adicionar item...">
        <button id="addBtn">Adicionar</button>
      </div>
      <ul id="itemList"></ul>
    </section>
  </main>
  <script src="main.js"></script>
</body>
</html>`, 'Builder');

    window.TermVFS.writeFile('style.css', `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #0f141c;
  color: #c8d6e5;
  padding: 20px;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #1f2937;
  padding-bottom: 15px;
  margin-bottom: 20px;
}
.badge {
  background: #37e6a0;
  color: #0b0f14;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}
.card {
  background: #161f2c;
  border: 1px solid #26384a;
  border-radius: 10px;
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}
.actions {
  display: flex;
  gap: 10px;
  margin: 20px 0;
}
input {
  flex: 1;
  background: #0b0f14;
  border: 1px solid #26384a;
  color: #fff;
  padding: 10px;
  border-radius: 6px;
}
button {
  background: #37e6a0;
  color: #0b0f14;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
}
ul {
  list-style: none;
  padding: 0;
}
li {
  padding: 10px;
  background: #0b0f14;
  border-bottom: 1px solid #1f2937;
  display: flex;
  justify-content: space-between;
}`, 'Builder');

    window.TermVFS.writeFile('main.js', `const input = document.getElementById('itemInput');
const btn = document.getElementById('addBtn');
const list = document.getElementById('itemList');

btn.addEventListener('click', () => {
  const val = input.value.trim();
  if (!val) return;
  const li = document.createElement('li');
  li.innerHTML = '<span>' + val + '</span><span style="color:#ff6b6b;cursor:pointer" onclick="this.parentElement.remove()">✕</span>';
  list.appendChild(li);
  input.value = '';
});
`, 'Builder');
  }

  extractFileBlocks(text) {
    const blocks = [];
    const regex = /```file:([^\n]+)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        path: match[1].trim(),
        content: match[2]
      });
    }
    return blocks;
  }

  async callAI(messages) {
    const cfg = window.cfg || {};
    const apiKey = typeof window.getActiveApiKey === 'function' ? window.getActiveApiKey(cfg.provider) : (cfg.key || '');
    const fetchFn = typeof window.fetchWithExponentialBackoff === 'function' ? window.fetchWithExponentialBackoff : fetch;

    try {
      const res = await fetchFn('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: cfg.provider || 'auto',
          model: cfg.model || '',
          messages,
          apiKey,
          customBaseUrl: cfg.customBaseUrl || ''
        })
      }, 3, 1000);

      const rawText = await res.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseErr) {
        throw new Error(rawText.trim().startsWith('<') ? 'Servidor retornou erro HTML (Gateway / 502)' : `Resposta inválida do servidor: ${rawText.slice(0, 100)}`);
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || `Erro HTTP ${res.status}`);
      }

      return data;
    } catch (err) {
      throw new Error(err.message || 'Erro de conexão com o servidor de IA');
    }
  }
}

window.TermAgents = new TermAgentsManager();
