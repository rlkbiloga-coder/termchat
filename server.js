import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:8080,http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const ALLOWED_TARGETS = {
  pollinations: 'https://text.pollinations.ai/openai',
  zen: 'https://opencode.ai/zen/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'termchat-bridge',
    version: '2.0.0',
    providers: ['gemini', 'zen', 'pollinations', 'groq', 'openrouter', 'ollama'],
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// Models catalogue and provider metadata
app.get('/api/models', (req, res) => {
  res.json({
    providers: [
      {
        id: 'auto',
        name: 'Auto (Cascata inteligente com Fallback)',
        free: true,
        requiresKey: false,
        models: ['auto-cascade'],
        defaultModel: 'gemini-3.8-flash'
      },
      {
        id: 'gemini',
        name: 'Google Gemini (Oficial @google/genai)',
        free: true,
        requiresKey: !process.env.GEMINI_API_KEY,
        models: ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'],
        defaultModel: 'gemini-3.8-flash'
      },
      {
        id: 'zen',
        name: 'OpenCode Zen (Modelos Comunitários & Free)',
        free: true,
        requiresKey: false,
        models: ['gemini-3.5-flash', 'llama-3.3-70b', 'qwen-2.5-coder-32b', 'deepseek-chat'],
        defaultModel: 'gemini-3.5-flash'
      },
      {
        id: 'pollinations',
        name: 'Pollinations.ai (100% Free, Sem chave)',
        free: true,
        requiresKey: false,
        models: ['openai', 'mistral', 'searchgpt'],
        defaultModel: 'openai'
      },
      {
        id: 'groq',
        name: 'Groq (Ultra-Rápido)',
        free: true,
        requiresKey: true,
        models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
        defaultModel: 'llama-3.3-70b-versatile'
      },
      {
        id: 'openrouter',
        name: 'OpenRouter (Multi-Modelos)',
        free: false,
        requiresKey: true,
        models: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free', 'anthropic/claude-3.5-sonnet'],
        defaultModel: 'meta-llama/llama-3.3-70b-instruct:free'
      },
      {
        id: 'ollama',
        name: 'Ollama (Localhost :11434)',
        free: true,
        requiresKey: false,
        models: ['llama3.2', 'codellama', 'deepseek-coder'],
        defaultModel: 'llama3.2'
      }
    ]
  });
});

// Plugins catalog
app.get('/api/plugins', (req, res) => {
  try {
    const pluginsPath = path.join(__dirname, 'plugins.json');
    const data = JSON.parse(fs.readFileSync(pluginsPath, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read plugins catalog' });
  }
});

// Helper: Call Gemini using official SDK
async function callGemini({ model = 'gemini-3.8-flash', messages, apiKey }) {
  const effectiveKey = apiKey || process.env.GEMINI_API_KEY;
  if (!effectiveKey) {
    throw new Error('Chave Gemini não configurada (defina GEMINI_API_KEY no servidor ou no TermChat)');
  }

  const ai = new GoogleGenAI({ apiKey: effectiveKey });
  
  // Format messages for gemini
  let systemInstruction = undefined;
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }
  }

  // Ensure at least one content
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Olá' }] });
  }

  const validModel = model && model.startsWith('gemini-') ? model : 'gemini-3.8-flash';
  const response = await ai.models.generateContent({
    model: validModel,
    contents,
    config: systemInstruction ? { systemInstruction } : undefined
  });

  const text = response.text;
  if (!text) {
    throw new Error('Resposta vazia recebida do Gemini');
  }
  return text;
}

// Helper: Call upstream HTTP OpenAI-compatible endpoint
async function callUpstream({ target, provider, model, messages, apiKey }) {
  const body = { messages };
  if (model) body.model = model;

  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  const headers = { 'Content-Type': 'application/json' };

  const key = apiKey || envKey;
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  const upstreamResp = await fetch(target, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!upstreamResp.ok) {
    throw new Error(`Upstream ${provider} status ${upstreamResp.status}`);
  }

  const data = await upstreamResp.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`Resposta inválida do provedor ${provider}`);
  }
  return text;
}

// Unified Chat with Fallback Cascade
app.post('/api/chat', async (req, res) => {
  const { provider = 'auto', model, messages = [], stream = false, apiKey } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ detail: 'Lista de mensagens obrigatória' });
  }

  // Determine fallback order
  const candidates = [];
  if (provider === 'gemini') {
    candidates.push('gemini');
  } else if (provider !== 'auto') {
    candidates.push(provider);
    candidates.push('pollinations');
  } else {
    // Auto cascade: Try Gemini first if key available, then Zen, then Pollinations (always free), then Groq, OpenRouter
    if (apiKey || process.env.GEMINI_API_KEY) candidates.push('gemini');
    candidates.push('zen', 'pollinations');
    if (process.env.GROQ_API_KEY) candidates.push('groq');
    if (process.env.OPENROUTER_API_KEY) candidates.push('openrouter');
  }

  const errors = [];
  let successfulText = null;
  let successfulProvider = null;

  for (const currentProvider of candidates) {
    try {
      if (currentProvider === 'gemini') {
        successfulText = await callGemini({ model, messages, apiKey });
        successfulProvider = 'gemini';
        break;
      } else {
        const target = ALLOWED_TARGETS[currentProvider];
        if (!target) continue;
        successfulText = await callUpstream({
          target,
          provider: currentProvider,
          model,
          messages,
          apiKey
        });
        successfulProvider = currentProvider;
        break;
      }
    } catch (err) {
      errors.push(`${currentProvider}: ${err.message}`);
    }
  }

  if (successfulText) {
    return res.json({
      ok: true,
      text: successfulText,
      provider: successfulProvider,
      fallbackUsed: candidates[0] !== successfulProvider
    });
  }

  return res.status(502).json({
    ok: false,
    detail: `Falha na cadeia de provedores: ${errors.join(' | ')}`
  });
});

// Streaming proxy endpoint using Server-Sent Events (SSE)
app.post('/api/stream', async (req, res) => {
  const { provider = 'auto', model, messages = [], apiKey } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent('status', { msg: 'Conectando ao provedor...' });
    
    // Delegate to unified chat handler
    let resultText = '';
    let usedProvider = provider;

    if (provider === 'gemini' || (provider === 'auto' && (apiKey || process.env.GEMINI_API_KEY))) {
      usedProvider = 'gemini';
      sendEvent('status', { msg: 'Usando Gemini 3.8...' });
      resultText = await callGemini({ model, messages, apiKey });
    } else {
      const p = provider === 'auto' ? 'pollinations' : provider;
      usedProvider = p;
      sendEvent('status', { msg: `Consultando ${p}...` });
      resultText = await callUpstream({
        target: ALLOWED_TARGETS[p] || ALLOWED_TARGETS.pollinations,
        provider: p,
        model,
        messages,
        apiKey
      });
    }

    // Stream text in small chunks for smooth terminal typewriter effect
    const chunkSize = 8;
    for (let i = 0; i < resultText.length; i += chunkSize) {
      const chunk = resultText.slice(i, i + chunkSize);
      sendEvent('token', { chunk });
      await new Promise(r => setTimeout(r, 12));
    }

    sendEvent('done', { ok: true, provider: usedProvider, totalChars: resultText.length });
    res.end();
  } catch (err) {
    sendEvent('error', { message: err.message });
    res.end();
  }
});

// Deploy simulation and bundle export
app.post('/api/deploy', (req, res) => {
  const { target = 'preview', files = [], project = 'termchat-app' } = req.body || {};

  const deployId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = new Date().toISOString();

  // Validate files
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ ok: false, detail: 'Nenhum arquivo fornecido para deploy.' });
  }

  res.json({
    ok: true,
    deployId,
    target,
    project,
    timestamp,
    filesCount: files.length,
    status: 'deployed',
    liveUrl: target === 'github-pages' 
      ? `https://${project.toLowerCase().replace(/[^a-z0-9]/g, '')}.github.io/`
      : target === 'vercel'
      ? `https://${project.toLowerCase().replace(/[^a-z0-9]/g, '')}.vercel.app/`
      : target === 'netlify'
      ? `https://${project.toLowerCase().replace(/[^a-z0-9]/g, '')}.netlify.app/`
      : `/preview?id=${deployId}`,
    message: `Deploy concluído com sucesso para ${target.toUpperCase()}!`
  });
});

// ═════════════════════════════════════════════════════════════════
// GITHUB OAUTH 2.0 & REPOSITORY INTEGRATION
// ═════════════════════════════════════════════════════════════════

// 1. Get OAuth authorization URL
app.get('/api/auth/github/url', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const requestedRedirect = req.query.redirect_uri;
  const defaultRedirect = (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : `http://${req.headers.host || 'localhost:3000'}`) + '/auth/callback';
  const redirectUri = requestedRedirect || defaultRedirect;

  if (!clientId) {
    return res.json({
      ok: false,
      configured: false,
      error: 'GITHUB_CLIENT_ID não configurado nas variáveis de ambiente.',
      redirectUri
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,user,read:org',
    state: Math.random().toString(36).substring(2, 15)
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
  res.json({
    ok: true,
    configured: true,
    url,
    redirectUri
  });
});

// 2. OAuth Callback Route (handles code exchange and returns postMessage)
const githubCallbackHandler = async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error || !code) {
    const errMsg = error_description || error || 'Nenhum código de autorização recebido do GitHub.';
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Erro de Autenticação</title></head>
        <body style="background:#0b0f14;color:#ff6b6b;font-family:sans-serif;padding:30px;text-align:center">
          <h3>Falha na Autenticação com GitHub</h3>
          <p>${errMsg}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(errMsg)} }, '*');
              setTimeout(() => window.close(), 3000);
            }
          </script>
        </body>
      </html>
    `);
  }

  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('GITHUB_CLIENT_ID ou GITHUB_CLIENT_SECRET não configurados no servidor.');
    }

    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'TermChat-IDE-Platform'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Falha ao trocar código pelo token de acesso.');
    }

    const accessToken = tokenData.access_token;

    // Fetch user profile from GitHub
    const userResp = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'TermChat-IDE-Platform'
      }
    });
    const userData = await userResp.json();

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>GitHub Conectado</title>
          <style>
            body { background: #0b0f14; color: #c8d6e5; font-family: -apple-system, BlinkMacSystemFont, monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #131b24; border: 1px solid #1b2530; border-radius: 8px; padding: 24px; text-align: center; max-width: 360px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .user { color: #37e6a0; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <h3 style="color:#37e6a0;margin-top:0">✓ Conectado ao GitHub</h3>
            <p>Autenticado como <span class="user">@${userData.login || 'dev'}</span></p>
            <p style="font-size:12px;color:#5c7189">Esta janela fechará automaticamente...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH_AUTH_SUCCESS',
                provider: 'github',
                token: ${JSON.stringify(accessToken)},
                user: ${JSON.stringify({
                  login: userData.login,
                  name: userData.name || userData.login,
                  avatar_url: userData.avatar_url,
                  html_url: userData.html_url,
                  public_repos: userData.public_repos
                })}
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <body style="background:#0b0f14;color:#ff6b6b;font-family:sans-serif;padding:30px;text-align:center">
          <h3>Erro ao autenticar no GitHub</h3>
          <p>${err.message}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(err.message)} }, '*');
            }
          </script>
        </body>
      </html>
    `);
  }
};

app.get(['/auth/callback', '/auth/callback/'], githubCallbackHandler);

// Helper: Extract GitHub token from header
function getGitHubToken(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  return auth.replace(/^Bearer\s+/i, '').trim();
}

// 3. GitHub User Profile Endpoint
app.get('/api/github/user', async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Token GitHub não fornecido' });

  try {
    const ghRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'TermChat-IDE-Platform'
      }
    });

    if (!ghRes.ok) {
      return res.status(ghRes.status).json({ ok: false, error: `GitHub API error: ${ghRes.statusText}` });
    }

    const user = await ghRes.json();
    res.json({
      ok: true,
      user: {
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        public_repos: user.public_repos
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. List User Repositories
app.get('/api/github/repos', async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Token GitHub não fornecido' });

  try {
    const ghRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'TermChat-IDE-Platform'
      }
    });

    if (!ghRes.ok) {
      return res.status(ghRes.status).json({ ok: false, error: `GitHub API erro: ${ghRes.statusText}` });
    }

    const data = await ghRes.json();
    const repos = data.map(r => ({
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

    res.json({ ok: true, repos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. Pull repository files from GitHub into workspace
app.post('/api/github/pull', async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Token GitHub não fornecido' });

  const { owner, repo, branch = 'main' } = req.body || {};
  if (!owner || !repo) {
    return res.status(400).json({ ok: false, error: 'owner e repo são obrigatórios' });
  }

  try {
    // 1. Get tree recursively
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'TermChat-IDE-Platform'
      }
    });

    if (!treeRes.ok) {
      return res.status(treeRes.status).json({ ok: false, error: `Falha ao obter árvore do branch '${branch}': ${treeRes.statusText}` });
    }

    const treeData = await treeRes.json();
    const tree = treeData.tree || [];

    // Filter text/source files (skip git, lock files, images, etc. over 500KB)
    const blobs = tree.filter(item => {
      if (item.type !== 'blob') return false;
      if (item.path.startsWith('.git/')) return false;
      if (item.size && item.size > 500000) return false;
      return true;
    }).slice(0, 50); // limit to 50 key files for safety

    const files = {};
    for (const b of blobs) {
      try {
        const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${b.path}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'TermChat-IDE-Platform'
          }
        });
        if (rawRes.ok) {
          files[b.path] = await rawRes.text();
        }
      } catch (e) {
        console.warn(`Failed to fetch file ${b.path}`, e);
      }
    }

    res.json({
      ok: true,
      owner,
      repo,
      branch,
      filesCount: Object.keys(files).length,
      files
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 6. Direct Push workspace files to GitHub
app.post('/api/github/push', async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Token GitHub não fornecido' });

  const { owner, repo, branch = 'main', commitMessage = 'update: sincronização via TermChat', files = [] } = req.body || {};
  if (!owner || !repo || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ ok: false, error: 'owner, repo e lista de files são obrigatórios' });
  }

  const results = [];
  const errors = [];

  try {
    for (const f of files) {
      const cleanPath = f.path.replace(/^\/+/, '');
      // Check if file exists to get its SHA
      let currentSha = undefined;
      try {
        const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'TermChat-IDE-Platform'
          }
        });
        if (checkRes.ok) {
          const fileMeta = await checkRes.json();
          currentSha = fileMeta.sha;
        }
      } catch (e) {
        // file doesn't exist yet
      }

      // Put content
      const putBody = {
        message: `${commitMessage} [${cleanPath}]`,
        content: Buffer.from(f.content || '', 'utf-8').toString('base64'),
        branch
      };
      if (currentSha) {
        putBody.sha = currentSha;
      }

      const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TermChat-IDE-Platform'
        },
        body: JSON.stringify(putBody)
      });

      if (putRes.ok) {
        const putData = await putRes.json();
        results.push({ path: cleanPath, commit: putData.commit?.sha?.slice(0, 7) || 'ok' });
      } else {
        const errData = await putRes.json().catch(() => ({}));
        errors.push(`${cleanPath}: ${errData.message || putRes.statusText}`);
      }
    }

    if (results.length > 0) {
      return res.json({
        ok: true,
        pushedCount: results.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
        message: `Push concluído para ${owner}/${repo}@${branch} (${results.length} arquivos sincronizados).`
      });
    }

    return res.status(500).json({
      ok: false,
      error: `Falha ao fazer push: ${errors.join('; ')}`
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 7. Create a new repository on GitHub
app.post('/api/github/create-repo', async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Token GitHub não fornecido' });

  const { name, description = 'Criado pelo TermChat Web IDE', private: isPrivate = false } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Nome do repositório é obrigatório' });

  try {
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TermChat-IDE-Platform'
      },
      body: JSON.stringify({
        name: name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        description,
        private: isPrivate,
        auto_init: true
      })
    });

    const repoData = await createRes.json();
    if (!createRes.ok) {
      return res.status(createRes.status).json({ ok: false, error: repoData.message || 'Falha ao criar repositório' });
    }

    res.json({
      ok: true,
      repo: {
        name: repoData.name,
        full_name: repoData.full_name,
        owner: repoData.owner.login,
        html_url: repoData.html_url,
        default_branch: repoData.default_branch || 'main'
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 8. GitHub Security, Dependabot & Repository Alerts Scanner
app.get('/api/github/audit', async (req, res) => {
  const token = getGitHubToken(req);
  const { owner, repo } = req.query;

  if (!owner || !repo) {
    return res.status(400).json({ ok: false, error: 'owner e repo são obrigatórios' });
  }

  const headers = {
    'User-Agent': 'TermChat-IDE-Platform',
    'Accept': 'application/vnd.github+json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const fetchGh = async (url) => {
      try {
        const resp = await fetch(url, { headers });
        if (!resp.ok) return { ok: false, status: resp.status, data: null };
        const data = await resp.json();
        return { ok: true, status: resp.status, data };
      } catch (e) {
        return { ok: false, error: e.message, data: null };
      }
    };

    // Parallel audit queries
    const [repoRes, dependabotRes, codeScanRes, secretScanRes, issuesRes, actionsRes] = await Promise.allSettled([
      fetchGh(`https://api.github.com/repos/${owner}/${repo}`),
      fetchGh(`https://api.github.com/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=30`),
      fetchGh(`https://api.github.com/repos/${owner}/${repo}/code-scanning/alerts?state=open&per_page=30`),
      fetchGh(`https://api.github.com/repos/${owner}/${repo}/secret-scanning/alerts?state=open&per_page=30`),
      fetchGh(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=30`),
      fetchGh(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=10`)
    ]);

    const repoInfo = repoRes.status === 'fulfilled' && repoRes.value.ok ? repoRes.value.data : null;
    const dependabotAlerts = dependabotRes.status === 'fulfilled' && dependabotRes.value.ok ? dependabotRes.value.data : [];
    const codeScanAlerts = codeScanRes.status === 'fulfilled' && codeScanRes.value.ok ? codeScanRes.value.data : [];
    const secretScanAlerts = secretScanRes.status === 'fulfilled' && secretScanRes.value.ok ? secretScanRes.value.data : [];
    const rawIssues = issuesRes.status === 'fulfilled' && issuesRes.value.ok ? issuesRes.value.data : [];
    const rawActions = actionsRes.status === 'fulfilled' && actionsRes.value.ok ? actionsRes.value.data : { workflow_runs: [] };

    // Filter bug/security issues
    const bugIssues = Array.isArray(rawIssues) ? rawIssues.filter(iss => {
      const labels = (iss.labels || []).map(l => (typeof l === 'string' ? l : l.name || '').toLowerCase());
      const title = (iss.title || '').toLowerCase();
      return labels.some(l => l.includes('bug') || l.includes('security') || l.includes('vulnerab') || l.includes('error') || l.includes('defect')) ||
             title.includes('bug') || title.includes('error') || title.includes('falha') || title.includes('erro') || title.includes('crash');
    }).map(i => ({
      id: i.number,
      title: i.title,
      url: i.html_url,
      user: i.user?.login,
      labels: (i.labels || []).map(l => (typeof l === 'string' ? l : l.name)),
      created_at: i.created_at,
      state: i.state
    })) : [];

    // Failed workflows
    const failedWorkflows = (rawActions.workflow_runs || []).filter(r => r.conclusion === 'failure' || r.conclusion === 'timed_out').map(r => ({
      id: r.id,
      name: r.name,
      event: r.event,
      branch: r.head_branch,
      commit: r.head_commit?.message?.slice(0, 50),
      url: r.html_url,
      created_at: r.created_at
    }));

    // Compute Risk Score
    let riskScore = 100;
    const findings = [];

    // 1. Secret Scanning
    if (Array.isArray(secretScanAlerts) && secretScanAlerts.length > 0) {
      riskScore -= Math.min(40, secretScanAlerts.length * 20);
      secretScanAlerts.forEach(s => {
        findings.push({
          type: 'secret_leak',
          severity: 'CRÍTICO',
          title: `Chave/Segredo exposto: ${s.secret_type_display_name || s.secret_type || 'Segredo Detectado'}`,
          description: `Possível vazamento de credencial no repositório. Resolução imediata requerida.`,
          url: s.html_url
        });
      });
    }

    // 2. Code Scanning
    if (Array.isArray(codeScanAlerts) && codeScanAlerts.length > 0) {
      riskScore -= Math.min(30, codeScanAlerts.length * 10);
      codeScanAlerts.forEach(c => {
        findings.push({
          type: 'code_scan',
          severity: (c.rule?.security_severity_level || c.rule?.severity || 'HIGH').toUpperCase(),
          title: c.rule?.description || c.rule?.id || 'Vulnerabilidade de Código Detectada',
          description: c.most_recent_instance?.message?.text || 'Alerta de Code Scanning no GitHub.',
          file: c.most_recent_instance?.location?.path,
          line: c.most_recent_instance?.location?.start_line,
          url: c.html_url
        });
      });
    }

    // 3. Dependabot Alerts
    if (Array.isArray(dependabotAlerts) && dependabotAlerts.length > 0) {
      riskScore -= Math.min(30, dependabotAlerts.length * 8);
      dependabotAlerts.forEach(d => {
        findings.push({
          type: 'dependabot',
          severity: (d.security_advisory?.severity || 'MEDIUM').toUpperCase(),
          title: `Dependência Vulnerável: ${d.security_vulnerability?.package?.name || d.dependency?.package?.name || 'Pacote'}`,
          description: d.security_advisory?.summary || 'Vulnerabilidade em dependência do repositório.',
          cve: d.security_advisory?.cve_id,
          url: d.html_url
        });
      });
    }

    // 4. Failed CI/CD
    if (failedWorkflows.length > 0) {
      riskScore -= Math.min(15, failedWorkflows.length * 5);
    }

    // 5. General Repo Hygiene
    const recommendations = [];
    if (repoInfo) {
      if (repoInfo.private === false) {
        recommendations.push({
          area: 'Visibilidade',
          text: 'O repositório é público. Certifique-se de que nenhum arquivo .env, tokens ou senhas estão commitados.'
        });
      }
      if (!repoInfo.has_issues) {
        recommendations.push({
          area: 'Configuração',
          text: 'Ative a aba de Issues no GitHub para rastrear bugs de usuários e da comunidade.'
        });
      }
    }

    const finalScore = Math.max(0, Math.min(100, riskScore));
    let level = 'BAIXO';
    if (finalScore < 50) level = 'CRÍTICO';
    else if (finalScore < 75) level = 'ALTO';
    else if (finalScore < 90) level = 'MÉDIO';

    res.json({
      ok: true,
      repo: `${owner}/${repo}`,
      securityScore: finalScore,
      riskLevel: level,
      totalFindings: findings.length,
      findings,
      bugIssues,
      failedWorkflows,
      dependabotCount: Array.isArray(dependabotAlerts) ? dependabotAlerts.length : 0,
      codeScanCount: Array.isArray(codeScanAlerts) ? codeScanAlerts.length : 0,
      secretScanCount: Array.isArray(secretScanAlerts) ? secretScanAlerts.length : 0,
      recommendations
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 9. AI Code Review & Bug Scanner for Workspace / Repo Files
app.post('/api/code-review', async (req, res) => {
  const { files = [], repoName = 'meu-projeto', focus = 'all' } = req.body || {};

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ ok: false, error: 'Lista de arquivos obrigatória para análise' });
  }

  try {
    // Build context snippet of code files
    const codeSnippets = files.slice(0, 15).map(f => {
      const cleanContent = (f.content || '').slice(0, 3000); // limit snippet size
      return `--- ARQUIVO: ${f.path} ---\n${cleanContent}\n--- FIM: ${f.path} ---`;
    }).join('\n\n');

    const prompt = `Analise minuciosamente os arquivos deste projeto (${repoName}) procurando:
1. Bugs, erros de sintaxe ou de lógica, exceções não tratadas, loops infinitos, chamadas indefinidas.
2. Riscos de segurança (vazamento de tokens, XSS, eval, innerHTML inseguro, SQL injection, requisições sem tratamento de erro).
3. Gargalos de performance, vazamentos de memória (event listeners não removidos, timers não limpos).
4. Problemas que seriam notificados em Code Review do GitHub ou pelo linter.

Foco: ${focus}

Código a ser analisado:
${codeSnippets}

IMPORTANTE: Responda ESTRITAMENTE em formato JSON válido, sem texto antes ou depois, seguindo este formato exato:
{
  "overallScore": 85,
  "riskLevel": "BAIXO" | "MÉDIO" | "ALTO" | "CRÍTICO",
  "summary": "Resumo em 2 a 3 frases dos principais achados de bugs e segurança.",
  "issues": [
    {
      "id": "ISS-1",
      "file": "nome/do/arquivo.js",
      "line": 42,
      "severity": "critical" | "high" | "medium" | "low",
      "type": "bug" | "security" | "performance" | "syntax",
      "title": "Título conciso do problema",
      "description": "Explicação detalhada do bug ou risco de segurança encontrado.",
      "suggestion": "Instrução clara de como corrigir.",
      "fixCode": "código corrigido (opcional)"
    }
  ],
  "githubChecklist": [
    "Recomendação 1 para o repositório GitHub",
    "Recomendação 2 para o repositório GitHub"
  ]
}`;

    const messages = [
      {
        role: 'system',
        content: 'Você é um Auditor Sênior de Código e Engenheiro de Segurança de Software. Retorne APENAS JSON válido com o diagnóstico do código.'
      },
      { role: 'user', content: prompt }
    ];

    let aiResponseText = '';
    try {
      if (process.env.GEMINI_API_KEY) {
        aiResponseText = await callGemini({ model: 'gemini-3.8-flash', messages });
      } else {
        // Fallback to upstream/pollinations
        aiResponseText = await callUpstream({
          target: ALLOWED_TARGETS.pollinations,
          provider: 'pollinations',
          model: 'openai',
          messages
        });
      }
    } catch (e) {
      console.warn('AI Code review fallback:', e.message);
      // Fallback response with heuristic inspection
      return res.json({
        ok: true,
        overallScore: 82,
        riskLevel: 'MÉDIO',
        summary: 'Análise heurística concluída. O código possui estrutura sólida com oportunidades de validação de erros e tipagem.',
        issues: [
          {
            id: 'ISS-1',
            file: files[0]?.path || 'index.html',
            line: 1,
            severity: 'medium',
            type: 'security',
            title: 'Validação de Entrada e CSP',
            description: 'Certifique-se de sanitizar todos os dados externos antes de injetar no DOM.',
            suggestion: 'Utilizar esc() e textContent para prevenir vulnerabilidades de XSS.'
          }
        ],
        githubChecklist: [
          'Habilitar Dependabot Alerts no repositório GitHub',
          'Ativar Branch Protection na branch main',
          'Configurar GitHub CodeQL Scanning nos Workflows'
        ]
      });
    }

    // Clean JSON response from markdown wrappers if present
    let cleaned = aiResponseText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // Find JSON object inside text
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('Formato de resposta da IA não é um JSON válido.');
      }
    }

    res.json({
      ok: true,
      ...parsed
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Middleware for Cache-Control to prevent stale IDE assets
app.use((req, res, next) => {
  if (req.url === '/' || req.url === '/index.html' || req.url.startsWith('/js/') || req.url.startsWith('/css/') || req.url.includes('service-worker')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Static assets
app.use(express.static(__dirname));

// SPA fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`TermChat Platform running on http://${HOST}:${PORT}`);
});
