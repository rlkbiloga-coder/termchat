# AI_CONTEXT.md — TermChat Master Specification & Architecture Guide

## 1. Objetivo do TermChat
O TermChat é uma plataforma web universal de desenvolvimento assistido por IA e IDE terminal, combinando:
- IDE web com abas, syntax highlighting e editor multi-arquivo
- Explorador de arquivos hierárquico com operações completas (criar, renomear, mover, excluir, upload, download)
- Terminal sandbox com emulação de processos, comandos Unix/Git e execução controlada
- Agentes autônomos de desenvolvimento (Coder, Debugger, Architect, Tester, Security, UI Designer, DevOps)
- Suporte nativo a múltiplos provedores de IA (Gemini, OpenCode, Pollinations, Groq, OpenRouter, Ollama) com fallback automático e streaming
- Controle de versão Git virtual (commits, branches, diff visual, snapshots e rollback seguro)
- Live Preview interativo de aplicações web com modos Desktop e Mobile
- Gestão de workspaces isolados e persistentes (IndexedDB / LocalStorage)
- Assistente de voz (STT / TTS) para comandos hands-free
- Deploy rápido (Vercel, Netlify, GitHub Pages, ZIP bundle)
- Sistema extensível de plugins e MCP (Model Context Protocol)

---

## 2. Stack Tecnológica
- **Backend / Bridge**: Node.js (v22), Express, CORS, Dotenv, `@google/genai` (SDK oficial do Gemini)
- **Frontend**: HTML5 Semântico, CSS3 Moderno (Cyber/Terminal dark theme + responsividade mobile-first), JavaScript ES6+ modular
- **Armazenamento**: IndexedDB + LocalStorage com suporte a múltiplos workspaces, snapshots e versionamento
- **PWA**: Service Worker com cache offline, Web App Manifest
- **Segurança**: CSP configurada, secrets gerenciados exclusivamente no backend ou chave local não exportada

---

## 3. Arquitetura Modular
```
TermChat
├── Frontend Core
│   ├── Workspace Manager (IndexedDB / Local Projects)
│   ├── File Explorer (Tree, CRUD, Upload/Download, Filter)
│   ├── Code Editor (Tabs, Line Numbers, Syntax Highlighter, Search/Replace)
│   ├── Terminal Sandbox (Commands: ls, cat, git, npm, node, agent, run, diff, rollback)
│   ├── Agent Orchestrator (Coder, Debugger, Architect, Tester, Security, Reviewer)
│   ├── Model Router (Gemini, OpenCode, Pollinations, Groq, OpenRouter, Ollama)
│   ├── Git Engine (Virtual commits, branch management, diff inspector, snapshots)
│   ├── Live Preview (Sandboxed iframe, hot-reloading, responsive modes)
│   ├── Voice Controller (SpeechRecognition + SpeechSynthesis)
│   └── Plugin Marketplace & MCP Registry
└── Backend Server (`server.js`)
    ├── `/health` — verificação de integridade
    ├── `/api/chat` — proxy unificado com streaming & fallback
    ├── `/api/gemini` — integração oficial Google GenAI SDK
    ├── `/api/plugins` — catálogo de plugins e extensões
    ├── `/api/deploy` — orquestrador de exportação e deploy
    ├── `/api/auth/github/url` — geração da URL OAuth 2.0 do GitHub
    ├── `/auth/callback` — troca de código e handshake OAuth com postMessage
    ├── `/api/github/user` — perfil autenticado do usuário GitHub
    ├── `/api/github/repos` — listagem de repositórios do usuário
    ├── `/api/github/pull` — importação de repositório remoto para o workspace
    ├── `/api/github/push` — commit e push direto de arquivos para o GitHub
    └── Static SPA hosting (port 3000)
```

---

## 4. APIs e Provedores Suportados
1. **Google Gemini**: Modelos `gemini-3.8-flash` e `gemini-3.1-pro-preview` via `@google/genai`
2. **GitHub OAuth 2.0**: Autenticação em popup, listagem de repositórios, Pull e Push diretos
3. **OpenCode Zen**: `https://opencode.ai/zen/v1/chat/completions` (modelos gratuitos e comunitários)
4. **Pollinations.ai**: Grátis, sem necessidade de chave de API
5. **Groq**: Baixa latência, modelos Llama 3.3 e Mixtral
6. **OpenRouter**: Acesso a dezenas de modelos abertos e proprietários
7. **Ollama**: Modelos locais rodando em `http://127.0.0.1:11434`

---

## 5. Regras de Desenvolvimento e Preservação
- **NUNCA** remover comandos existentes do terminal (`/help`, `/clear`, `/cls`, `/wipe`, `/export`, `/import`, `/theme`, `/stats`, `/plugins`, `/audit`, `/whoami`, etc.).
- **NUNCA** expor secrets ou chaves de API no frontend ou em logs.
- Todo agente de IA deve criar um snapshot antes de realizar alterações no workspace.
- Todas as alterações geradas devem produzir um **diff visual** que o usuário possa Aceitar, Rejeitar ou Reverter.
- Manter compatibilidade total com dispositivos móveis (layout responsivo e touch-friendly).
- Preservar a estética cyberpunk/terminal dark do TermChat.

---

## 6. Variáveis de Ambiente (`.env`)
```
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
GEMINI_API_KEY=
OPENCODE_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

---

## 7. Comandos de Desenvolvimento e Teste
- `npm run dev`: Inicia o servidor de desenvolvimento na porta 3000
- `npm run build`: Valida sintaxe e arquivos do projeto
- `npm run lint`: Checagem de código com Node.js
