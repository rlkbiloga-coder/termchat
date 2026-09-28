# Especificação Técnica: Instalador de Plugins via GitHub no TermChat

Este documento especifica a arquitetura, protocolos de busca, formato de manifesto, rotas de servidor, interface de usuário e medidas de segurança para o **Instalador de Plugins e Conectores via GitHub** do TermChat.

---

## 1. Visão Geral e Filosofia de Execução

O TermChat permite a expansão de suas funcionalidades por meio de um ecossistema modular de plugins e conectores (ex: integrações com Google Workspace, ferramentas Git, conectores de IA e utilitários de produtividade).

Para permitir que a comunidade publique e instale plugins diretamente de repositórios do GitHub, o instalador adota uma abordagem de **Zero-Trust para Código Remoto**:
1. **Descoberta Dinâmica:** Consulta repositórios e manifestos via GitHub Search API e `raw.githubusercontent.com`.
2. **Validação Rígida de Manifesto:** Todo plugin possui um manifesto JSON estritamente validado antes de qualquer exibição ou instalação.
3. **Allowlist de Permissões:** Plugins só podem solicitar permissões pré-aprovadas pelo ecossistema do TermChat.
4. **Sem Execução Remota Não Revisada:** Proibição total de `eval()`, scripts remotos arbitrários ou injeções dinâmicas sem isolamento e consentimento do usuário.
5. **Transparência na UI:** O usuário visualiza o autor, o código-fonte, a versão e as permissões exatas solicitadas antes de confirmar a instalação.

---

## 2. Busca de Plugins em Repositórios GitHub

A busca de plugins pode ser realizada tanto no catálogo interno registrado em `plugins.json` quanto dinamicamente em repositórios públicos do GitHub.

```
┌─────────────────┐       ┌──────────────────────┐       ┌────────────────────────────────┐
│   TermChat UI   │ ────> │  /api/plugins/search │ ────> │  GitHub Search API             │
│  (Aba Explorar) │ <──── │     (server.js)      │ <──── │  (api.github.com/search/...)   │
└─────────────────┘       └──────────────────────┘       └────────────────────────────────┘
                                    │                                    │
                                    ▼                                    ▼
                          ┌──────────────────────┐       ┌────────────────────────────────┐
                          │ /api/plugins/install │ ────> │ raw.githubusercontent.com       │
                          │     (server.js)      │ <──── │ (Download do manifesto)        │
                          └──────────────────────┘       └────────────────────────────────┘
```

### 2.1. Endpoints de Consulta Upstream
- **API de Busca do GitHub:**
  `GET https://api.github.com/search/repositories?q=topic:termchat-plugin+{query}`
  ou consulta por arquivo de manifesto:
  `GET https://api.github.com/search/code?q=filename:termchat-plugin.json+{query}`
- **Download do Manifesto Raw:**
  `GET https://raw.githubusercontent.com/{owner}/{repo}/{branch}/termchat-plugin.json` (ou `plugin.json`).

### 2.2. Autenticação e Rate Limits da API do GitHub
- **Modo Anônimo:** Até 60 requisições por hora por endereço IP.
- **Modo Autenticado:** Suporte à variável de ambiente `GITHUB_TOKEN` no servidor TermChat para elevar a cota para 5.000 requisições/hora.
- **Tratamento de Rate Limit:**
  - O servidor faz cache em memória dos resultados de busca por **15 minutos**.
  - Em caso de estouro de cota (HTTP 429 ou HTTP 403 Rate Limit), o servidor responde com fallback gracioso apontando para os plugins em cache ou para o catálogo pré-carregado de `plugins.json`.

---

## 3. Especificação e Validação do Manifesto (`termchat-plugin.json`)

Todo plugin instalável via GitHub deve conter na raiz do repositório um arquivo de manifesto chamado `termchat-plugin.json` (ou `plugin.json`).

### 3.1. Estrutura do JSON do Manifesto
```json
{
  "id": "github-connector",
  "name": "GitHub & Git Repos",
  "version": "2.1.0",
  "cat": "git",
  "desc": "Clonagem, pull, push, auditoria de segurança (Dependabot, CodeQL) e gestão de issues no TermChat.",
  "author": {
    "name": "TermChat Core Team",
    "github": "nicolaswjwkwk"
  },
  "perms": [
    "clipboard",
    "notifications"
  ],
  "api": "GitHub REST & GraphQL API",
  "standard": "OAuth 2.0 / REST",
  "capabilities": [
    "vcs",
    "pull",
    "push",
    "audit",
    "issues"
  ],
  "repository": "https://github.com/nicolaswjwkwk/termchat"
}
```

### 3.2. Regras Estritas de Validação de Campos
1. **`id` (Obrigatório):**
   - Deve ser uma string minúscula alfanumérica com hífens/underscores (regex: `^[a-z0-9-_]+$`).
   - Tamanho: entre 3 e 64 caracteres.
   - **Unicidade:** O servidor rejeita a instalação caso o `id` já exista no registro local, a menos que seja uma atualização válida de versão do mesmo repositório autoritativo.
2. **`name` (Obrigatório):** String legível entre 3 e 50 caracteres.
3. **`version` (Obrigatório):** Formato SemVer válido (`x.y.z`).
4. **`cat` (Obrigatório):** Categoria válida (`google`, `git`, `ai`, `devtools`, `util`, `media`, `productivity`).
5. **`desc` (Obrigatório):** Descrição textual de 10 a 300 caracteres explicativa da utilidade do plugin.
6. **`perms` (Obrigatório):** Array de strings contendo **apenas** permissões presentes na Allowlist Oficial.

### 3.3. Allowlist Oficial de Permissões
As permissões declaradas no campo `perms` devem obrigatoriamente pertencer ao conjunto autorizado pelo sistema:

| Permissão | Recurso Solicitado | Descrição e Impacto |
| :--- | :--- | :--- |
| **`geolocation`** | Navigator Geolocation API | Acesso à localização geográfica do dispositivo do usuário. |
| **`notifications`** | Web Notifications API | Exibição de alertas e notificações nativas no sistema operacional. |
| **`clipboard`** | Clipboard API | Leitura e gravação na área de transferência do usuário. |
| **`camera`** | MediaDevices getUserMedia (Vídeo) | Captura de imagens ou stream da câmera. |
| **`mic`** | MediaDevices getUserMedia (Áudio) | Entrada de áudio para comandos por voz ou transcrição. |
| **`storage`** | localStorage / IndexedDB / VFS | Persistência local de dados e arquivos no espaço de trabalho do TermChat. |

> **Nota sobre o estado atual do repositório:** No `plugins.json` nativo do TermChat, as permissões atualmente utilizadas nos conectores padrão são `geolocation` e `notifications`, além de conectores sem acesso a dispositivos (`perms: []`).

### 3.4. Política de Código Remoto
- **Proibição de `eval()` e `new Function()`:** O servidor e o cliente validam e rejeitam qualquer código de plugin que utilize execução dinâmica de strings.
- **Proibição de Scripts de CDN Externa:** Não é permitida a inclusão dinâmica de tags `<script src="https://...">` apontando para CDNs de terceiros não auditadas.
- **Revisão e Registro do Código:** O código-fonte do plugin deve ser hospedado no GitHub, baixado no momento da instalação, validado por análise estática e executado em escopo isolado do cliente.

---

## 4. Definição das Rotas do Servidor em `server.js`

### 4.1. `GET /api/plugins/search`
Pesquisa plugins no catálogo local e em repositórios remotos do GitHub.

- **Query Parameters:**
  - `q` (string, opcional): Termo de busca (ex: `drive`, `git`).
  - `cat` (string, opcional): Categoria para filtragem.
  - `source` (string, opcional): Fonte de busca (`all` | `local` | `github`). Padrão: `all`.

- **Exemplo de Request:**
  `GET /api/plugins/search?q=github&source=all`

- **Exemplo de Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "total": 1,
    "query": "github",
    "source": "all",
    "plugins": [
      {
        "id": "github-connector",
        "name": "GitHub & Git Repos",
        "version": "2.1.0",
        "cat": "git",
        "desc": "Clonagem, pull, push, auditoria de segurança (Dependabot, CodeQL) e gestão de issues no TermChat.",
        "perms": ["clipboard", "notifications"],
        "author": "TermChat Core Team",
        "repository": "https://github.com/nicolaswjwkwk/termchat",
        "manifest_url": "https://raw.githubusercontent.com/nicolaswjwkwk/termchat/main/termchat-plugin.json",
        "installed": true,
        "source": "registry"
      }
    ]
  }
  ```

- **Exemplo de Response em caso de Erro (HTTP 400 Bad Request):**
  ```json
  {
    "success": false,
    "error": "BAD_REQUEST",
    "message": "O parâmetro de busca 'q' possui formato inválido."
  }
  ```

---

### 4.2. `POST /api/plugins/install`
Baixa, valida e instala um plugin a partir de uma URL de repositório ou manifesto do GitHub.

- **Headers:** `Content-Type: application/json`

- **Request Body:**
  ```json
  {
    "repo_url": "https://github.com/user/termchat-custom-plugin",
    "manifest_url": "https://raw.githubusercontent.com/user/termchat-custom-plugin/main/termchat-plugin.json",
    "confirm_permissions": true
  }
  ```

- **Fluxo de Execução no Servidor:**
  1. **Sanitização da URL:** Verifica se `manifest_url` pertence aos domínios autorizados (`github.com` ou `raw.githubusercontent.com`). Bloqueia IPs e domínios internos (Proteção SSRF).
  2. **Fetch do Manifesto:** Faz o download HTTP do manifesto com timeout de 5s e limite de tamanho de payload (máx 100 KB).
  3. **Validação do Schema:** Confirma presença dos campos obrigatórios e valida a allowlist de `perms`.
  4. **Checagem de Consentimento:** Se `perms` não for vazio e `confirm_permissions` for `false`, interrompe com aviso de confirmação exigida.
  5. **Verificação de Duplicidade:** Garante que não sobresscreve um plugin do sistema sem permissão.
  6. **Persistência:** Atualiza a lista de plugins instalados no workspace local.

- **Exemplo de Response (HTTP 201 Created):**
  ```json
  {
    "success": true,
    "message": "Plugin 'termchat-custom-plugin' instalado com sucesso.",
    "plugin": {
      "id": "termchat-custom-plugin",
      "name": "Plugin Customizado da Comunidade",
      "version": "1.0.0",
      "cat": "util",
      "perms": ["notifications"],
      "installed_at": "2026-09-28T11:50:00.000Z"
    }
  }
  ```

- **Exemplo de Response de Rejeição de Validação (HTTP 422 Unprocessable Entity):**
  ```json
  {
    "success": false,
    "error": "INVALID_MANIFEST",
    "message": "Falha na validação do manifesto do plugin.",
    "violations": [
      "A permissão 'system-exec' solicitada não está na allowlist permitida pelo TermChat."
    ]
  }
  ```

---

### 4.3. `DELETE` / `POST /api/plugins/uninstall`
Remove um plugin previamente instalado pelo usuário.

- **Headers:** `Content-Type: application/json`

- **Request Body:**
  ```json
  {
    "id": "termchat-custom-plugin"
  }
  ```

- **Exemplo de Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Plugin 'termchat-custom-plugin' desinstalado com sucesso.",
    "id": "termchat-custom-plugin"
  }
  ```

- **Exemplo de Response de Erro (HTTP 404 Not Found):**
  ```json
  {
    "success": false,
    "error": "PLUGIN_NOT_FOUND",
    "message": "Plugin com ID 'termchat-custom-plugin' não está instalado."
  }
  ```

---

## 5. Interface do Usuário (UI na Aba "Explorar")

A interface de gerenciamento de plugins fica localizada na aba **Explorar** (`#explore-tab`) na UI principal do TermChat.

### 5.1. Componentes da Tela
1. **Cabeçalho da Aba Explorar:**
   - Campo de Busca com ícone de lupa e debounce de 300ms.
   - Filtro de Categorias (Todas, Google, Git, IA, Utilitários, DevTools).
   - Toggle/Botão para incluir busca estendida no GitHub.
2. **Grade / Lista de Cards de Plugins:**
   - **Ícone e Título:** Nome do plugin e badge de versão (ex: `v2.1.0`).
   - **Badge de Autor:** Nome do criador com link para o perfil no GitHub.
   - **Descrição:** Texto resumo do que o plugin realiza.
   - **Seção de Permissões Solicitadas:** Badges visuais destacando cada permissão solicitada:
     - 📍 `geolocation` (amarelo/alerta)
     - 🔔 `notifications` (azul)
     - 📋 `clipboard` (roxo)
     - 📷 `camera` / 🎤 `mic` (vermelho/alto impacto)
     - 💾 `storage` (cinza)
   - **Botões de Ação Dinâmicos:** `Instalar`, `Desinstalar` ou `Atualizar`.

### 5.2. Modal de Consentimento de Permissões
Ao clicar no botão `Instalar` para um plugin que solicita permissões (ex: `camera`, `geolocation`, `clipboard`), um modal interativo exibe:
- Nome do plugin e repositório de origem.
- Lista detalhada das permissões solicitadas e por que o plugin precisa delas.
- Aviso de segurança do TermChat.
- Botões: `[Cancelar]` e `[Aprovar e Instalar]`.

### 5.3. Estados Visuais da Interface
- **Estado Inicial / Idle:** Exibe o catálogo local de plugins nativos e instalados organizados por categoria.
- **Estado de Loading:**
  - Animação de Skeleton nos cards da lista enquanto a consulta à API do GitHub e ao servidor está em andamento.
  - Botão de ação exibe spinner desabilitado com texto `"Buscando..."` ou `"Instalando..."`.
- **Estado de Sucesso:**
  - Exibição de Toast verde de confirmação (`"Plugin X instalado com sucesso!"`).
  - O card atualiza instantaneamente seu status para `"Instalado"`, trocando o botão para `"Desinstalar"` (com estilo secundário/outline).
- **Estado de Erro:**
  - Exibição de Alert/Banner vermelho com o motivo legível da falha (ex: `"URL do GitHub inválida"`, `"Permissão não permitida pela política de segurança"`, ou `"Limite de requisições do GitHub excedido"`).
  - Botão `"Tentar Novamente"`.

---

## 6. Análise de Riscos de Segurança e Mitigações

| Vetor de Risco | Descrição do Ataque | Impacto no TermChat | Estratégia de Mitigação Obrigatória |
| :--- | :--- | :--- | :--- |
| **SSRF (Server-Side Request Forgery)** | Atacante envia URLs de instalação apontando para IPs privados internos (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, ou `169.254.169.254` do AWS Metadata Service) na rota `/api/plugins/install`. | Leitura não autorizada de serviços e metadados internos do servidor Node.js/Cloud. | **1. Allowlist Estrita de Domínios:** O servidor aceita requisições apenas para o host `github.com` e `raw.githubusercontent.com`.<br>**2. Validação DNS/IP Pre-flight:** O servidor resolve o IP do destino antes do fetch e rejeita qualquer IP nas faixas RFC 1918, RFC 3927 e loopback. |
| **Injeção de Manifesto / Payload Poisoning** | Repositório malicioso retorna JSON com propriedades corrompidas, chaves de poluição de protótipo (`__proto__`, `constructor`) ou valores gigantescos em `name`/`desc`. | Instabilidade no servidor Node.js, DoS ou quebra na renderização do cliente. | **1. JSON Schema Strict Validation:** Validação estrita de cada campo com descarte de chaves desconhecidas.<br>**2. Sanitização do Objeto:** Congelamento do protótipo (`Object.freeze`) do manifesto parseado e rejeição explícita de chaves reservadas.<br>**3. Limite de Tamanho:** Download HTTP abortado se o payload ultrapassar 100 KB. |
| **Plugins Maliciosos & Execução de Código Arbitrário** | Plugin remoto tenta injetar scripts inline via `eval()`, capturar `document.cookie`, ou vazar chaves de API (`GEMINI_API_KEY`, `GROQ_API_KEY`). | Comprometimento da privacidade do usuário e roubo de credenciais do chat. | **1. Bloqueio Total de Eval:** Diretiva CSP e código do TermChat proíbem `eval()`, `new Function()` e `innerHTML` sem sanitização.<br>**2. Allowlist Fechada de Permissões:** Plugins não conseguem solicitar permissões do sistema fora das 6 permitidas (`geolocation`, `notifications`, `clipboard`, `camera`, `mic`, `storage`).<br>**3. Isolamento de Escopo:** Chaves de API do ambiente do servidor ficam estritamente no escopo do Node.js e nunca expostas globalmente no cliente. |
| **Elevação de Privilégios Não Autorizada** | Plugin tenta alterar manifestos de outros plugins ou acessar permissões de câmera/mic sem o usuário perceber. | Violação de privacidade física do usuário. | **1. Modal Obrigatório de Confirmação:** Qualquer permissão diferente de `perms: []` exige confirmação explícita do usuário na UI.<br>**2. Verificação de Consentimento no Servidor:** O endpoint `/api/plugins/install` exige o parâmetro `confirm_permissions: true`. |
| **Ataque de Negação de Serviço (DoS / Rate Limit)** | Ataque automatizado faz milhares de buscas na rota `/api/plugins/search`, esgotando o limite da API do GitHub ou recursos do servidor. | Indisponibilidade temporária da funcionalidade de busca de plugins. | **1. Rate Limiting por IP:** Aplicação de limite de requisições no `server.js` nas rotas `/api/plugins/*`.<br>**2. Cache de Busca em Memória:** Resultados de busca mantidos em cache por 15 minutos.<br>**3. Timeouts Rígidos:** Timeout de 5 segundos em todas as requisições para o GitHub. |

---

## 7. Checklist de Implementação e Aceitação

- [ ] **`docs/SPEC-INSTALADOR.md` criado e commitado no repositório TermChat.**
- [ ] **Validador de Manifesto:** Módulo de validação de schema e allowlist de permissões (`geolocation`, `notifications`, `clipboard`, `camera`, `mic`, `storage`).
- [ ] **Rotas do Servidor em `server.js`:**
  - `GET /api/plugins/search`
  - `POST /api/plugins/install`
  - `DELETE /api/plugins/uninstall`
- [ ] **UI na Aba Explorar:**
  - Barra de busca de plugins com debounce.
  - Lista de cards com badges de permissões solicitadas.
  - Modal de consentimento e diálogo de confirmação de permissões.
  - Tratamento dos estados: *Loading*, *Sucesso*, *Erro* e *Instalado*.
- [ ] **Aprovação nos Testes:** `npm test` verde garantindo que os manifestos e especificações atendem às regras de integridade do TermChat.
