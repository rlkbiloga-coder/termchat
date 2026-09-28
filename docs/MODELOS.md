# Guia de Modelos e Provedores Gratuitos de IA no TermChat

O TermChat possui suporte a múltiplos provedores de inteligência artificial através de uma arquitetura flexível baseada em catálogo estruturado (`data/models.json`).

Este guia explica como obter chaves de API gratuitas para cada provedor e como configurar o arquivo `.env` da sua aplicação TermChat.

---

## Tiers de Prioridade e Custo

O TermChat organiza os provedores em níveis de prioridade de custo para seleção e fallback inteligente de modelos:

1. **`local`**: Execução 100% local no dispositivo do usuário (ex: Ollama). Custo zero, máxima privacidade, sem limites externos.
2. **`free_tier`**: Provedores em nuvem que oferecem cupons/créditos gratuitos ou cotas recorrentes sem necessidade de cartão de crédito.
3. **`api_barata`**: Provedores comerciais de ultra baixo custo por token (ex: DeepSeek, Together pago, OpenRouter economia).
4. **`premium`**: Modelos de ponta (ex: Claude 3.5 Sonnet, GPT-4o) para casos onde desempenho máximo é exigido.

---

## Tabela de Provedores Gratuitos Suportados

| Provedor | Endpoint Base | Variável de Ambiente (`.env`) | Prioridade | Limites do Free Tier | Link de Cadastro |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Ollama** | `http://localhost:11434/v1` | *(Sem chave)* | `local` | Sem limites (depende do hardware local) | [ollama.com](https://ollama.com) |
| **Pollinations AI** | `https://text.pollinations.ai/` | *(Sem chave)* | `free_tier` | 100% gratuito, sem cadastro | [pollinations.ai](https://pollinations.ai) |
| **Groq Cloud** | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` | `free_tier` | 30 RPM / 14.400 RPD / 6K TPM | [console.groq.com](https://console.groq.com) |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `free_tier` | Modelos `:free` (~20 req/min) | [openrouter.ai](https://openrouter.ai/keys) |
| **NVIDIA NIM** | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` | `free_tier` | 1.000 créditos grátis de API | [build.nvidia.com](https://build.nvidia.com) |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai/` | `GEMINI_API_KEY` | `free_tier` | 15 RPM / 1.500 RPD no Google AI Studio | [aistudio.google.com](https://aistudio.google.com) |
| **Cerebras Cloud** | `https://api.cerebras.ai/v1` | `CEREBRAS_API_KEY` | `free_tier` | 30 RPM / 14.400 RPD (ultra veloz) | [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| **Mistral AI** | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` | `free_tier` | Acesso gratuito de testes no La Plateforme | [console.mistral.ai](https://console.mistral.ai) |
| **Together AI** | `https://api.together.xyz/v1` | `TOGETHER_API_KEY` | `free_tier` | $1,00 USD de crédito gratuito no cadastro | [together.ai](https://www.together.ai) |
| **Hugging Face** | `https://api-inference.huggingface.co/v1` | `HUGGINGFACE_API_KEY` | `free_tier` | Requisições com taxa limitada no Serverless API | [huggingface.co](https://huggingface.co/settings/tokens) |

---

## Onde e Como Conseguir Cada Chave Gratuita

### 1. Ollama (Execução Local)
- **Como obter:** Não exige chave de API nem conexão com a nuvem.
- **Passos:**
  1. Baixe e instale o Ollama em [ollama.com](https://ollama.com).
  2. Execute no seu terminal: `ollama run llama3.2` ou `ollama run mistral`.
  3. O Ollama disponibilizará a API em `http://localhost:11434/v1`.

### 2. Pollinations AI
- **Como obter:** 100% gratuito, sem chave de API e sem necessidade de cadastro.
- **Passos:**
  1. Basta selecionar o provedor Pollinations no TermChat.
  2. Endpoint: `https://text.pollinations.ai/`.

### 3. Groq Cloud
- **Como obter:** Chave de API gratuita sem necessidade de cartão de crédito.
- **Passos:**
  1. Acesse [console.groq.com](https://console.groq.com) e faça login com sua conta Google/GitHub.
  2. Vá na seção **API Keys** no menu lateral.
  3. Clique em **Create API Key**, copie o token e salve em `GROQ_API_KEY` no seu `.env`.

### 4. OpenRouter (Modelos Gratuitos `:free`)
- **Como obter:** Acesso unificado a centenas de modelos com cota gratuita para modelos marcados com `:free`.
- **Passos:**
  1. Acesse [openrouter.ai/keys](https://openrouter.ai/keys) e faça cadastro.
  2. Crie uma chave de API gratuita.
  3. Copie a chave e defina `OPENROUTER_API_KEY` no `.env`.
  4. Escolha modelos com a extensão `:free` (ex: `meta-llama/llama-3.3-70b-instruct:free`, `deepseek/deepseek-r1:free`).

### 5. NVIDIA NIM
- **Como obter:** 1.000 créditos gratuitos ao se registrar no NVIDIA Developer Program.
- **Passos:**
  1. Acesse [build.nvidia.com](https://build.nvidia.com).
  2. Faça login ou crie uma conta de desenvolvedor NVIDIA.
  3. Navegue até qualquer modelo de linguagem (ex: Llama 3.3 70B Instruct).
  4. Clique em **Get API Key**, copie e salve em `NVIDIA_API_KEY`.

### 6. Google Gemini (Google AI Studio)
- **Como obter:** Cota gratuita de até 15 requisições por minuto no AI Studio.
- **Passos:**
  1. Acesse [aistudio.google.com](https://aistudio.google.com).
  2. Faça login com sua conta Google.
  3. Clique em **Get API Key** e selecione **Create API key in new project**.
  4. Salve a chave gerada como `GEMINI_API_KEY` no arquivo `.env`.

### 7. Cerebras Cloud
- **Como obter:** Inferência acelerada em hardware Cerebras com cota gratuita sem cartão.
- **Passos:**
  1. Acesse [cloud.cerebras.ai](https://cloud.cerebras.ai).
  2. Crie uma conta gratuita.
  3. Acesse **API Keys** e crie um token.
  4. Salve como `CEREBRAS_API_KEY` no `.env`.

### 8. Mistral AI
- **Como obter:** Acesso de teste à plataforma La Plateforme.
- **Passos:**
  1. Acesse [console.mistral.ai](https://console.mistral.ai).
  2. Crie sua conta e verifique seu e-mail.
  3. Vá na seção **API Keys** e crie uma nova chave.
  4. Copie para a variável `MISTRAL_API_KEY` no `.env`.

### 9. Together AI
- **Como obter:** Crédito gratuito inicial de $1,00 USD ao se cadastrar.
- **Passos:**
  1. Acesse [together.ai](https://www.together.ai) e crie sua conta.
  2. Vá em **Settings** > **API Keys**.
  3. Copie a chave e defina em `TOGETHER_API_KEY` no seu `.env`.

### 10. Hugging Face Inference API
- **Como obter:** Token de acesso para a API Serverless gratuita do Hugging Face.
- **Passos:**
  1. Acesse [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
  2. Clique em **Create new token** com permissão `Read`.
  3. Copie o token e defina em `HUGGINGFACE_API_KEY` no `.env`.

---

## Como Configurar no `.env` do TermChat

1. Copie o arquivo `.env.example` para `.env` na raiz do projeto TermChat:
   ```bash
   cp .env.example .env
   ```

2. Preencha as chaves de API dos provedores que você deseja utilizar:
   ```env
   # Configurações do TermChat
   PORT=3000
   NODE_ENV=development

   # Chaves de API de Provedores Free
   GROQ_API_KEY=gsk_sua_chave_groq_aqui
   OPENROUTER_API_KEY=sk-or-v1-sua_chave_openrouter_aqui
   NVIDIA_API_KEY=nvapi-sua_chave_nvidia_aqui
   GEMINI_API_KEY=AIzaSy_sua_chave_gemini_aqui
   CEREBRAS_API_KEY=csk-sua_chave_cerebras_aqui
   MISTRAL_API_KEY=sua_chave_mistral_aqui
   TOGETHER_API_KEY=sua_chave_together_aqui
   HUGGINGFACE_API_KEY=hf_sua_chave_huggingface_aqui
   ```

3. Caso um provedor não tenha chave preenchida no `.env`, o TermChat tentará utilizar chaves salvas localmente no `localStorage` do navegador do usuário ou fará fallback para provedores sem autenticação obrigatória (`ollama` local ou `pollinations`).

---

## Estrutura do Catálogo (`data/models.json`)

O arquivo `data/models.json` define a lista de provedores ativos e seus respectivos metadados:

```json
{
  "id": "groq",
  "nome": "Groq Cloud",
  "endpoint": "https://api.groq.com/openai/v1",
  "auth": "GROQ_API_KEY",
  "modelos_principais": [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768"
  ],
  "limites": "30 RPM, 14.400 RPD",
  "prioridade": "free_tier",
  "doc_url": "https://console.groq.com"
}
```

O engine do TermChat utiliza essas informações para:
- Apresentar o seletor de modelos na interface do usuário.
- Montar a cadeia de fallback automático em caso de rate-limiting (HTTP 429) ou instabilidade no provedor primário.
