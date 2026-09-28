# TermChat v2.1 — Web IDE, AI Code Review & Cloud Platform

[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Google](https://img.shields.io/badge/Google-Gemini%202.5%2F3.8-4285F4?logo=google)]()
[![GitHub](https://img.shields.io/badge/GitHub-OAuth%202.0-181717?logo=github)]()
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa)]()
[![Padrões Abertos](https://img.shields.io/badge/Standards-REST%20%7C%20MCP%20%7C%20OpenAPI%20%7C%20LSP-green)]()

> **TermChat** é uma Web IDE profissional e plataforma de desenvolvimento assistida por Inteligência Artificial integrada ao ecossistema Google, GitHub e padrões abertos (MCP, LSP, OpenAPI, WebSocket, WebAssembly).

Site Oficial / GitHub Pages: **[https://nicolaswjwkwk.github.io/termchat/](https://nicolaswjwkwk.github.io/termchat/)**

---

## 🏛️ Arquitetura do Sistema

```
                    TERMCHAT PLATFORM
                           │
            ┌──────────────┼──────────────┐
            │              │              │
         FRONTEND        BACKEND        WORKERS
            │              │              │
        Explorer       API Gateway      AI Worker
        Editor         Auth (Google)    Audit Worker
        Terminal       Plugins Registry Plugin Worker
        Chat / Agent   MCP Hub
        Live Preview   Git & GitHub
                           │
              ┌────────────┼────────────┐
              │            │            │
            AI           CLOUD        DATA
              │            │            │
          Gemini        Google Drive  Supabase
          OpenCode      GitHub Pages  Firebase
          Claude        Vercel        PostgreSQL
          OpenRouter    Cloudflare    Redis
          Ollama        Railway       VFS Local
```

---

## ✨ Principais Funcionalidades

### 1. 🛡️ Auditoria de Repositório & Riscos GitHub
- **Dependabot Scanner**: Detecção de dependências vulneráveis e links diretos para avisos de segurança.
- **Code Scanning (CodeQL)**: Análise estática de vulnerabilidades e injeções de código.
- **Secret & Token Leaks**: Verificação de vazamento acidental de chaves e credenciais nos commits.
- **Workflows CI/CD**: Inspeção de status de execução de GitHub Actions e logs de falha.
- **Pontuação de Segurança**: Score de risco (0 a 100) com checklist de proteção do repositório.

### 2. ⚡ AI Code Review & Correção em 1 Clique
- Diagnóstico automático de sintaxe, chaves desbalanceadas e erros de execução.
- Análise de memory leaks, dead code e antipatterns.
- Sugestões práticas de código com botão **"✓ Aplicar Correção"** instantâneo no editor.

### 3. 🇬 Integração Completa com o Ecossistema Google
- **Google Gemini AI**: Suporte oficial ao `@google/genai` (modelos `gemini-3.8-flash` e `gemini-2.5-pro`) com raciocínio, visão e function calling.
- **Login com Google**: Autenticação OAuth 2.0 / OpenID Connect com exibição de perfil e avatar.
- **Google Drive Backup**: Sincronização e backup na nuvem de projetos e workspaces com 1 clique.
- **Google Search Grounding**: Respostas com dados em tempo real e citações da web.
- **Site Formal Google**: Conformidade com Google Search Console, tags canônicas, `robots.txt`, `sitemap.xml`, OpenGraph e Schema.org JSON-LD.

### 4. 🔌 Registry de Conectores & Plugins (Lazy Loading)
- Carregamento sob demanda com detecção de capacidades (*capabilities*):
  - **Google**: Gemini 2.5/3.8, Drive Sync, Search Grounding.
  - **Git**: GitHub OAuth, GitLab CI/CD, Gist Exporter.
  - **MCP (Model Context Protocol)**: FileSystem, Memory Graph, SQLite, Fetch Web.
  - **Cloud & Deploy**: GitHub Pages (1-click), Vercel, Cloudflare Pages/Workers.
  - **Bancos de Dados**: Supabase PostgreSQL, Firebase Firestore, Upstash Redis.
  - **DevTools**: REST/OpenAPI Tester, WebSocket Inspector, WebAssembly Runner, LSP Linter.

### 5. 📱 PWA & Otimização Mobile com Permissões
- Permissões nativas com painel dedicado:
  - 📷 **Câmera**: Scanner QR e OCR de código.
  - 🎤 **Microfone**: Entrada de voz e ditado de comandos.
  - 📁 **Arquivos**: Leitura/escrita no sistema de arquivos local.
  - 🔔 **Notificações**: Avisos de conclusão de build e alertas de segurança.
  - 🔋 **Wake Lock**: Evita bloqueio da tela durante operações no terminal.
- Barra de navegação móvel de 1 toque: `[📁 Arquivos] [💻 Editor] [🛡️ Riscos] [⌨️ Terminal] [🌐 Preview] [🤖 Agente IA] [📱 Permissões]`.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- Node.js 18+ (ou Bun / Deno)

### Instalação e Execução
```bash
# 1. Clone o repositório
git clone https://github.com/nicolaswjwkwk/termchat.git
cd termchat

# 2. Instale as dependências
npm install

# 3. Inicie o servidor em modo desenvolvimento
npm start
```

O aplicativo estará disponível em: **`http://localhost:3000`**

### Variáveis de Ambiente (Opcionais em `.env`)
```env
GEMINI_API_KEY=sua_chave_gemini_aqui
NVIDIA_API_KEY=sua_chave_nvapi_aqui
GITHUB_CLIENT_ID=seu_client_id_github
GITHUB_CLIENT_SECRET=seu_client_secret_github
GOOGLE_CLIENT_ID=seu_client_id_google
PORT=3000
```

---

## 📦 Deploy para GitHub Pages

Este repositório já inclui workflow automatizado em `.github/workflows/deploy.yml`:
1. No seu repositório no GitHub, vá em **Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Faça push para a branch `main` — a publicação será feita automaticamente em `https://<seu-usuario>.github.io/termchat/`.
4. Arquivos de roteamento SPA (`404.html`), SEO (`robots.txt`, `sitemap.xml`) e bypass Jekyll (`.nojekyll`) já estão configurados na raiz.

---

## 📜 Padrões Abertos Suportados
- **REST & OpenAPI 3.1**: Endpoints modulares e documentados.
- **Model Context Protocol (MCP)**: Integração aberta de ferramentas de contexto de IA.
- **OAuth 2.0 & OIDC**: Autenticação segura sem credenciais expostas no cliente.
- **WebSocket & SSE**: Streaming em tempo real para chat e terminal.
- **Language Server Protocol (LSP)**: Diagnóstico e autocompletação de código.
- **WebAssembly (WASM)**: Execução segura de módulos binários de alta performance.

---

## 📄 Licença
Distribuído sob a licença **MIT**. Consulte `LICENSE` para mais informações.
