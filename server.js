import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'termchat-bridge', version: '1.0.0' });
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

// Chat proxy
app.post('/api/chat', async (req, res) => {
  const { provider, model, messages } = req.body || {};

  const target = ALLOWED_TARGETS[provider];
  if (!target) {
    return res.status(400).json({ detail: 'provedor não permitido' });
  }

  const body = { messages };
  if (model) {
    body.model = model;
  }

  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  const authHeader = req.headers.authorization;
  const headers = { 'Content-Type': 'application/json' };

  if (envKey) {
    headers['Authorization'] = `Bearer ${envKey}`;
  } else if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const upstreamResp = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!upstreamResp.ok) {
      return res.status(502).json({ detail: `upstream ${upstreamResp.status}` });
    }

    const data = await upstreamResp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      return res.status(502).json({ detail: 'resposta inválida do provedor' });
    }

    return res.json({ ok: true, text });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ detail: 'upstream timeout' });
    }
    return res.status(502).json({ detail: err.message || 'falha na comunicação com provedor' });
  }
});

// Static assets
app.use(express.static(__dirname));

// SPA fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`TermChat running on http://${HOST}:${PORT}`);
});
