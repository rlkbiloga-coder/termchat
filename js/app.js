"use strict";

/**
 * TermChat Master Application Engine
 * Web IDE, Code Editor, Sandbox Terminal, Git/GitHub, AI Agents, Preview, Plugins & Deploy.
 */

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);

// Local storage helper
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('tc_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => localStorage.setItem('tc_' + k, JSON.stringify(v)),
  del: k => localStorage.removeItem('tc_' + k)
};

// Global Configuration
const cfg = Object.assign({
  provider: 'auto',
  key: '',
  model: 'gemini-3.8-flash',
  providerKeys: {},
  customBaseUrl: '',
  autoSave: true,
  deviceMode: 'desktop',
  theme: 'obsidian'
}, store.get('cfg', {}));

if (!cfg.providerKeys) cfg.providerKeys = {};
window.cfg = cfg;

function getActiveApiKey(providerId) {
  const p = providerId || cfg.provider || 'auto';
  if (cfg.providerKeys && cfg.providerKeys[p]) {
    return cfg.providerKeys[p];
  }
  return cfg.key || '';
}
window.getActiveApiKey = getActiveApiKey;

// Permissions manager
const PERMS = {
  notifications: { label: 'Notificações', ask: async () => { try { return window.Notification ? await Notification.requestPermission() : 'denied'; } catch(e) { return 'denied'; } } },
  geolocation: { label: 'Localização', ask: () => new Promise(resolve => { if (!navigator.geolocation) return resolve('denied'); navigator.geolocation.getCurrentPosition(() => resolve('granted'), () => resolve('denied'), { timeout: 5000 }); }) },
  clipboard: { label: 'Área de transferência', ask: async () => { try { await navigator.clipboard.writeText('ok'); return 'granted'; } catch (e) { return 'denied'; } } }
};

function permState(p) {
  try {
    if (p === 'notifications') return (window.Notification ? Notification.permission : 'unsupported');
    if (p === 'geolocation') return (navigator.geolocation ? 'prompt' : 'unsupported');
    if (p === 'clipboard') return (navigator.clipboard ? 'prompt' : 'unsupported');
  } catch (e) {
    return 'unsupported';
  }
  return 'unsupported';
}

async function queryPerm(p) {
  try {
    const s = await navigator.permissions.query({ name: p === 'geolocation' ? 'geolocation' : 'clipboard-read' });
    return s.state;
  } catch (e) {
    return 'prompt';
  }
}

async function ensurePerm(p) {
  try {
    if (!PERMS[p]) return false;
    let st = permState(p);
    if (st === 'granted') return true;
    if (st !== 'prompt') return false;
    st = await PERMS[p].ask();
    if (typeof renderPerms === 'function') renderPerms();
    return st === 'granted';
  } catch (e) {
    return false;
  }
}

// Plugins
const PLUGINS = [
  {
    id: 'imggen', name: 'img', desc: 'Gera imagem com IA grátis via Pollinations (sem chave).', cat: 'ia', perms: [], run: async a => {
      const p = (a || '').trim();
      if (!p) return '❌ use: /img <descrição da imagem>';
      const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?width=768&height=768&nologo=true&model=flux';
      return '🖼️ Imagem gerada (carrega em ~15s):\n' + url;
    }
  },
  {
    id: 'weather', name: 'clima', desc: 'Previsão do tempo da sua cidade via open-meteo (sem chave).', cat: 'dados', perms: ['geolocation'], run: async a => {
      if (!await ensurePerm('geolocation')) return '❌ preciso da permissão de localização (config → permissões).';
      const pos = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { timeout: 8000 }));
      const { latitude: la, longitude: lo } = pos.coords;
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo + '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto');
      const d = await r.json();
      return '🌦 agora: ' + d.current.temperature_2m + '°C · máx ' + d.daily.temperature_2m_max[0] + '° / mín ' + d.daily.temperature_2m_min[0] + '° (open-meteo)';
    }
  },
  {
    id: 'crypto', name: 'cripto', desc: 'Preço de criptomoedas via CoinGecko (sem chave).', cat: 'dados', perms: [], run: async a => {
      const ids = (a || 'bitcoin,ethereum').split(',').map(s => s.trim()).slice(0, 5).join(',');
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(ids) + '&vs_currencies=brl,usd');
      const d = await r.json();
      return Object.entries(d).map(([k, v]) => k + ': R$' + v.brl + ' (~US$' + v.usd + ')').join('\n') || 'moeda não encontrada';
    }
  },
  {
    id: 'wiki', name: 'wiki', desc: 'Busca na Wikipédia (API livre, sem chave).', cat: 'busca', perms: [], run: async a => {
      if (!a) return 'uso: /wiki <termo>';
      const r = await fetch('https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(a) + '&format=json&origin=*&srlimit=3');
      const d = await r.json();
      return d.query.search.map(s => '• ' + s.title + '\n' + s.snippet.replace(/<[^>]+>/g, '')).join('\n---\n') || 'nada encontrado';
    }
  },
  {
    id: 'hn', name: 'tech-news', desc: 'Top notícias do Hacker News (sem chave).', cat: 'dados', perms: [], run: async a => {
      const r = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      const ids = (await r.json()).slice(0, 5);
      const out = [];
      for (const id of ids) {
        const s = await (await fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json')).json();
        out.push('• ' + s.title);
      }
      return out.join('\n');
    }
  },
  {
    id: 'calc', name: 'calc', desc: 'Calculadora local (parser próprio, sem eval).', cat: 'ferramenta', perms: [], run: async a => {
      const t = (a || '').replace(/,/g, '.').replace(/[^0-9+\-*/(). ]/g, '');
      if (!t) return 'uso: /calc 2*(3+4)';
      const v = calc(t);
      return v === null ? 'expressão inválida' : t.trim() + ' = ' + v;
    }
  },
  {
    id: 'timer', name: 'timer', desc: 'Timer com notificação (ex.: /timer 10 café pronto).', cat: 'ferramenta', perms: ['notifications'], run: async a => {
      const m = a && a.match(/^(\d+)\s*(.*)/);
      if (!m) return 'uso: /timer 5 <aviso opcional>';
      const min = +m[1];
      if (!await ensurePerm('notifications')) return '⏳ timer de ' + min + 'min rodando (sem notificação: permissão negada).';
      setTimeout(() => {
        new Notification('TermChat', { body: '⏰ ' + (m[2] || 'tempo esgotado: ' + min + 'min') });
        print('sys', '⏰ timer: ' + (m[2] || min + 'min esgotado'));
      }, min * 60000);
      return '⏱ timer de ' + min + ' min iniciado' + (m[2] ? ' — ' + m[2] : '');
    }
  },
  {
    id: 'notes', name: 'notas', desc: 'Notas locais: /nota add <texto>, /nota ls, /nota rm <n>.', cat: 'pessoal', perms: [], run: async a => {
      const list = store.get('notes', []);
      const cmd = (a || 'ls').split(' ')[0], rest = (a || '').slice(cmd.length).trim();
      if (cmd === 'add') { list.push(rest); store.set('notes', list); return 'nota #' + list.length + ' salva'; }
      if (cmd === 'rm') { const i = +rest - 1; if (list[i] === undefined) return 'nota inexistente'; list.splice(i, 1); store.set('notes', list); return 'removida'; }
      return list.map((n, i) => (i + 1) + '. ' + n).join('\n') || '(sem notas)';
    }
  },
  {
    id: 'translate', name: 'tradutor', desc: 'Tradução livre via MyMemory (sem chave).', cat: 'busca', perms: [], run: async a => {
      if (!a) return 'uso: /tradutor en|fr|es <texto>';
      const m = a.match(/^(\w\w)\s+([\s\S]+)/); if (!m) return 'formato: /tradutor en texto';
      const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(m[2]) + '&langpair=pt|' + m[1]);
      const d = await r.json();
      return d.responseData && d.responseData.translatedText || 'falhou';
    }
  },
  {
    id: 'qr', name: 'qr', desc: 'Gera QR Code de um texto/link (api.qrserver, livre).', cat: 'ferramenta', perms: [], run: async a => {
      if (!a) return 'uso: /qr <texto ou link>';
      return 'QR gerado:\n' + esc('https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(a));
    }
  },
  {
    id: 'sysinfo', name: 'sysinfo', desc: 'Infos do seu dispositivo/navegador (local).', cat: 'ferramenta', perms: [], run: async a => {
      return 'plataforma: ' + esc(navigator.platform) + ' · idioma: ' + navigator.language + ' · tela: ' + screen.width + 'x' + screen.height + ' · online: ' + (navigator.onLine ? 'sim' : 'não') + ' · ' + navigator.hardwareConcurrency + ' núcleos';
    }
  },
  {
    id: 'ip', name: 'meu-ip', desc: 'Seu IP público aproximado (ipwho.is, livre).', cat: 'dados', perms: [], run: async a => {
      const d = await (await fetch('https://ipwho.is/')).json();
      return d.ip + ' · ' + esc(d.city || '?') + ', ' + esc(d.country || '?') + ' · ISP: ' + esc(d.connection && d.connection.isp || '?');
    }
  }
];

const pluginById = id => PLUGINS.find(p => p.id === id);
const installed = () => store.get('plugins', ['weather', 'calc', 'notes', 'sysinfo']);

// Safe calculator
function calc(expr) {
  const toks = expr.match(/\d+\.?\d*|[+\-*/()]/g); if (!toks) return null;
  const out = [], ops = []; const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  let prev = null;
  for (const t of toks) {
    if (/[\d.]/.test(t[0])) { out.push(parseFloat(t)); }
    else if (t === '(') { ops.push(t); }
    else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()); if (!ops.length) return null; ops.pop(); }
    else { if ((t === '-' || t === '+') && (prev === null || prev === '(' || prec[prev])) out.push(0); while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop()); ops.push(t); }
    prev = t;
  }
  while (ops.length) { const o = ops.pop(); if (o === '(') return null; out.push(o); }
  const st = [];
  for (const t of out) {
    if (typeof t === 'number') st.push(t);
    else {
      const b = st.pop(), a2 = st.pop(); if (a2 === undefined || b === undefined) return null;
      if (t === '+') st.push(a2 + b); if (t === '-') st.push(a2 - b); if (t === '*') st.push(a2 * b); if (t === '/') st.push(b === 0 ? NaN : a2 / b);
    }
  }
  const v = st[0]; return (st.length === 1 && isFinite(v)) ? Math.round(v * 1e10) / 1e10 : null;
}

// Helper: Exponential Backoff for client-side API requests on 429/502/503/504 errors
async function fetchWithExponentialBackoff(url, options, maxRetries = 3, initialDelayMs = 1000) {
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    attempt++;
    try {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt <= maxRetries) {
        const retryAfter = res.headers.get('retry-after');
        let waitMs = delay;
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed)) waitMs = parsed * 1000;
        }
        const jitter = (Math.random() * 0.4 - 0.2) * waitMs;
        const totalWait = Math.max(300, Math.round(waitMs + jitter));

        if (window.TermLogs) {
          window.TermLogs.add('IA', `⚠️ Servidor sobrecarregado (${res.status}). Retentando ${attempt}/${maxRetries} em ${(totalWait/1000).toFixed(1)}s...`, 'warn');
        }
        await new Promise(resolve => setTimeout(resolve, totalWait));
        delay *= 2;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt <= maxRetries) {
        const jitter = (Math.random() * 0.4 - 0.2) * delay;
        const totalWait = Math.max(300, Math.round(delay + jitter));
        if (window.TermLogs) {
          window.TermLogs.add('IA', `⚠️ Erro de conexão (${err.message}). Retentando ${attempt}/${maxRetries} em ${(totalWait/1000).toFixed(1)}s...`, 'warn');
        }
        await new Promise(resolve => setTimeout(resolve, totalWait));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}
window.fetchWithExponentialBackoff = fetchWithExponentialBackoff;

// Unified askAI calling backend proxy with automated exponential backoff
async function askAI(text) {
  const SYS = 'Você é o TermChat, uma plataforma avançada de desenvolvimento assistido por IA e IDE terminal. Responda em português com clareza, objetividade e foco técnico.';
  const msgs = [{ role: 'system', content: SYS }, ...history.slice(-8), { role: 'user', content: text }];

  const startTime = Date.now();
  const currentKey = getActiveApiKey(cfg.provider);
  if (window.TermLogs) {
    window.TermLogs.add('IA', `Iniciando consulta via provedor [${cfg.provider}] (Key: ${currentKey ? 'Ativa ✓' : 'Servidor/Free'})...`, 'info');
  }

  try {
    const res = await fetchWithExponentialBackoff('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: cfg.provider || 'auto',
        model: cfg.model || '',
        messages: msgs,
        apiKey: currentKey,
        customBaseUrl: cfg.customBaseUrl || ''
      })
    }, 3, 1000);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const duration = Date.now() - startTime;
    if (window.TermLogs) {
      window.TermLogs.add('IA', `Resposta concluída via [${data.provider}] em ${duration}ms`, 'success');
    }

    return { text: data.text, provider: data.provider };
  } catch (err) {
    if (window.TermLogs) {
      window.TermLogs.add('IA', `Falha no provedor: ${err.message}`, 'error');
    }
    throw err;
  }
}

// Chat UI
const view = $('chatView');
const history = store.get('hist', []);

function print(who, text) {
  if (!view) return;
  const d = document.createElement('div');
  d.className = 'msg ' + who;
  const whoLabel = who === 'user' ? 'você' : who === 'sys' ? 'sistema' : who === 'ai' ? 'term' : who;
  d.innerHTML = '<span class="who">' + esc(whoLabel) + ':</span>' + esc(text);
  view.appendChild(d);
  view.scrollTop = view.scrollHeight;

  // Speak AI responses if TTS is enabled
  if (who === 'ai' && window.TermVoice && window.TermVoice.ttsEnabled) {
    window.TermVoice.speak(text);
  }
}

function typingOn() {
  if (!view) return;
  const d = document.createElement('div');
  d.className = 'msg ai typing';
  d.id = 'tp';
  d.innerHTML = '<span class="who">term:</span> pensando...';
  view.appendChild(d);
  view.scrollTop = view.scrollHeight;
  if ($('send')) $('send').disabled = true;
}

function typingOff() {
  const t = $('tp');
  if (t) t.remove();
  if ($('send')) $('send').disabled = false;
}

async function handle(raw) {
  const text = raw.trim();
  if (!text) return;

  print('user', text);
  const userMsg = { role: 'user', content: text, timestamp: Date.now() };
  history.push(userMsg);
  store.set('hist', history.slice(-40));
  if (window.TermFirebase) {
    window.TermFirebase.saveChatMessage(userMsg);
  }

  if (text.startsWith('/')) {
    const sp = text.indexOf(' ');
    const cmd = text.slice(1, sp < 0 ? undefined : sp).toLowerCase();
    const arg = sp < 0 ? '' : text.slice(sp + 1);

    if (cmd === 'help') {
      print('sys', `Comandos do TermChat:
/ide               Alternar para Web IDE
/preview           Live Preview da aplicação
/builder <prompt>  Gerar aplicativo completo por prompt
/agent <role> <p>  Chamar agente especializado (coder, debugger, architect, etc.)
/git <status|log>  Comandos Git no projeto
/snapshot          Criar snapshot de segurança
/rollback <id>     Reverter workspace para snapshot
/deploy            Fazer deploy da aplicação
/plugins           Listar plugins instalados
/install <id>      Instalar plugin
/uninstall <id>    Remover plugin
/weather /calc /crypto /wiki /tradutor /notes /timer /qr /hn /meu-ip /sysinfo /clear /perm`);
    } else if (cmd === 'ide') {
      switchDockTab('terminal');
    } else if (cmd === 'preview') {
      switchDockTab('preview');
    } else if (cmd === 'builder') {
      if (!arg) return print('err', 'Uso: /builder <descrição da aplicação>');
      typingOn();
      try {
        const out = await window.TermAgents.buildApp(arg, st => print('sys', st));
        print('ai', out);
        updatePreview();
        renderFileTree();
      } catch (e) {
        print('err', e.message);
      }
      typingOff();
    } else if (cmd === 'agent') {
      const parts = arg.split(' ');
      const role = parts[0] || 'coder';
      const promptText = parts.slice(1).join(' ');
      if (!promptText) return print('err', 'Uso: /agent <coder|debugger|tester|security> <tarefa>');
      typingOn();
      try {
        const out = await window.TermAgents.runAgent(role, promptText, st => print('sys', st));
        print('ai', out);
      } catch (e) {
        print('err', e.message);
      }
      typingOff();
    } else if (cmd === 'git') {
      if (window.TermSandboxInst) {
        window.TermSandboxInst.handleGit(arg.split(' '));
      }
    } else if (cmd === 'snapshot') {
      const snap = window.TermVFS.createSnapshot(arg || 'Snapshot via Chat');
      print('sys', `✓ Snapshot criado: ${snap.id} (${snap.label})`);
    } else if (cmd === 'rollback') {
      if (!arg) return print('err', 'Uso: /rollback <id-do-snapshot>');
      try {
        const snap = window.TermVFS.rollbackToSnapshot(arg.trim());
        print('sys', `✓ Workspace revertido para snapshot: ${snap.id}`);
        renderFileTree();
        updatePreview();
      } catch (e) {
        print('err', e.message);
      }
    } else if (cmd === 'plugins') {
      print('sys', 'instalados: ' + (installed().join(', ') || 'nenhum'));
    } else if (cmd === 'install' || cmd === 'uninstall') {
      const p = pluginById(arg.trim());
      if (!p) return print('err', 'plugin desconhecido: ' + arg);
      const list = installed();
      if (cmd === 'install') {
        if (!list.includes(p.id)) {
          for (const pm of p.perms) { await ensurePerm(pm); }
          list.push(p.id);
          store.set('plugins', list);
        }
        print('sys', '✓ instalado: ' + p.name);
      } else {
        store.set('plugins', list.filter(x => x !== p.id));
        print('sys', '✕ removido: ' + p.name);
      }
      renderExplore();
      updateProjectContextStats();
    } else if (cmd === 'clear' || cmd === 'cls') {
      if (view) view.innerHTML = '';
      history.length = 0;
      store.del('hist');
      print('sys', 'chat limpo.');
    } else if (cmd === 'perm') {
      renderPerms();
      selectActivity('config');
      print('sys', 'veja config → permissões');
    } else {
      const p = pluginById(cmd);
      if (p && installed().includes(p.id)) {
        typingOn();
        try {
          const out = await p.run(arg);
          print('ai', String(out));
        } catch (e) {
          print('err', 'falha: ' + e.message);
        }
        typingOff();
      } else if (p) {
        print('err', 'plugin não instalado. use /install ' + p.id);
      } else {
        print('err', 'comando desconhecido. digite /help');
      }
    }
    return;
  }

  typingOn();
  try {
    const res = await askAI(text);
    print('ai', res.text);
    const aiMsg = { role: 'assistant', content: res.text, provider: res.provider, timestamp: Date.now() };
    history.push(aiMsg);
    store.set('hist', history.slice(-40));
    if (window.TermFirebase) {
      window.TermFirebase.saveChatMessage(aiMsg);
    }
  } catch (e) {
    print('err', 'Falha na resposta: ' + e.message);
  }
  typingOff();
}

function handleFormSubmit(e) {
  if (e) e.preventDefault();
  const inp = $('txt');
  if (!inp) return;
  const v = inp.value;
  inp.value = '';
  handle(v);
}

function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleFormSubmit();
  }
}

function sendAgentPrompt(text) {
  const inp = $('txt');
  if (inp) {
    inp.value = text;
    handleFormSubmit();
  }
}

function promptMentionFile() {
  const files = window.TermVFS ? window.TermVFS.listFiles() : [];
  if (files.length === 0) return;
  const choice = prompt('Escolha um arquivo para mencionar no prompt:\n' + files.join('\n'));
  if (choice && choice.trim()) {
    const inp = $('txt');
    if (inp) {
      inp.value += ` @${choice.trim()} `;
      inp.focus();
    }
  }
}

// ═════════════════════════════════════════════════════════════════
// ACTIVITY BAR & SIDEBAR SUBVIEWS
// ═════════════════════════════════════════════════════════════════
let currentActivity = 'explorer';

function selectActivity(act) {
  currentActivity = act;

  // Toggle activity bar active button
  const actMap = {
    explorer: 'actBtnExplorer',
    search: 'actBtnSearch',
    git: 'actBtnGit',
    plugins: 'actBtnPlugins',
    agents: 'actBtnAgents',
    mcp: 'actBtnMcp',
    integrations: 'actBtnIntegrations',
    deploy: 'actBtnDeploy',
    database: 'actBtnDb',
    config: 'actBtnConfig'
  };

  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('active'));
  const btn = $(actMap[act]);
  if (btn) btn.classList.add('active');

  // Ensure sidebar is open
  toggleSidebar(true);

  // Update title
  const titles = {
    explorer: 'EXPLORADOR',
    search: 'BUSCA GLOBAL',
    git: 'GIT & CONTROLE',
    plugins: 'PLUGINS',
    agents: 'AGENTES IA',
    mcp: 'MCP TOOLS',
    integrations: '40 INTEGRAÇÕES',
    deploy: 'DEPLOY',
    database: 'BANCO VIRTUAL',
    config: 'CONFIGURAÇÕES'
  };
  if ($('sidebarSectionTitle')) $('sidebarSectionTitle').textContent = titles[act] || 'EXPLORADOR';

  // Toggle subviews
  const subviews = ['Explorer', 'Search', 'Git', 'Plugins', 'Agents', 'Mcp', 'Integrations', 'Deploy', 'Database', 'Config'];
  subviews.forEach(s => {
    const el = $(`sidebar${s}View`);
    if (el) {
      el.classList.toggle('hidden', s.toLowerCase() !== act.toLowerCase());
    }
  });

  // Action on tab activation
  if (act === 'explorer') {
    renderFileTree();
  } else if (act === 'search') {
    const qInp = $('globalSearchQuery');
    if (qInp) { qInp.focus(); qInp.select(); }
  } else if (act === 'git') {
    renderSidebarGit();
  } else if (act === 'plugins') {
    renderSidebarPlugins();
  } else if (act === 'agents') {
    renderSidebarAgents();
  } else if (act === 'integrations') {
    if (window.TermIntegrations) window.TermIntegrations.renderHub();
  } else if (act === 'database') {
    renderDbKeyValues();
  }
}

function toggleSidebar(forceOpen = null) {
  const bar = $('ideSidebar');
  if (!bar) return;
  if (forceOpen === true) {
    bar.classList.remove('collapsed');
  } else if (forceOpen === false) {
    bar.classList.add('collapsed');
  } else {
    bar.classList.toggle('collapsed');
  }
}

function toggleAgentPanel(forceOpen = null) {
  const panel = $('ideAgentPanel');
  if (!panel) return;
  if (forceOpen === true) {
    panel.classList.remove('collapsed');
  } else if (forceOpen === false) {
    panel.classList.add('collapsed');
  } else {
    panel.classList.toggle('collapsed');
  }
}

function toggleBottomDock(forceOpen = null) {
  const dock = $('ideBottomDock');
  if (!dock) return;
  if (forceOpen === true) {
    dock.classList.remove('dock-hidden');
    dock.classList.remove('hidden');
  } else if (forceOpen === false) {
    dock.classList.add('dock-hidden');
  } else {
    dock.classList.toggle('dock-hidden');
  }
}

function toggleDockMax() {
  const dock = $('ideBottomDock');
  if (!dock) return;
  dock.classList.toggle('maximized');
}

let isMultiPaneDock = true;
function toggleMultiPaneDock() {
  isMultiPaneDock = !isMultiPaneDock;
  const multi = $('dockMultiPane');
  const single = $('dockSinglePane');
  const btn = $('btnDockPaneMode');

  if (isMultiPaneDock) {
    if (multi) multi.classList.remove('hidden');
    if (single) single.classList.add('hidden');
    if (btn) btn.textContent = '⊞ Multi-painel';
  } else {
    if (multi) multi.classList.add('hidden');
    if (single) single.classList.remove('hidden');
    if (btn) btn.textContent = '◻ Painel Único';
    switchDockTab('terminal');
  }
}

// ═════════════════════════════════════════════════════════════════
// FILE EXPLORER UI
// ═════════════════════════════════════════════════════════════════
function renderFileTree() {
  const treeContainer = $('fileTree');
  if (!treeContainer || !window.TermVFS) return;

  const files = window.TermVFS.listFiles();
  if (files.length === 0) {
    treeContainer.innerHTML = '<div class="empty-hint" style="padding:10px;color:var(--text-dim)">Nenhum arquivo no workspace</div>';
    return;
  }

  treeContainer.innerHTML = files.map(path => {
    const active = window.TermEditorInst && window.TermEditorInst.activeFile === path ? 'active' : '';
    const ext = path.split('.').pop();
    const icon = window.TermEditorInst ? window.TermEditorInst.getFileIcon(ext) : '📄';

    return `
      <div class="tree-node ${active}" onclick="TermEditorInst.openFile('${path}')">
        <span class="node-icon">${icon}</span>
        <span class="node-name">${esc(path)}</span>
        <span class="node-del" title="Excluir arquivo" onclick="event.stopPropagation(); deleteFilePrompt('${path}')">×</span>
      </div>
    `;
  }).join('');

  updateProjectContextStats();
  updateBreadcrumbs();
}

window.renderFileTree = renderFileTree;

function createNewFilePrompt() {
  const name = prompt('Nome do novo arquivo (ex: src/Button.jsx, style.css):');
  if (name && name.trim()) {
    window.TermVFS.writeFile(name.trim(), '', 'user');
    renderFileTree();
    if (window.TermEditorInst) window.TermEditorInst.openFile(name.trim());
  }
}

function createNewFolderPrompt() {
  const folder = prompt('Nome da nova pasta (ex: src/components):');
  if (folder && folder.trim()) {
    window.TermVFS.writeFile(folder.trim() + '/.gitkeep', '', 'user');
    renderFileTree();
  }
}

function deleteFilePrompt(path) {
  if (confirm(`Deseja realmente excluir o arquivo "${path}"?`)) {
    window.TermVFS.deleteFile(path);
    renderFileTree();
  }
}

function toggleProjectRoot() {
  const list = $('fileTree');
  const chev = $('rootChevron');
  if (!list) return;
  const isHidden = list.classList.toggle('hidden');
  if (chev) chev.textContent = isHidden ? '▶' : '▼';
}

function toggleAccordion(bodyId) {
  const body = $(bodyId);
  if (!body) return;
  body.classList.toggle('hidden');
}

function updateBreadcrumbs() {
  const curr = window.TermEditorInst ? window.TermEditorInst.activeFile : 'index.html';
  if (!curr) return;
  const parts = curr.split('/');
  const filename = parts.pop();
  const foldername = parts.join('/') || 'root';

  if ($('bcFolder')) $('bcFolder').textContent = foldername;
  if ($('bcFile')) $('bcFile').textContent = filename;
}

// ═════════════════════════════════════════════════════════════════
// GLOBAL SEARCH & REPLACE (SIDEBAR)
// ═════════════════════════════════════════════════════════════════
function onGlobalSearchInput(query) {
  const resultsBox = $('globalSearchResults');
  if (!resultsBox || !window.TermVFS) return;

  const q = (query || '').trim().toLowerCase();
  if (!q) {
    resultsBox.innerHTML = '<div style="color:var(--text-dim);padding:8px">Digite um termo para pesquisar nos arquivos.</div>';
    return;
  }

  const files = window.TermVFS.listFiles();
  let matches = [];

  for (const path of files) {
    const file = window.TermVFS.getFile(path);
    if (!file || typeof file.content !== 'string') continue;
    const lines = file.content.split('\n');
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(q)) {
        matches.push({ path, lineNum: idx + 1, text: line.trim() });
      }
    });
  }

  if (matches.length === 0) {
    resultsBox.innerHTML = `<div style="color:var(--text-dim);padding:8px">Nenhuma ocorrência encontrada para "${esc(q)}".</div>`;
    return;
  }

  resultsBox.innerHTML = `
    <div style="color:var(--text-dim);margin-bottom:6px">${matches.length} ocorrência(s) encontrada(s):</div>
    ${matches.map(m => `
      <div class="problem-row-item" onclick="jumpToSearchResult('${m.path}', ${m.lineNum})" style="margin-bottom:4px">
        <span class="problem-file">${esc(m.path)}:${m.lineNum}</span>
        <span class="problem-desc" style="font-size:11px">${esc(m.text.slice(0, 70))}</span>
      </div>
    `).join('')}
  `;
}

function jumpToSearchResult(path, lineNum) {
  if (window.TermEditorInst) {
    window.TermEditorInst.openFile(path);
    const textarea = $('codeTextarea');
    if (textarea) {
      const lines = textarea.value.split('\n');
      let pos = 0;
      for (let i = 0; i < lineNum - 1 && i < lines.length; i++) {
        pos += lines[i].length + 1;
      }
      textarea.setSelectionRange(pos, pos + (lines[lineNum - 1] ? lines[lineNum - 1].length : 0));
      textarea.focus();
    }
  }
}

function runGlobalReplace() {
  const q = ($('globalSearchQuery') ? $('globalSearchQuery').value : '').trim();
  const repl = ($('globalReplaceQuery') ? $('globalReplaceQuery').value : '');
  if (!q) return alert('Digite o termo a localizar.');

  if (!confirm(`Substituir todas as ocorrências de "${q}" por "${repl}" no projeto?`)) return;

  const files = window.TermVFS.listFiles();
  let count = 0;
  for (const path of files) {
    const file = window.TermVFS.getFile(path);
    if (!file || typeof file.content !== 'string') continue;
    if (file.content.includes(q)) {
      const updated = file.content.split(q).join(repl);
      window.TermVFS.writeFile(path, updated, 'replace');
      count++;
    }
  }

  alert(`✓ Substituição concluída em ${count} arquivo(s)!`);
  if (window.TermEditorInst && window.TermEditorInst.activeFile) {
    window.TermEditorInst.openFile(window.TermEditorInst.activeFile);
  }
  onGlobalSearchInput(q);
}

// ═════════════════════════════════════════════════════════════════
// SIDEBAR GIT & PLUGINS & DB & DEPLOY
// ═════════════════════════════════════════════════════════════════
function renderSidebarGit() {
  const branchLabel = $('sidebarGitBranch');
  const filesList = $('sidebarGitFiles');
  if (!window.TermGit) return;

  const state = window.TermGit.getRepoState();
  if (branchLabel) branchLabel.textContent = state.branch;

  const changed = window.TermVFS ? window.TermVFS.listFiles().slice(0, 5) : [];
  if (filesList) {
    filesList.innerHTML = changed.map(f => `
      <div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--text-muted)">
        <span>${esc(f)}</span> <span style="color:var(--accent-amber)">M</span>
      </div>
    `).join('');
  }
}

function doSidebarCommit() {
  const inp = $('sidebarCommitMsg');
  const msg = inp ? inp.value.trim() : '';
  if (!msg) return alert('Digite uma mensagem de commit.');
  if (window.TermGit) window.TermGit.createCommit(msg);
  if (inp) inp.value = '';
  renderGitPanel();
  alert('Commit local registrado!');
}

function renderSidebarPlugins(query = '') {
  const container = $('sidebarPluginsList');
  if (!container) return;
  const q = (query || '').toLowerCase();
  const inst = installed();

  const list = PLUGINS.filter(p => !q || (p.name + p.desc).toLowerCase().includes(q));
  container.innerHTML = list.map(p => {
    const on = inst.includes(p.id);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px">
        <div>
          <b>${esc(p.name)}</b>
          <div style="font-size:10px;color:var(--text-dim)">${esc(p.cat)}</div>
        </div>
        <button class="btn btn-sm" onclick="togglePlugin('${p.id}'); renderSidebarPlugins('${query}')">
          ${on ? '✕' : '+'}
        </button>
      </div>
    `;
  }).join('');
}

function renderSidebarAgents() {
  const container = $('sidebarAgentsList');
  if (!container || !window.TermAgents) return;

  const roles = window.TermAgents.getRoles();
  container.innerHTML = roles.map(r => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px;background:var(--bg-card);border:1px solid var(--border);border-radius:5px">
      <div style="display:flex;align-items:center;gap:6px">
        <span>${r.icon}</span>
        <div>
          <b style="font-size:11.5px">${esc(r.name)}</b>
          <div style="font-size:10px;color:var(--text-dim)">${esc(r.id)}</div>
        </div>
      </div>
      <button class="btn btn-sm" onclick="runSpecializedAgent('${r.id}')">Executar</button>
    </div>
  `).join('');
}

function renderDbKeyValues() {
  const container = $('dbKeyValuesList');
  if (!container) return;
  const kv = store.get('virtual_db', {
    app_version: '2.0.0',
    theme: 'dark-obsidian',
    api_endpoint: '/api/chat',
    max_tokens: '4096'
  });

  container.innerHTML = Object.entries(kv).map(([k, v]) => `
    <div class="memory-card-item">
      <span class="memory-key-tag">${esc(k)}</span>
      <span class="memory-val-text">${esc(String(v))}</span>
      <button class="btn btn-sm" onclick="deleteDbKey('${esc(k)}')">×</button>
    </div>
  `).join('') || '<div style="color:var(--text-dim)">Nenhuma chave armazenada.</div>';
}

function addDbKeyValue() {
  const kInp = $('dbKeyInput');
  const vInp = $('dbValInput');
  if (!kInp || !vInp) return;
  const k = kInp.value.trim();
  const v = vInp.value.trim();
  if (!k) return alert('Insira uma chave.');

  const kv = store.get('virtual_db', {});
  kv[k] = v;
  store.set('virtual_db', kv);
  kInp.value = '';
  vInp.value = '';
  renderDbKeyValues();
}

function deleteDbKey(k) {
  const kv = store.get('virtual_db', {});
  delete kv[k];
  store.set('virtual_db', kv);
  renderDbKeyValues();
}

function triggerDeployTarget(target) {
  const fb = $('deployStatusFeedback');
  if (fb) fb.innerHTML = `<span class="term-dim">Preparando deploy para ${target}...</span>`;

  if (target === 'preview') {
    switchDockTab('preview');
    if (fb) fb.innerHTML = '<span class="term-ok">✓ Live Preview atualizado com sucesso.</span>';
  } else if (target === 'zip') {
    if (window.TermGit) window.TermGit.exportZip();
    if (fb) fb.innerHTML = '<span class="term-ok">✓ Pacote JSON/ZIP exportado.</span>';
  } else if (target === 'vercel') {
    const vercelConfig = {
      version: 2,
      builds: [{ src: "package.json", use: "@vercel/static-build" }],
      routes: [{ src: "/(.*)", dest: "/index.html" }]
    };
    if (window.TermVFS) window.TermVFS.writeFile('vercel.json', JSON.stringify(vercelConfig, null, 2), 'deploy');
    renderFileTree();
    if (fb) fb.innerHTML = '<span class="term-ok">✓ vercel.json gerado no projeto! Pronto para deploy.</span>';
  } else if (target === 'github') {
    doGitHubPush();
  }
}

// ═════════════════════════════════════════════════════════════════
// BOTTOM DOCK: TABS & VIEWS (TERMINAL, PROBLEMAS, GIT, PREVIEW, CONSOLE, PLUGINS)
// ═════════════════════════════════════════════════════════════════
function switchDockTab(tab) {
  // Update header tabs
  const tabIds = {
    terminal: 'dockTabTerminal',
    problems: 'dockTabProblems',
    audit: 'dockTabAudit',
    git: 'dockTabGit',
    preview: 'dockTabPreview',
    console: 'dockTabConsole',
    plugins: 'dockTabPlugins'
  };

  document.querySelectorAll('.dock-tab').forEach(t => t.classList.remove('active'));
  const btn = $(tabIds[tab]);
  if (btn) btn.classList.add('active');

  // Ensure dock is visible
  toggleBottomDock(true);

  const multi = $('dockMultiPane');
  const single = $('dockSinglePane');
  const singleContent = $('dockSinglePaneContent');

  if (isMultiPaneDock && ['terminal', 'git', 'preview'].includes(tab)) {
    if (multi) multi.classList.remove('hidden');
    if (single) single.classList.add('hidden');
    return;
  }

  // Switch to single pane mode for dedicated views
  if (multi) multi.classList.add('hidden');
  if (single) single.classList.remove('hidden');

  if (tab === 'problems') {
    renderProblems();
  } else if (tab === 'audit') {
    renderAuditPanel();
  } else if (tab === 'console') {
    renderConsoleLogs();
  } else if (tab === 'plugins') {
    renderDockPlugins();
  } else if (tab === 'terminal') {
    if (singleContent) {
      singleContent.innerHTML = `
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Visualização focada do Terminal Sandbox:</div>
        <div class="dock-terminal-box" style="height:200px">
          <div class="dock-terminal-output" id="terminalOutputFocused">
            <div class="term-line term-ok">Terminal Sandbox TermChat — pronto para execução.</div>
          </div>
          <div class="dock-terminal-input-row">
            <span>~/meu-projeto $</span>
            <input class="dock-terminal-input" placeholder="comando..." onkeydown="if(event.key==='Enter'){ TermSandboxInst.execute(this.value); this.value=''; }">
          </div>
        </div>
      `;
    }
  } else if (tab === 'git') {
    if (singleContent) {
      renderGitPanel();
      singleContent.innerHTML = $('githubLoggedInView') ? $('githubLoggedInView').outerHTML : '<div>Git Panel</div>';
    }
  } else if (tab === 'preview') {
    updatePreview();
    if (singleContent) {
      singleContent.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column">
          <div class="preview-address-bar">
            <span>🌐</span>
            <input class="preview-url-input" readonly value="http://localhost:5173/">
            <button class="btn btn-sm" onclick="updatePreview()">↻</button>
          </div>
          <div class="preview-iframe-wrap" style="height:260px">
            <iframe id="previewIframeSingle" sandbox="allow-scripts allow-forms allow-modals" style="width:100%;height:100%;border:none" srcdoc="${esc($('previewIframe') ? $('previewIframe').srcdoc : '')}"></iframe>
          </div>
        </div>
      `;
    }
  }
}

function renderProblems() {
  const container = $('dockSinglePaneContent');
  if (!container || !window.TermVFS) return;

  const files = window.TermVFS.listFiles();
  const problems = [];

  for (const path of files) {
    const file = window.TermVFS.getFile(path);
    if (!file || typeof file.content !== 'string') continue;
    const content = file.content;
    const ext = path.split('.').pop();

    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
      // Braces check
      const openCurly = (content.match(/{/g) || []).length;
      const closeCurly = (content.match(/}/g) || []).length;
      if (openCurly !== closeCurly) {
        problems.push({ file: path, line: 1, type: 'error', msg: `Chaves desbalanceadas: { (${openCurly}) vs } (${closeCurly})` });
      }

      const openParen = (content.match(/\(/g) || []).length;
      const closeParen = (content.match(/\)/g) || []).length;
      if (openParen !== closeParen) {
        problems.push({ file: path, line: 1, type: 'error', msg: `Parênteses desbalanceados: ( (${openParen}) vs ) (${closeParen})` });
      }

      // Console.log check
      const lines = content.split('\n');
      lines.forEach((l, idx) => {
        if (l.includes('console.log(')) {
          problems.push({ file: path, line: idx + 1, type: 'warning', msg: 'Declaração console.log presente no código' });
        }
        if (l.includes('debugger')) {
          problems.push({ file: path, line: idx + 1, type: 'warning', msg: 'Declaração debugger encontrada' });
        }
      });
    } else if (ext === 'json') {
      try {
        JSON.parse(content);
      } catch (err) {
        problems.push({ file: path, line: 1, type: 'error', msg: `JSON inválido: ${err.message}` });
      }
    }
  }

  // Update badge
  const badge = $('problemsBadgeCount');
  if (badge) badge.textContent = problems.length;

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <b style="font-size:12px">Diagnóstico de Código (${problems.length} problemas)</b>
      <button class="btn btn-sm" onclick="renderProblems()">↻ Reanalisar</button>
    </div>
    <div class="problems-panel">
      ${problems.length === 0 ? '<div style="color:var(--accent-teal);padding:6px">✓ Nenhum problema detectado nos arquivos do projeto.</div>' : ''}
      ${problems.map(p => `
        <div class="problem-row-item" onclick="jumpToSearchResult('${p.file}', ${p.line})">
          <span class="${p.type === 'error' ? 'problem-dot-err' : 'problem-dot-warn'}">●</span>
          <span class="problem-file">${esc(p.file)}:${p.line}</span>
          <span class="problem-desc">${esc(p.msg)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════════
// AUDITORIA DE REPOSITÓRIO & VERIFICAÇÃO DE BUGS & RISCOS (GITHUB & CODE REVIEW)
// ═════════════════════════════════════════════════════════════════
let auditActiveSubtab = 'repo'; // 'repo' or 'code'

function renderAuditPanel() {
  const container = $('dockSinglePaneContent');
  if (!container) return;

  const repoAudit = window.TermGit?.lastRepoAudit || store.get('tc_last_repo_audit', null);
  const codeReview = window.TermGit?.lastCodeReview || store.get('tc_last_code_review', null);

  const currentRepo = localStorage.getItem('tc_gh_selected_repo') || 'nicolaswjwkwk/termchat';
  const score = auditActiveSubtab === 'repo'
    ? (repoAudit?.securityScore ?? 92)
    : (codeReview?.overallScore ?? 88);

  const riskLevel = auditActiveSubtab === 'repo'
    ? (repoAudit?.riskLevel || 'BAIXO')
    : (codeReview?.riskLevel || 'BAIXO');

  const scoreClass = score < 60 ? 'crit' : score < 80 ? 'warn' : '';
  const riskClass = `risk-tag-${riskLevel.toLowerCase()}`;

  // Update audit badge
  const badge = $('auditBadgeCount');
  if (badge) {
    const totalIssues = (repoAudit?.totalFindings || 0) + (codeReview?.issues?.length || 0);
    badge.textContent = totalIssues > 0 ? String(totalIssues) : '✓';
    badge.style.background = totalIssues > 0 ? 'var(--accent-pink)' : 'var(--accent-teal)';
  }

  container.innerHTML = `
    <div class="audit-container">
      <!-- Top Banner -->
      <div class="audit-header-banner">
        <div class="audit-score-box">
          <div class="audit-score-circle ${scoreClass}">${score}</div>
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <b style="font-size:14px;color:#fff">Auditoria de Segurança & Bugs</b>
              <span class="risk-tag ${riskClass}">Risco ${riskLevel}</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
              Repositório: <b style="color:var(--accent-cyan)">${esc(currentRepo)}</b> | Branch: <b>${esc(window.TermGit?.getRepoState().branch || 'main')}</b>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="startRepoAudit('${esc(currentRepo)}')">
            🔍 Escanear GitHub
          </button>
          <button class="btn btn-sm" onclick="startWorkspaceCodeReview('all')">
            ⚡ AI Code Review
          </button>
          <button class="btn btn-sm" onclick="forceReloadIDE()" title="Limpar cache e recarregar IDE">
            🔄 Limpar Cache
          </button>
        </div>
      </div>

      <!-- Subtabs Bar -->
      <div class="audit-subtabs">
        <button class="audit-subtab-btn ${auditActiveSubtab === 'repo' ? 'active' : ''}" onclick="auditActiveSubtab='repo'; renderAuditPanel()">
          🛡️ Repositório GitHub (Dependabot & Riscos)
        </button>
        <button class="audit-subtab-btn ${auditActiveSubtab === 'code' ? 'active' : ''}" onclick="auditActiveSubtab='code'; renderAuditPanel()">
          🐞 Verificação de Erros no Código (Workspace)
        </button>
      </div>

      <!-- Subtab Content -->
      <div id="auditSubtabBody">
        ${auditActiveSubtab === 'repo' ? renderRepoAuditContent(repoAudit, currentRepo) : renderCodeReviewContent(codeReview)}
      </div>
    </div>
  `;
}

function renderRepoAuditContent(audit, currentRepo) {
  if (!audit) {
    return `
      <div style="padding:16px;text-align:center;background:var(--bg-card);border:1px solid var(--border);border-radius:6px">
        <div style="font-size:24px;margin-bottom:8px">🛡️</div>
        <b style="font-size:13px;color:#fff">Nenhuma auditoria executada para ${esc(currentRepo)}</b>
        <div style="font-size:11.5px;color:var(--text-muted);margin:6px 0 12px">
          Escaneie vulnerabilidades de Dependabot, Code Scanning, vazamento de tokens e bugs notificados no repositório.
        </div>
        <button class="btn btn-primary" onclick="startRepoAudit('${esc(currentRepo)}')">
          🔍 Escanear Repositório Agora
        </button>
      </div>
    `;
  }

  const {
    findings = [],
    bugIssues = [],
    failedWorkflows = [],
    dependabotCount = 0,
    codeScanCount = 0,
    secretScanCount = 0,
    recommendations = []
  } = audit;

  return `
    <div style="display:flex;flex-direction:column;gap:10px">
      <!-- 4 Stats Cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px">
        <div class="stat-card" style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:8px">
          <div style="font-size:10.5px;color:var(--text-dim)">DEPENDABOT</div>
          <b style="font-size:16px;color:${dependabotCount > 0 ? 'var(--accent-amber)' : 'var(--accent-teal)'}">${dependabotCount}</b>
          <div style="font-size:10px;color:var(--text-muted)">Alertas de Pacotes</div>
        </div>
        <div class="stat-card" style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:8px">
          <div style="font-size:10.5px;color:var(--text-dim)">CODE SCANNING</div>
          <b style="font-size:16px;color:${codeScanCount > 0 ? 'var(--accent-pink)' : 'var(--accent-teal)'}">${codeScanCount}</b>
          <div style="font-size:10px;color:var(--text-muted)">Alertas CodeQL</div>
        </div>
        <div class="stat-card" style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:8px">
          <div style="font-size:10.5px;color:var(--text-dim)">SEGREDO / TOKEN</div>
          <b style="font-size:16px;color:${secretScanCount > 0 ? 'var(--accent-pink)' : 'var(--accent-teal)'}">${secretScanCount}</b>
          <div style="font-size:10px;color:var(--text-muted)">Vazamentos</div>
        </div>
        <div class="stat-card" style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:8px">
          <div style="font-size:10.5px;color:var(--text-dim)">BUGS NOTIFICADOS</div>
          <b style="font-size:16px;color:${bugIssues.length > 0 ? 'var(--accent-amber)' : 'var(--accent-teal)'}">${bugIssues.length}</b>
          <div style="font-size:10px;color:var(--text-muted)">Issues abertas</div>
        </div>
      </div>

      <!-- Findings List -->
      <div style="font-size:12px;font-weight:700;color:#fff;margin-top:4px">
        Alertas & Riscos no Repositório (${findings.length + bugIssues.length + failedWorkflows.length})
      </div>

      ${findings.length === 0 && bugIssues.length === 0 && failedWorkflows.length === 0 ? `
        <div style="background:rgba(55,230,160,0.06);border:1px solid rgba(55,230,160,0.2);padding:10px;border-radius:6px;color:var(--accent-teal);font-size:12px">
          ✓ Nenhum risco crítico ou alerta notificado no GitHub para este repositório!
        </div>
      ` : ''}

      ${findings.map(f => `
        <div class="audit-finding-card ${f.severity.toLowerCase()}">
          <div class="audit-finding-title-row">
            <span class="audit-finding-title">
              <span class="risk-tag risk-tag-${f.severity.toLowerCase()}">${esc(f.severity)}</span>
              <span>${esc(f.title)}</span>
            </span>
            ${f.url ? `<a href="${esc(f.url)}" target="_blank" class="btn btn-sm" style="text-decoration:none">Ver no GitHub ↗</a>` : ''}
          </div>
          <div class="audit-finding-desc">${esc(f.description)}</div>
          ${f.file ? `<div style="font-size:10.5px;color:var(--accent-cyan);font-family:var(--font-mono)">Arquivo: ${esc(f.file)}:${f.line || 1}</div>` : ''}
        </div>
      `).join('')}

      <!-- Bug Issues from GitHub -->
      ${bugIssues.map(iss => `
        <div class="audit-finding-card medio">
          <div class="audit-finding-title-row">
            <span class="audit-finding-title">
              <span class="risk-tag risk-tag-medio">BUG REPORT</span>
              <span>#${iss.id}: ${esc(iss.title)}</span>
            </span>
            <a href="${esc(iss.url)}" target="_blank" class="btn btn-sm" style="text-decoration:none">Abrir Issue ↗</a>
          </div>
          <div class="audit-finding-desc">Notificado por @${esc(iss.user || 'comunidade')}. Labels: ${esc((iss.labels || []).join(', '))}</div>
        </div>
      `).join('')}

      <!-- Failed Workflows -->
      ${failedWorkflows.map(w => `
        <div class="audit-finding-card critico">
          <div class="audit-finding-title-row">
            <span class="audit-finding-title">
              <span class="risk-tag risk-tag-critico">CI/CD FALHOU</span>
              <span>Workflow: ${esc(w.name)} (${esc(w.branch)})</span>
            </span>
            <a href="${esc(w.url)}" target="_blank" class="btn btn-sm" style="text-decoration:none">Ver Log ↗</a>
          </div>
          <div class="audit-finding-desc">Último commit: "${esc(w.commit || '')}". Execução com falha detectada.</div>
        </div>
      `).join('')}

      <!-- GitHub Recommendations -->
      ${recommendations.length > 0 ? `
        <div style="margin-top:6px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:10px">
          <b style="font-size:11.5px;color:var(--accent-cyan)">💡 Recomendações de Segurança do GitHub:</b>
          <ul style="margin:6px 0 0 16px;padding:0;font-size:11px;color:var(--text-muted)">
            ${recommendations.map(r => `<li><b>${esc(r.area)}:</b> ${esc(r.text)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

function renderCodeReviewContent(review) {
  if (!review) {
    return `
      <div style="padding:16px;text-align:center;background:var(--bg-card);border:1px solid var(--border);border-radius:6px">
        <div style="font-size:24px;margin-bottom:8px">⚡</div>
        <b style="font-size:13px;color:#fff">Nenhum Code Review executado no Workspace</b>
        <div style="font-size:11.5px;color:var(--text-muted);margin:6px 0 12px">
          A IA analisa o código procurando bugs lógicos, riscos de injeção, memory leaks e problemas de sintaxe.
        </div>
        <div style="display:flex;justify-content:center;gap:6px">
          <button class="btn btn-primary" onclick="startWorkspaceCodeReview('all')">
            ⚡ Executar Code Review Geral
          </button>
          <button class="btn" onclick="startWorkspaceCodeReview('bugs')">
            🐞 Apenas Bugs & Lógica
          </button>
        </div>
      </div>
    `;
  }

  const {
    overallScore = 85,
    summary = '',
    issues = [],
    githubChecklist = []
  } = review;

  return `
    <div style="display:flex;flex-direction:column;gap:10px">
      <!-- Summary Box -->
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b style="font-size:12px;color:#fff">Resumo da Revisão Técnica:</b>
          <span style="font-size:11px;color:var(--accent-cyan)">Score: ${overallScore}/100</span>
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);line-height:1.4">${esc(summary)}</div>
      </div>

      <!-- Issues List -->
      <div style="font-size:12px;font-weight:700;color:#fff">
        Problemas & Erros Detectados no Código (${issues.length})
      </div>

      ${issues.length === 0 ? `
        <div style="background:rgba(55,230,160,0.06);border:1px solid rgba(55,230,160,0.2);padding:10px;border-radius:6px;color:var(--accent-teal);font-size:12px">
          ✓ Nenhum bug grave ou risco detectado no código dos arquivos analisados!
        </div>
      ` : ''}

      ${issues.map(iss => {
        const sevClass = iss.severity === 'critical' ? 'critico' : iss.severity === 'high' ? 'alto' : iss.severity === 'medium' ? 'medio' : 'baixo';
        return `
          <div class="audit-finding-card ${sevClass}">
            <div class="audit-finding-title-row">
              <span class="audit-finding-title">
                <span class="risk-tag risk-tag-${sevClass}">${esc(iss.severity || 'WARN')}</span>
                <span>${esc(iss.title)}</span>
              </span>
              <button class="btn btn-sm" onclick="jumpToSearchResult('${esc(iss.file)}', ${iss.line || 1})" title="Abrir arquivo no editor">
                📄 ${esc(iss.file)}:${iss.line || 1}
              </button>
            </div>
            <div class="audit-finding-desc">${esc(iss.description)}</div>
            <div class="audit-finding-fix-box">
              <div>
                <b>Sugestão de Correção:</b> ${esc(iss.suggestion)}
              </div>
              ${iss.fixCode ? `
                <button class="btn btn-primary btn-sm" onclick="applySuggestedFix('${iss.id}')" style="margin-left:8px;white-space:nowrap">
                  ✓ Aplicar Correção
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}

      <!-- Checklist -->
      ${githubChecklist.length > 0 ? `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:10px">
          <b style="font-size:11.5px;color:var(--accent-cyan)">📋 Checklist de Proteção para o Repositório:</b>
          <ul style="margin:6px 0 0 16px;padding:0;font-size:11px;color:var(--text-muted)">
            ${githubChecklist.map(c => `<li>${esc(c)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

async function startRepoAudit(repoName) {
  if (!window.TermGit) return;
  const target = repoName || localStorage.getItem('tc_gh_selected_repo') || prompt('Digite o repositório GitHub para auditar (ex: dono/repo):', 'nicolaswjwkwk/termchat');
  if (!target || !target.trim()) return;

  switchDockTab('audit');
  auditActiveSubtab = 'repo';

  const container = $('dockSinglePaneContent');
  if (container) {
    container.innerHTML = `
      <div style="padding:24px;text-align:center">
        <div class="loading-spin" style="margin:0 auto 12px">⚡</div>
        <b style="font-size:13px;color:#fff">Escaneando ${esc(target.trim())}...</b>
        <div style="font-size:11.5px;color:var(--text-dim);margin-top:6px">Consultando Dependabot, CodeQL, Secret Scanning, Issues e Workflows no GitHub...</div>
      </div>
    `;
  }

  try {
    await window.TermGit.auditGitHubRepo(target.trim());
    renderAuditPanel();
  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div style="padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px">
          <b style="color:var(--accent-pink)">Erro ao auditar repositório:</b>
          <div style="font-size:12px;color:var(--text-muted);margin:8px 0">${esc(err.message)}</div>
          <button class="btn btn-sm" onclick="renderAuditPanel()">Voltar</button>
        </div>
      `;
    }
  }
}

async function startWorkspaceCodeReview(focus = 'all') {
  if (!window.TermGit) return;
  switchDockTab('audit');
  auditActiveSubtab = 'code';

  const container = $('dockSinglePaneContent');
  if (container) {
    container.innerHTML = `
      <div style="padding:24px;text-align:center">
        <div class="loading-spin" style="margin:0 auto 12px">🤖</div>
        <b style="font-size:13px;color:#fff">Executando AI Code Review no Projeto...</b>
        <div id="codeReviewStatusMsg" style="font-size:11.5px;color:var(--text-dim);margin-top:6px">Analisando arquivos do workspace com Gemini...</div>
      </div>
    `;
  }

  try {
    await window.TermGit.runWorkspaceCodeReview(focus, status => {
      const el = $('codeReviewStatusMsg');
      if (el) el.textContent = status;
    });
    renderAuditPanel();
  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div style="padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px">
          <b style="color:var(--accent-pink)">Erro no Code Review:</b>
          <div style="font-size:12px;color:var(--text-muted);margin:8px 0">${esc(err.message)}</div>
          <button class="btn btn-sm" onclick="renderAuditPanel()">Voltar</button>
        </div>
      `;
    }
  }
}

function applySuggestedFix(issueId) {
  if (!window.TermGit) return;
  try {
    const ok = window.TermGit.applyCodeFix(issueId);
    if (ok) {
      alert('✓ Correção aplicada com sucesso no arquivo!');
      renderAuditPanel();
    } else {
      alert('Não há código de correção automática para este problema. Siga a instrução na descrição.');
    }
  } catch (e) {
    alert(`Falha ao aplicar correção: ${e.message}`);
  }
}

async function forceReloadIDE() {
  if (confirm('Deseja recarregar o TermChat e limpar todos os caches para garantir a versão mais recente?')) {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      }
    } catch (e) {
      console.warn('Cache clear error:', e);
    }
    window.location.reload(true);
  }
}

window.renderAuditPanel = renderAuditPanel;
window.startRepoAudit = startRepoAudit;
window.startWorkspaceCodeReview = startWorkspaceCodeReview;
window.applySuggestedFix = applySuggestedFix;
window.forceReloadIDE = forceReloadIDE;

function renderConsoleLogs() {
  const container = $('dockSinglePaneContent');
  if (!container) return;

  const logs = window.TermLogs ? window.TermLogs.getRecent() : [];

  container.innerHTML = `
    <div class="console-panel">
      <div class="console-tools-bar">
        <div style="display:flex;gap:6px">
          <b style="font-size:12px">Console do Sistema & Logs</b>
          <span style="font-size:11px;color:var(--text-dim)">(${logs.length} eventos)</span>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm" onclick="if(window.TermLogs){ window.TermLogs.clear(); renderConsoleLogs(); }">Limpar</button>
          <button class="btn btn-sm" onclick="renderConsoleLogs()">↻</button>
        </div>
      </div>
      <div class="console-logs-list">
        ${logs.length === 0 ? '<div style="color:var(--text-dim);padding:8px">Nenhum evento registrado ainda.</div>' : ''}
        ${logs.map(l => `
          <div class="console-line console-${l.level || 'info'}">
            <span style="color:var(--text-dim)">[${new Date(l.timestamp).toLocaleTimeString()}]</span>
            <span style="color:var(--accent-cyan);font-weight:600">[${esc(l.category)}]</span>
            <span>${esc(l.message)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderDockPlugins() {
  const container = $('dockSinglePaneContent');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <b style="font-size:12px">Catálogo de Plugins & Extensões</b>
      <input class="ide-input-small" style="max-width:240px" placeholder="Buscar..." oninput="filterDockPlugins(this.value)">
    </div>
    <div class="grid" id="dockPluginsGrid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:8px">
      ${PLUGINS.map(p => {
        const on = installed().includes(p.id);
        return `
          <div class="card" style="padding:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px">
            <b>${esc(p.name)}</b>
            <div style="font-size:11px;color:var(--text-muted);margin:4px 0">${esc(p.desc)}</div>
            <button class="btn btn-sm" onclick="togglePlugin('${p.id}'); renderDockPlugins()">${on ? 'Desinstalar' : 'Instalar'}</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════════
// RIGHT AGENT PANEL: SUBTABS (CHAT, ROLES, TASKS, MEMORY)
// ═════════════════════════════════════════════════════════════════
function switchAgentSubtab(subtab) {
  const tabs = {
    chat: 'tabAgentChat',
    roles: 'tabAgentRoles',
    tasks: 'tabAgentTasks',
    memory: 'tabAgentMemory'
  };

  document.querySelectorAll('.agent-tab-btn').forEach(b => b.classList.remove('active'));
  const btn = $(tabs[subtab]);
  if (btn) btn.classList.add('active');

  const subviews = ['Chat', 'Roles', 'Tasks', 'Memory'];
  subviews.forEach(s => {
    const el = $(`subviewAgent${s}`);
    if (el) {
      el.classList.toggle('hidden', s.toLowerCase() !== subtab.toLowerCase());
    }
  });

  if (subtab === 'roles') {
    renderAgentRoles();
  } else if (subtab === 'tasks') {
    renderAgentTasks();
  } else if (subtab === 'memory') {
    renderAgentMemory();
  }
}

function renderAgentRoles() {
  const container = $('agentRolesList');
  if (!container || !window.TermAgents) return;

  const roles = window.TermAgents.getRoles();
  container.innerHTML = roles.map(r => `
    <div class="task-card-item">
      <div class="task-card-header">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:18px">${r.icon}</span>
          <b style="color:#fff">${esc(r.name)}</b>
        </div>
        <span class="task-status-tag status-running">Pronto</span>
      </div>
      <div style="font-size:11.5px;color:var(--text-muted)">${esc(r.role)}</div>
      <div style="font-size:10.5px;color:var(--text-dim);background:var(--bg-darker);padding:6px;border-radius:4px;border:1px solid var(--border)">
        ${esc(r.system.slice(0, 110))}...
      </div>
      <button class="btn btn-primary btn-sm" onclick="runSpecializedAgent('${r.id}')">Ativar Agente no Projeto</button>
    </div>
  `).join('');
}

function runSpecializedAgent(roleId) {
  const task = prompt(`Digite a tarefa para o Agente [${roleId.toUpperCase()}]:`);
  if (!task || !task.trim()) return;

  switchAgentSubtab('chat');
  sendAgentPrompt(`[Agente ${roleId.toUpperCase()}]: ${task.trim()}`);
}

// Tasks
function getAgentTasks() {
  return store.get('agent_tasks', [
    { id: 't1', title: 'Refatorar componentes e modularizar código', status: 'completed', progress: 100 },
    { id: 't2', title: 'Auditoria de segurança CSP e validação de tokens', status: 'completed', progress: 100 },
    { id: 't3', title: 'Criar suite de testes automatizados para o VFS', status: 'running', progress: 60 },
    { id: 't4', title: 'Otimizar tempo de build e carregamento offline', status: 'pending', progress: 0 },
    { id: 't5', title: 'Sincronizar repositório GitHub com branch main', status: 'pending', progress: 0 }
  ]);
}

function renderAgentTasks() {
  const container = $('agentTasksList');
  if (!container) return;

  const tasks = getAgentTasks();
  container.innerHTML = tasks.map(t => {
    const stClass = t.status === 'completed' ? 'status-completed' : t.status === 'running' ? 'status-running' : 'status-pending';
    const stLabel = t.status === 'completed' ? 'Concluído' : t.status === 'running' ? 'Em execução' : 'Pendente';
    return `
      <div class="task-card-item">
        <div class="task-card-header">
          <span class="task-title">${esc(t.title)}</span>
          <span class="task-status-tag ${stClass}">${stLabel}</span>
        </div>
        <div class="task-progress-track">
          <div class="task-progress-fill" style="width:${t.progress}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
          <span style="font-size:10px;color:var(--text-dim)">${t.progress}% concluído</span>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm" onclick="runAgentTask('${t.id}')">Executar com IA</button>
            <button class="btn btn-sm" onclick="deleteAgentTask('${t.id}')">×</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function addNewAgentTaskPrompt() {
  const title = prompt('Descreva a nova tarefa de desenvolvimento:');
  if (!title || !title.trim()) return;

  const tasks = getAgentTasks();
  tasks.push({
    id: 't_' + Date.now(),
    title: title.trim(),
    status: 'pending',
    progress: 0
  });
  store.set('agent_tasks', tasks);
  renderAgentTasks();
}

function runAgentTask(taskId) {
  const tasks = getAgentTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task.status = 'running';
  task.progress = 50;
  store.set('agent_tasks', tasks);
  renderAgentTasks();

  switchAgentSubtab('chat');
  sendAgentPrompt(`Execute a seguinte tarefa técnica: "${task.title}". Analise os arquivos relevantes e aplique as melhorias.`);
}

function deleteAgentTask(taskId) {
  const tasks = getAgentTasks().filter(t => t.id !== taskId);
  store.set('agent_tasks', tasks);
  renderAgentTasks();
}

// Memory
function getAgentMemory() {
  return store.get('agent_memory', {
    stack: 'Node.js (v22), Express, HTML5/CSS3 Moderno, ES6+ Modular',
    design_system: 'Dark Obsidian / Cyberpunk IDE, Anti-AI slop, Zero pill static badges',
    branch: 'main',
    repo: 'nicolaswjwkwk/termchat',
    regras: 'Preservar comandos clássicos, sem mockups, código 100% funcional'
  });
}

function renderAgentMemory() {
  const container = $('agentMemoryList');
  if (!container) return;

  const mem = getAgentMemory();
  container.innerHTML = Object.entries(mem).map(([k, v]) => `
    <div class="memory-card-item">
      <span class="memory-key-tag">${esc(k)}</span>
      <span class="memory-val-text">${esc(String(v))}</span>
      <button class="btn btn-sm" onclick="deleteAgentMemory('${esc(k)}')">×</button>
    </div>
  `).join('') || '<div style="color:var(--text-dim)">Nenhuma memória configurada.</div>';
}

function addAgentMemoryPrompt() {
  const k = prompt('Nome da chave de contexto (ex: meta_projeto, arquitetura):');
  if (!k || !k.trim()) return;
  const v = prompt(`Valor para "${k.trim()}":`);
  if (!v || !v.trim()) return;

  const mem = getAgentMemory();
  mem[k.trim()] = v.trim();
  store.set('agent_memory', mem);
  renderAgentMemory();
}

function deleteAgentMemory(k) {
  const mem = getAgentMemory();
  delete mem[k];
  store.set('agent_memory', mem);
  renderAgentMemory();
}

function updateProjectContextStats() {
  const files = window.TermVFS ? window.TermVFS.listFiles() : [];
  if ($('statFilesCount')) $('statFilesCount').textContent = files.length;
  if ($('statPluginsCount')) $('statPluginsCount').textContent = installed().length;
  if ($('statAgentsCount')) $('statAgentsCount').textContent = '7';

  const branch = window.TermGit ? window.TermGit.getRepoState().branch : 'main';
  if ($('statBranchName')) $('statBranchName').textContent = branch;
  if ($('gitCurrentBranch')) $('gitCurrentBranch').textContent = branch + '*';
  if ($('topPluginsCount')) $('topPluginsCount').textContent = `Plugins ${installed().length} ativos`;
}

// ═════════════════════════════════════════════════════════════════
// TOP MENUBAR CONTROLLER & SHORTCUT ACTIONS
// ═════════════════════════════════════════════════════════════════
function toggleMenu(menuId) {
  const allMenus = document.querySelectorAll('.menu-dropdown');
  const target = $(menuId);

  allMenus.forEach(m => {
    if (m !== target) m.classList.add('hidden');
  });

  if (target) {
    target.classList.toggle('hidden');
  }
}

// Close menus when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.top-menubar')) {
    document.querySelectorAll('.menu-dropdown').forEach(m => m.classList.add('hidden'));
  }
});

function formatCurrentCode() {
  const textarea = $('codeTextarea');
  if (!textarea || !window.TermEditorInst) return;

  const code = textarea.value;
  // Basic indentation & clean lines
  const lines = code.split('\n');
  const formatted = lines.map(l => l.replace(/\s+$/, '')).join('\n');
  textarea.value = formatted;
  window.TermEditorInst.onCodeInput();
  window.TermEditorInst.saveCurrent();
  alert('Código formatado com sucesso!');
}

function duplicateCurrentLine() {
  const textarea = $('codeTextarea');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const val = textarea.value;
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = val.indexOf('\n', start);
  if (lineEnd === -1) lineEnd = val.length;

  const line = val.substring(lineStart, lineEnd);
  textarea.value = val.substring(0, lineEnd) + '\n' + line + val.substring(lineEnd);
  textarea.selectionStart = textarea.selectionEnd = start + line.length + 1;
  if (window.TermEditorInst) window.TermEditorInst.onCodeInput();
}

function openShortcutsModal() {
  const modal = $('shortcutsModal');
  if (modal) modal.classList.remove('hidden');
}

function closeShortcutsModal() {
  const modal = $('shortcutsModal');
  if (modal) modal.classList.add('hidden');
}

// ═════════════════════════════════════════════════════════════════
// COMMAND PALETTE (CTRL + P)
// ═════════════════════════════════════════════════════════════════
const PALETTE_COMMANDS = [
  { name: 'Terminal: Executar npm test', action: () => { TermSandboxInst.execute('npm test'); switchDockTab('terminal'); } },
  { name: 'Terminal: Compilar / Build (npm run build)', action: () => { TermSandboxInst.execute('npm run build'); switchDockTab('terminal'); } },
  { name: 'Terminal: Limpar Saída', action: () => { TermSandboxInst.execute('clear'); switchDockTab('terminal'); } },
  { name: 'Git: Realizar Commit', action: () => { doGitCommit(); } },
  { name: 'Git: Pull Remoto (GitHub)', action: () => { doGitHubPull(); } },
  { name: 'Git: Push Remoto (GitHub)', action: () => { doGitHubPush(); } },
  { name: 'Editor: Salvar Arquivo Atual', action: () => { if (window.TermEditorInst) window.TermEditorInst.saveCurrent(); } },
  { name: 'Editor: Formatar Código', action: () => { formatCurrentCode(); } },
  { name: 'Preview: Abrir Live Preview', action: () => { switchDockTab('preview'); } },
  { name: 'IA: Analisar Projeto com Coder Agent', action: () => { runSpecializedAgent('coder'); } },
  { name: 'IA: Procurar Bugs com Debugger Agent', action: () => { runSpecializedAgent('debugger'); } },
  { name: 'Tema: Alternar Tema Visual', action: () => { toggleTheme(); } }
];

function openCommandPalette() {
  const modal = $('commandPaletteModal');
  const input = $('paletteInput');
  if (modal) modal.classList.remove('hidden');
  if (input) {
    input.value = '';
    input.focus();
    filterPalette('');
  }
}

function closeCommandPalette() {
  const modal = $('commandPaletteModal');
  if (modal) modal.classList.add('hidden');
}

function filterPalette(query) {
  const list = $('paletteList');
  if (!list) return;

  const q = (query || '').toLowerCase();
  const files = window.TermVFS ? window.TermVFS.listFiles() : [];

  const matchedFiles = files.filter(f => f.toLowerCase().includes(q)).map(f => ({
    name: `Arquivo: ${f}`,
    type: 'file',
    path: f
  }));

  const matchedCommands = PALETTE_COMMANDS.filter(c => c.name.toLowerCase().includes(q)).map(c => ({
    name: c.name,
    type: 'cmd',
    action: c.action
  }));

  const items = [...matchedFiles, ...matchedCommands];
  window._paletteItems = items;

  if (items.length === 0) {
    list.innerHTML = '<div style="padding:10px;color:var(--text-dim)">Nenhum resultado encontrado.</div>';
    return;
  }

  list.innerHTML = items.map((it, idx) => `
    <div class="palette-item" onclick="executePaletteItem(${idx})" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)">
      <span style="color:${it.type === 'file' ? 'var(--accent-cyan)' : 'var(--accent-purple)'}">${it.type === 'file' ? '📄' : '⚡'}</span>
      <span style="margin-left:8px;font-size:12px;color:var(--text-main)">${esc(it.name)}</span>
    </div>
  `).join('');
}

function executePaletteItem(idx) {
  const items = window._paletteItems || [];
  const it = items[idx];
  closeCommandPalette();
  if (!it) return;

  if (it.type === 'file' && window.TermEditorInst) {
    window.TermEditorInst.openFile(it.path);
  } else if (it.type === 'cmd' && it.action) {
    it.action();
  }
}

window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    openCommandPalette();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    toggleSidebar();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    toggleAgentPanel();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '`') {
    e.preventDefault();
    toggleBottomDock();
  }
  if (e.key === 'Escape') {
    closeCommandPalette();
    closeShortcutsModal();
    const drawer = $('modelsDrawer');
    if (drawer) drawer.classList.remove('open');
  }
});

// ═════════════════════════════════════════════════════════════════
// MODELS DRAWER & THEME & MOBILE
// ═════════════════════════════════════════════════════════════════
function toggleModelsDrawer() {
  const drawer = $('modelsDrawer');
  if (drawer) drawer.classList.toggle('open');
}

function onProviderSelectChanged(val) {
  cfg.provider = val;
  store.set('cfg', cfg);
  updateModelBadge();
}

function setQuickProvider(val) {
  cfg.provider = val;
  if ($('cfgProvider')) $('cfgProvider').value = val;
  store.set('cfg', cfg);
  updateModelBadge();
  alert(`Provedor alterado para: [${val.toUpperCase()}]`);
}

function updateModelBadge() {
  const label = $('topModelName');
  const inputLabel = $('agentInputModelLabel');
  const names = {
    auto: 'Auto • Cascata Fallback',
    gemini: 'Google Gemini • gemini-3.8-flash',
    zen: 'OpenCode • Gemini 2.5 Pro',
    pollinations: 'Pollinations • 100% Free',
    groq: 'Groq • Llama 3.3 70B',
    openrouter: 'OpenRouter • Multi-model',
    ollama: 'Ollama • Localhost',
    cerebras: 'Cerebras • Free Tier Veloz',
    sambanova: 'SambaNova • Llama 405B',
    together: 'Together • Modelos :free',
    huggingface: 'HuggingFace • Router Grátis',
    nvidia: 'NVIDIA NIM • Nemotron',
    deepseek: 'DeepSeek • R1/V3',
    mistral: 'Mistral • Codestral',
    qwen: 'Qwen • Coder 32B',
    custom: 'Custom • Ollama/LM Studio'
  };
  const str = names[cfg.provider] || cfg.provider;
  if (label) label.textContent = str;
  if (inputLabel) inputLabel.textContent = str;
}

function toggleTheme() {
  const themes = ['obsidian', 'cyber', 'midnight'];
  const curIdx = themes.indexOf(cfg.theme || 'obsidian');
  cfg.theme = themes[(curIdx + 1) % themes.length];
  store.set('cfg', cfg);

  if (cfg.theme === 'cyber') {
    document.documentElement.style.setProperty('--bg-main', '#050c18');
    document.documentElement.style.setProperty('--bg-panel', '#091528');
    document.documentElement.style.setProperty('--accent-cyan', '#00f0ff');
  } else if (cfg.theme === 'midnight') {
    document.documentElement.style.setProperty('--bg-main', '#020408');
    document.documentElement.style.setProperty('--bg-panel', '#070a10');
    document.documentElement.style.setProperty('--accent-cyan', '#38bdf8');
  } else {
    document.documentElement.style.setProperty('--bg-main', '#090d16');
    document.documentElement.style.setProperty('--bg-panel', '#0d131f');
    document.documentElement.style.setProperty('--accent-cyan', '#38bdf8');
  }
}

function toggleLayoutMode() {
  const appCont = $('app-container');
  const isCurrentlyMobile = appCont && appCont.classList.contains('mode-mobile-compressed');
  applyDeviceMode(isCurrentlyMobile ? 'desktop' : 'mobile');
}

function openDevicePromptModal() {
  const modal = $('deviceDetectionModal');
  if (modal) modal.classList.remove('hidden');
}

function closeDevicePromptModal() {
  const modal = $('deviceDetectionModal');
  if (modal) modal.classList.add('hidden');
}

function applyDeviceMode(mode) {
  const appCont = $('app-container');
  const remember = $('chkRememberDevice') ? $('chkRememberDevice').checked : true;

  cfg.deviceMode = mode;
  store.set('cfg', cfg);
  if (remember) {
    localStorage.setItem('tc_device_mode', mode);
    localStorage.setItem('tc_device_prompt_seen', 'true');
  }

  if (mode === 'mobile') {
    if (appCont) appCont.classList.add('mode-mobile-compressed');
    mobileFocusPanel('editor');
    if (window.TermLogs) {
      window.TermLogs.add('Layout', 'Interface comprimida para modo Mobile.', 'info');
    }
  } else {
    if (appCont) appCont.classList.remove('mode-mobile-compressed');
    // Ensure all desktop panels are visible
    toggleSidebar(true);
    toggleAgentPanel(true);
    toggleBottomDock(true);
    if (window.TermLogs) {
      window.TermLogs.add('Layout', 'Interface expandida para modo Desktop.', 'info');
    }
  }

  // Persist preference to Firestore
  if (window.TermFirebase) {
    window.TermFirebase.saveProjectSettings(cfg);
  }

  closeDevicePromptModal();
}

function initDeviceDetection() {
  const savedMode = localStorage.getItem('tc_device_mode');
  const promptSeen = localStorage.getItem('tc_device_prompt_seen');
  const isMobileDetected = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 900;

  const detectedBadge = $('detectedBadge');
  const btnMobile = $('btnChooseMobile');
  const btnDesktop = $('btnChooseDesktop');

  if (detectedBadge) {
    detectedBadge.textContent = isMobileDetected ? 'Detectado: Mobile 📱' : 'Detectado: PC / Desktop 💻';
  }

  if (isMobileDetected) {
    if (btnMobile) btnMobile.classList.add('highlighted');
  } else {
    if (btnDesktop) btnDesktop.classList.add('highlighted');
  }

  if (savedMode) {
    applyDeviceMode(savedMode);
  } else if (isMobileDetected) {
    applyDeviceMode('mobile');
    if (!promptSeen) openDevicePromptModal();
  } else {
    applyDeviceMode('desktop');
    if (!promptSeen && window.innerWidth < 1100) openDevicePromptModal();
  }
}

function mobileFocusPanel(panel) {
  document.querySelectorAll('.mobile-tab-btn').forEach(b => b.classList.remove('active'));
  const btnMap = {
    sidebar: 'mTabSidebar',
    editor: 'mTabEditor',
    dock: 'mTabDock',
    preview: 'mTabPreview',
    agent: 'mTabAgent',
    audit: 'mTabAudit'
  };
  const btn = $(btnMap[panel]);
  if (btn) btn.classList.add('active');

  const appCont = $('app-container');
  const isMobileCompressed = appCont && appCont.classList.contains('mode-mobile-compressed');

  if (isMobileCompressed) {
    const sidebar = $('ideSidebar');
    const editor = document.querySelector('.ide-center-workspace');
    const agent = $('ideAgentPanel');
    const dock = $('ideBottomDock');

    // Remove active view from all
    if (sidebar) sidebar.classList.remove('mobile-active-view');
    if (editor) editor.classList.remove('mobile-active-view');
    if (agent) agent.classList.remove('mobile-active-view');
    if (dock) dock.classList.remove('mobile-active-view');

    if (panel === 'sidebar') {
      if (sidebar) sidebar.classList.add('mobile-active-view');
    } else if (panel === 'editor') {
      if (editor) editor.classList.add('mobile-active-view');
    } else if (panel === 'dock') {
      if (dock) {
        dock.classList.add('mobile-active-view');
        switchDockTab('terminal');
      }
    } else if (panel === 'preview') {
      if (dock) {
        dock.classList.add('mobile-active-view');
        switchDockTab('preview');
      }
    } else if (panel === 'agent') {
      if (agent) agent.classList.add('mobile-active-view');
    } else if (panel === 'audit') {
      if (dock) {
        dock.classList.add('mobile-active-view');
        switchDockTab('audit');
      }
    }
    return;
  }

  const canvas = $('ide-workspace');
  if (!canvas) return;

  if (panel === 'sidebar') {
    toggleSidebar(true);
    canvas.scrollTo({ left: 0, behavior: 'smooth' });
  } else if (panel === 'editor') {
    canvas.scrollTo({ left: 260, behavior: 'smooth' });
  } else if (panel === 'dock') {
    toggleBottomDock(true);
    canvas.scrollTo({ left: 300, behavior: 'smooth' });
  } else if (panel === 'preview') {
    switchDockTab('preview');
    canvas.scrollTo({ left: 450, behavior: 'smooth' });
  } else if (panel === 'agent') {
    toggleAgentPanel(true);
    canvas.scrollTo({ left: 900, behavior: 'smooth' });
  } else if (panel === 'audit') {
    switchDockTab('audit');
  }
}

// ═════════════════════════════════════════════════════════════════
// LIVE PREVIEW ENGINE
// ═════════════════════════════════════════════════════════════════
function updatePreview() {
  const iframe = $('previewIframe');
  if (!iframe || !window.TermVFS) return;

  const htmlFile = window.TermVFS.getFile('index.html');
  const cssFile = window.TermVFS.getFile('style.css');
  const jsFile = window.TermVFS.getFile('main.js') || window.TermVFS.getFile('app.js');

  let html = htmlFile ? htmlFile.content : '<h1>index.html não encontrado</h1>';

  if (cssFile) {
    html = html.replace('</head>', `<style>${cssFile.content}</style></head>`);
  }

  const errorBridge = `
    <script>
      window.addEventListener('error', function(e) {
        window.parent.postMessage({ type: 'preview-error', message: e.message, line: e.lineno }, '*');
      });
      console.log = (function(oldLog) {
        return function(...args) {
          oldLog(...args);
          window.parent.postMessage({ type: 'preview-log', args: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)) }, '*');
        };
      })(console.log);
    </script>
  `;

  if (jsFile) {
    html = html.replace('</body>', `${errorBridge}<script>${jsFile.content}</script></body>`);
  } else {
    html = html.replace('</body>', `${errorBridge}</body>`);
  }

  iframe.srcdoc = html;
}

window.updatePreview = updatePreview;

window.addEventListener('message', e => {
  if (e.data && e.data.type === 'preview-error') {
    if (window.TermLogs) {
      window.TermLogs.add('Preview', `Erro no app: ${e.data.message} (linha ${e.data.line})`, 'error');
    }
    const badge = $('previewErrorBadge');
    if (badge) {
      badge.textContent = `Erro: ${e.data.message}`;
      badge.classList.remove('hidden');
    }
  } else if (e.data && e.data.type === 'preview-log') {
    if (window.TermLogs) {
      window.TermLogs.add('Preview', `Console: ${e.data.args.join(' ')}`, 'info');
    }
  }
});

function setPreviewDevice(mode) {
  cfg.deviceMode = mode;
  store.set('cfg', cfg);
  const container = $('previewFrameContainer');
  if (!container) return;

  container.className = 'preview-iframe-wrap ' + mode;
  document.querySelectorAll('.btn-device').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick') && b.getAttribute('onclick').includes(mode));
  });
}

// ═════════════════════════════════════════════════════════════════
// GIT MANAGER & GITHUB OAUTH
// ═════════════════════════════════════════════════════════════════
function renderGitPanel() {
  if (!window.TermGit) return;
  const isAuth = window.TermGit.isAuthenticated();
  const loggedInView = $('githubLoggedInView');
  const loggedOutView = $('githubLoggedOutView');
  const avatar = $('ghUserAvatar');
  const nameEl = $('ghUserName');
  const loginEl = $('ghUserLogin');

  if (isAuth && window.TermGit.user) {
    if (loggedInView) loggedInView.classList.remove('hidden');
    if (loggedOutView) loggedOutView.classList.add('hidden');

    const user = window.TermGit.user;
    if (avatar) avatar.src = user.avatar_url || 'icons/icon-192x192.png';
    if (nameEl) nameEl.textContent = user.name || user.login;
    if (loginEl) loginEl.textContent = `@${user.login}`;

    if (window.TermGit.repos.length === 0) {
      loadGitHubRepos();
    }
  } else {
    if (loggedInView) loggedInView.classList.add('hidden');
    if (loggedOutView) loggedOutView.classList.remove('hidden');
  }

  // Branch & modified files
  const git = window.TermGit.getRepoState();
  const branchSelect = $('gitBranchSelect');
  if (branchSelect) {
    branchSelect.innerHTML = git.branches.map(b => `<option value="${b}" ${b === git.branch ? 'selected' : ''}>${b}</option>`).join('');
  }

  const filesList = $('dockGitFilesList');
  const changed = window.TermVFS ? window.TermVFS.listFiles().slice(0, 5) : [];
  if (filesList) {
    filesList.innerHTML = changed.map(f => `
      <div class="git-file-row"><span>${esc(f)}</span> <span class="git-status-m">M</span></div>
    `).join('');
  }

  updateProjectContextStats();
}

window.renderGitPanel = renderGitPanel;

async function loadGitHubRepos() {
  const select = $('githubRepoSelect');
  const statusEl = $('githubActionStatus');
  if (select) select.innerHTML = '<option value="">Buscando repositórios...</option>';
  if (statusEl) statusEl.innerHTML = '<span class="term-dim">Carregando repositórios do GitHub...</span>';

  try {
    const repos = await window.TermGit.fetchRepositories();
    if (!select) return;

    if (repos.length === 0) {
      select.innerHTML = '<option value="">Nenhum repositório encontrado</option>';
      if (statusEl) statusEl.innerHTML = '';
      return;
    }

    const savedRepo = localStorage.getItem('tc_gh_selected_repo');
    select.innerHTML = repos.map(r => {
      const isSel = savedRepo === r.full_name ? 'selected' : '';
      const priv = r.private ? '🔒 ' : '';
      return `<option value="${r.full_name}" data-branch="${r.default_branch}" data-url="${r.html_url}" ${isSel}>${priv}${r.full_name}</option>`;
    }).join('');

    onSelectGitHubRepo(select.value);
    if (statusEl) statusEl.innerHTML = `<span class="term-ok">✓ ${repos.length} repositórios carregados.</span>`;
  } catch (err) {
    if (select) select.innerHTML = `<option value="">Erro ao carregar: ${err.message}</option>`;
    if (statusEl) statusEl.innerHTML = `<span class="term-err">Falha: ${err.message}</span>`;
  }
}

function onSelectGitHubRepo(fullName) {
  const select = $('githubRepoSelect');
  const openLink = $('btnGhOpenRepo');
  const branchInput = $('githubBranchInput');

  if (!select) return;
  const opt = select.selectedOptions[0];
  if (opt && opt.dataset.branch && branchInput) {
    branchInput.value = opt.dataset.branch || 'main';
  }
  if (opt && opt.dataset.url && openLink) {
    openLink.href = opt.dataset.url;
    openLink.style.display = 'inline-flex';
  }
  localStorage.setItem('tc_gh_selected_repo', fullName);
}

async function doGitHubPull() {
  const select = $('githubRepoSelect');
  const branchInput = $('githubBranchInput');
  const statusEl = $('githubActionStatus');
  const fullName = select ? select.value : '';
  const branch = branchInput ? branchInput.value.trim() : 'main';

  if (!fullName) return alert('Selecione um repositório para o Pull.');

  if (!confirm(`Importar ${fullName}@${branch} para este workspace?`)) return;

  const btn = $('btnGhPull');
  if (btn) btn.disabled = true;

  try {
    await window.TermGit.pullRepository(fullName, branch, st => {
      if (statusEl) statusEl.innerHTML = `<span class="term-dim">${esc(st)}</span>`;
    });
    if (statusEl) statusEl.innerHTML = `<span class="term-ok">✓ Pull concluído de ${fullName}@${branch}!</span>`;
    renderFileTree();
    updatePreview();
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span class="term-err">Erro: ${esc(err.message)}</span>`;
    alert(`Erro no Pull: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function doGitHubPush() {
  const select = $('githubRepoSelect');
  const branchInput = $('githubBranchInput');
  const statusEl = $('githubActionStatus');
  const commitInp = $('gitCommitMsgInput');

  const fullName = select ? select.value : '';
  const branch = branchInput ? branchInput.value.trim() : 'main';
  let commitMsg = commitInp && commitInp.value.trim() ? commitInp.value.trim() : '';

  if (!fullName) return alert('Selecione ou crie um repositório no GitHub para o Push.');

  if (!commitMsg) {
    commitMsg = prompt('Mensagem de commit para o Push:', 'feat: atualizações via TermChat Web IDE');
    if (!commitMsg) return;
  }

  const btn = $('btnGhPush');
  if (btn) btn.disabled = true;

  try {
    const res = await window.TermGit.pushRepository(fullName, branch, commitMsg, st => {
      if (statusEl) statusEl.innerHTML = `<span class="term-dim">${esc(st)}</span>`;
    });
    if (statusEl) statusEl.innerHTML = `<span class="term-ok">✓ <b>Push concluído!</b> ${res.message}</span>`;
    if (commitInp) commitInp.value = '';
    renderGitPanel();
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span class="term-err">Erro: ${esc(err.message)}</span>`;
    alert(`Erro no Push: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function promptCreateRepo() {
  const name = prompt('Nome do novo repositório no GitHub:');
  if (!name || !name.trim()) return;

  const desc = prompt('Descrição do repositório:', 'Projeto desenvolvido no TermChat Web IDE') || '';
  const isPrivate = confirm('O repositório deve ser PRIVADO? (OK = Sim, Cancelar = Público)');

  try {
    const repo = await window.TermGit.createRepoOnGitHub(name.trim(), desc, isPrivate);
    alert(`✓ Repositório "${repo.full_name}" criado com sucesso!`);
    await loadGitHubRepos();
  } catch (err) {
    alert(`Erro ao criar: ${err.message}`);
  }
}

function promptPatToken() {
  if (window.TermGit) window.TermGit.openConnectModal();
}

async function doGitCommit() {
  const inp = $('gitCommitMsgInput');
  if (!inp || !inp.value.trim()) return alert('Digite uma mensagem de commit.');

  if (window.TermGit) {
    window.TermGit.createCommit(inp.value.trim());
    inp.value = '';
    renderGitPanel();
    alert('Commit registrado com sucesso!');
  }
}

async function suggestGitCommit() {
  const inp = $('gitCommitMsgInput');
  if (!inp || !window.TermGit) return;
  inp.value = 'Gerando sugestão com IA...';
  const msg = await window.TermGit.suggestCommitMessage();
  inp.value = msg;
}

// ═════════════════════════════════════════════════════════════════
// SETTINGS, CONFIG & EXPORT
// ═════════════════════════════════════════════════════════════════
const PROVIDER_MODELS_MAP = {
  nvidia: [
    { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: '💚 NVIDIA Nemotron 70B Instruct (Alta Precisão)' },
    { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', name: '💚 NVIDIA Nemotron 3 Nano Omni Reasoning' },
    { id: 'nvidia/nemotron-4-340b-instruct', name: '💚 NVIDIA Nemotron 4 340B Instruct (Ultra Scale)' },
    { id: 'meta/llama-3.3-70b-instruct', name: '💚 NVIDIA Llama 3.3 70B Instruct' },
    { id: 'deepseek-ai/deepseek-r1', name: '💚 NVIDIA DeepSeek R1 Reasoning' },
    { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: '💚 NVIDIA Mixtral 8x22B Instruct' },
    { id: 'google/gemma-2-27b-it', name: '💚 NVIDIA Gemma 2 27B IT' }
  ],
  gemini: [
    { id: 'gemini-3.8-flash', name: '✨ Gemini 3.8 Flash (Padrão AI Studio Turbo)' },
    { id: 'gemini-3.1-pro-preview', name: '✨ Gemini 3.1 Pro Preview (Avançado Code & Multimodal)' },
    { id: 'gemini-2.5-flash', name: '✨ Gemini 2.5 Flash (Ultrarrápido)' },
    { id: 'gemini-2.5-pro', name: '✨ Gemini 2.5 Pro (Raciocínio Lógico Profundo)' },
    { id: 'gemini-1.5-pro', name: '✨ Gemini 1.5 Pro (Janela de Contexto 2M)' },
    { id: 'gemini-1.5-flash', name: '✨ Gemini 1.5 Flash (Estável Prod)' },
    { id: 'gemini-flash-latest', name: '✨ Gemini Flash Latest (Atualizado)' }
  ],
  opencode: [
    { id: 'opencode-zen-1', name: '⚡ OpenCode Zen 1 (Direct Code Free)' },
    { id: 'qwen-2.5-coder-32b', name: '⚡ OpenCode Qwen 2.5 Coder 32B' },
    { id: 'deepseek-r1-zen', name: '⚡ OpenCode DeepSeek R1 Zen' }
  ],
  meta: [
    { id: 'meta-llama/llama-3.3-70b-instruct', name: '🦙 Meta Llama 3.3 70B Instruct (Top Performance)' },
    { id: 'meta-llama/llama-3.1-405b-instruct', name: '🦙 Meta Llama 3.1 405B Instruct (Ultra Scale)' },
    { id: 'meta-llama/llama-3.1-70b-instruct', name: '🦙 Meta Llama 3.1 70B Instruct' },
    { id: 'meta-llama/llama-3.1-8b-instruct', name: '🦙 Meta Llama 3.1 8B Instruct (Super Fast)' },
    { id: 'meta-llama/llama-3.2-3b-instruct', name: '🦙 Meta Llama 3.2 3B Instruct (Leve)' }
  ],
  deepseek: [
    { id: 'deepseek/deepseek-r1', name: '🧠 DeepSeek-R1 (Raciocínio Matemático e Código)' },
    { id: 'deepseek/deepseek-chat', name: '🧠 DeepSeek V3 Chat (Model 671B)' },
    { id: 'deepseek-coder', name: '🧠 DeepSeek Coder 33B (Especializado em Programação)' }
  ],
  qwen: [
    { id: 'qwen/qwen-2.5-coder-32b-instruct', name: '🌐 Qwen 2.5 Coder 32B Instruct (Líder em Código Open Source)' },
    { id: 'qwen/qwen-2.5-72b-instruct', name: '🌐 Qwen 2.5 72B Instruct (Geral Avançado)' },
    { id: 'qwen-turbo', name: '🌐 Qwen Turbo High Efficiency' }
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: '⚡ Groq Llama 3.3 70B Versatile (~800 tokens/s)' },
    { id: 'llama-3.1-8b-instant', name: '⚡ Groq Llama 3.1 8B Instant (Instantâneo)' },
    { id: 'mixtral-8x7b-32768', name: '⚡ Groq Mixtral 8x7B (32k Context)' },
    { id: 'gemma2-9b-it', name: '⚡ Groq Gemma 2 9B IT' }
  ],
  openrouter: [
    { id: 'google/gemini-2.5-pro-exp', name: '📡 OpenRouter Gemini 2.5 Pro Exp' },
    { id: 'anthropic/claude-3.5-sonnet', name: '📡 OpenRouter Claude 3.5 Sonnet' },
    { id: 'deepseek/deepseek-r1', name: '📡 OpenRouter DeepSeek R1' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: '📡 OpenRouter Llama 3.3 70B' },
    { id: 'mistralai/mistral-large-2407', name: '📡 OpenRouter Mistral Large 2407' },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: '📡 OpenRouter Llama 3.1 8B (:free)' },
    { id: 'google/gemma-2-9b-it:free', name: '📡 OpenRouter Gemma 2 9B (:free)' },
    { id: 'qwen/qwen-2.5-72b-instruct:free', name: '📡 OpenRouter Qwen 2.5 72B (:free)' },
    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: '📡 OpenRouter Mistral Small 3.1 (:free)' }
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: '⚡ Groq Llama 3.3 70B Versatile' },
    { id: 'llama-3.1-8b-instant', name: '⚡ Groq Llama 3.1 8B Instant (Free Tier)' },
    { id: 'qwen/qwen3-32b', name: '⚡ Groq Qwen 3 32B' },
    { id: 'deepseek-r1-distill-llama-70b', name: '⚡ Groq DeepSeek R1 Distill 70B' }
  ],
  cerebras: [
    { id: 'llama-3.3-70b', name: '🧬 Cerebras Llama 3.3 70B (Free Tier Veloz)' },
    { id: 'llama3.1-8b', name: '🧬 Cerebras Llama 3.1 8B (Ultra Rápido)' },
    { id: 'qwen-3-32b', name: '🧬 Cerebras Qwen 3 32B' }
  ],
  sambanova: [
    { id: 'Meta-Llama-3.3-70B-Instruct', name: '🔥 SambaNova Llama 3.3 70B (Free Tier)' },
    { id: 'Meta-Llama-3.1-405B-Instruct', name: '🔥 SambaNova Llama 3.1 405B (Ultra Scale)' },
    { id: 'Qwen2.5-72B-Instruct', name: '🔥 SambaNova Qwen 2.5 72B' }
  ],
  together: [
    { id: 'meta-llama/Llama-3.2-3B-Instruct:free', name: '🤝 Together Llama 3.2 3B (:free)' },
    { id: 'meta-llama/Llama-3.1-8B-Instruct:free', name: '🤝 Together Llama 3.1 8B (:free)' },
    { id: 'google/gemma-2-9b-it:free', name: '🤝 Together Gemma 2 9B (:free)' },
    { id: 'meta-llama/Llama-Vision-Free', name: '🤝 Together Llama Vision (:free)' }
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-latest', name: '🎭 Claude 3.5 Sonnet (State-of-the-Art Coding)' },
    { id: 'claude-3-7-sonnet', name: '🎭 Claude 3.7 Sonnet (Reasoning & Code)' },
    { id: 'claude-3-5-haiku-latest', name: '🎭 Claude 3.5 Haiku (Ultrarrápido)' },
    { id: 'claude-3-opus-20240229', name: '🎭 Claude 3 Opus' }
  ],
  openai: [
    { id: 'gpt-4o', name: '🤖 GPT-4o (Omni Multimodal)' },
    { id: 'gpt-4o-mini', name: '🤖 GPT-4o Mini (Eficiente)' },
    { id: 'o3-mini', name: '🤖 OpenAI o3-mini (Raciocínio Técnico)' },
    { id: 'gpt-4.5-preview', name: '🤖 GPT-4.5 Preview (Flagship)' }
  ],
  mistral: [
    { id: 'codestral-latest', name: '🌪️ Codestral Latest (Especialista em Software)' },
    { id: 'mistral-large-latest', name: '🌪️ Mistral Large 2 (Raciocínio Rápido)' },
    { id: 'pixtral-12b-2409', name: '🌪️ Pixtral 12B Multimodal' }
  ],
  huggingface: [
    { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: '🤗 HuggingFace Qwen 2.5 Coder 32B' },
    { id: 'meta-llama/Llama-3.3-70B-Instruct', name: '🤗 HuggingFace Llama 3.3 70B' },
    { id: 'bigcode/starcoder2-15b', name: '🤗 HuggingFace StarCoder2 15B' },
    { id: 'Qwen/Qwen2.5-72B-Instruct', name: '🤗 HuggingFace Qwen 2.5 72B' },
    { id: 'meta-llama/Llama-3.1-8B-Instruct', name: '🤗 HuggingFace Llama 3.1 8B' },
    { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: '🤗 HuggingFace Mistral 7B v0.3' }
  ],
  pollinations: [
    { id: 'openai', name: '🌍 Pollinations OpenAI Free (Sem API Key)' },
    { id: 'mistral', name: '🌍 Pollinations Mistral Free (Sem API Key)' },
    { id: 'searchgpt', name: '🌍 Pollinations SearchGPT Web Search Free' }
  ],
  custom: [
    { id: 'custom-model', name: '🛠️ Modelo Customizado / Servidor Local (Ollama/LM Studio)' }
  ],
  auto: [
    { id: 'gemini-3.8-flash', name: '⚡ Auto-Routing Inteligente (Cascata Fallback)' }
  ]
};

function quickSelectModel(provider, modelId) {
  if ($('cfgProvider')) $('cfgProvider').value = provider;
  onProviderSelectChanged(provider, modelId);
  if ($('cfgModel')) $('cfgModel').value = modelId;
  if ($('cfgCustomModelInput')) $('cfgCustomModelInput').value = modelId;
  if ($('cfgMsg')) $('cfgMsg').textContent = `✓ [${provider.toUpperCase()}] / [${modelId}] selecionado! Clique em 'Salvar Alterações'.`;
}
window.quickSelectModel = quickSelectModel;

function toggleModelsDrawer() {
  const modal = $('aiModelsModal');
  if (modal) {
    modal.classList.remove('hidden');
    if ($('cfgProvider')) $('cfgProvider').value = cfg.provider || 'auto';
    if ($('cfgCustomUrl')) $('cfgCustomUrl').value = cfg.customBaseUrl || '';
    if ($('cfgCustomModelInput')) $('cfgCustomModelInput').value = cfg.model || '';
    onProviderSelectChanged(cfg.provider || 'auto', cfg.model);
  }
}

function closeModelsDrawer() {
  const modal = $('aiModelsModal');
  if (modal) modal.classList.add('hidden');
}

function onProviderSelectChanged(provider, selectedModel) {
  const modelSelect = $('cfgModel');
  const customModelInput = $('cfgCustomModelInput');
  const keyInput = $('cfgKey');
  const keyLabel = $('cfgKeyLabel');
  const statusBadge = $('providerKeyStatusBadge');
  const customBox = $('customUrlBox');

  if (customBox) {
    customBox.classList.toggle('hidden', provider !== 'custom');
  }

  // Populate model options
  if (modelSelect) {
    const list = PROVIDER_MODELS_MAP[provider] || PROVIDER_MODELS_MAP.auto;
    const isMatchingPreset = list.some(m => m.id === selectedModel);
    modelSelect.innerHTML = list.map(m => `<option value="${m.id}" ${selectedModel === m.id ? 'selected' : ''}>${m.name}</option>`).join('');
    
    if (!isMatchingPreset && selectedModel && customModelInput) {
      customModelInput.value = selectedModel;
    } else if (isMatchingPreset && customModelInput && !customModelInput.value) {
      customModelInput.value = selectedModel || list[0].id;
    }
  }

  // Retrieve per-provider API key
  const storedKey = (cfg.providerKeys && cfg.providerKeys[provider]) || (provider === cfg.provider ? cfg.key : '');
  if (keyInput) {
    keyInput.value = storedKey || '';
  }

  const providerNames = {
    gemini: 'Google Gemini',
    opencode: 'OpenCode / Zen',
    meta: 'Meta Llama',
    deepseek: 'DeepSeek AI',
    qwen: 'Alibaba Qwen',
    nvidia: 'NVIDIA NIM',
    anthropic: 'Anthropic Claude',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    groq: 'Groq LPU',
    cerebras: 'Cerebras (Free Tier)',
    sambanova: 'SambaNova (Free Tier)',
    together: 'Together AI (:free)',
    ollama: 'Ollama (Local)',
    zen: 'OpenCode Zen',
    mistral: 'Mistral AI',
    huggingface: 'HuggingFace',
    pollinations: 'Pollinations (Free)',
    custom: 'Endpoint Custom',
    auto: 'Auto-Routing'
  };

  const name = providerNames[provider] || provider;
  if (keyLabel) {
    keyLabel.textContent = `Chave de API (${name}):`;
  }

  if (statusBadge) {
    if (storedKey) {
      statusBadge.textContent = `🔑 Chave persistida para ${name}`;
      statusBadge.style.color = 'var(--accent-teal)';
    } else if (provider === 'pollinations' || provider === 'auto' || provider === 'opencode') {
      statusBadge.textContent = '⚡ Livre / Servidor Auto';
      statusBadge.style.color = 'var(--accent-cyan)';
    } else {
      statusBadge.textContent = '⚠️ Nenhuma chave salva (Usa chave do servidor se houver)';
      statusBadge.style.color = 'var(--text-dim)';
    }
  }
  renderModelExplorer();
}

function renderModelExplorer() {
  const grid = $('modelExplorerGrid');
  if (!grid) return;
  const provider = ($('cfgProvider') && $('cfgProvider').value) || cfg.provider || 'auto';
  const q = (($('modelExplorerSearch') && $('modelExplorerSearch').value) || '').toLowerCase();
  const list = PROVIDER_MODELS_MAP[provider] || PROVIDER_MODELS_MAP.auto || [];
  const provMeta = {
    pollinations: { tag: 'FREE · SEM CHAVE', free: true }, opencode: { tag: 'FREE', free: true }, zen: { tag: 'FREE', free: true },
    groq: { tag: 'FREE TIER', free: true }, cerebras: { tag: 'FREE TIER', free: true }, sambanova: { tag: 'FREE TIER', free: true },
    together: { tag: 'MODELOS :FREE', free: true }, openrouter: { tag: 'ALGUNS :FREE', free: 'mixed' },
    huggingface: { tag: 'TOKEN GRÁTIS', free: true }, gemini: { tag: 'FREE TIER', free: true },
    nvidia: { tag: 'CRÉDITOS GRÁTIS', free: true }, mistral: { tag: 'FREE TIER', free: true },
    ollama: { tag: 'LOCAL', free: true }, custom: { tag: 'LOCAL', free: true }
  };
  const meta = provMeta[provider] || { tag: 'PAGO', free: false };
  const activeModel = (cfg.provider === provider && cfg.model) ? cfg.model : '';
  const cards = list
    .filter(m => !q || (m.name + ' ' + m.id).toLowerCase().includes(q))
    .map(m => {
      const isActive = activeModel === m.id;
      const isFree = meta.free === true || (meta.free === 'mixed' && String(m.id).includes(':free')) || String(m.id).includes(':free');
      const mid = String(m.id).replace(/'/g, "\'");
      const border = isActive ? 'var(--accent-cyan)' : 'var(--border)';
      return '<div onclick="explorerPick(\'' + provider + '\',\'' + mid + '\')" style="cursor:pointer;background:var(--bg-panel);border:1px solid ' + border + ';border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:2px;transition:border-color .15s" onmouseover="this.style.borderColor=\'var(--accent-cyan)\'" onmouseout="this.style.borderColor=\'' + border + '\'" title="' + m.id + '">' +
        '<span style="font-size:10.5px;font-weight:600;color:#fff;line-height:1.3">' + m.name + '</span>' +
        '<span style="font-size:8.5px;color:var(--text-dim);word-break:break-all">' + m.id + '</span>' +
        '<span style="font-size:8px;font-weight:700;color:' + (isFree ? '#37e6a0' : '#ffd15c') + '">' + (isFree ? '✓ GRÁTIS' : 'PAGO/CHAVE') + '</span>' +
        '</div>';
    }).join('');
  grid.innerHTML = cards || '<div style="font-size:11px;color:var(--text-dim)">Nenhum modelo para a busca. Use o modelo customizado abaixo.</div>';
}
function explorerPick(provider, modelId) {
  quickSelectModel(provider, modelId);
  renderModelExplorer();
}
window.renderModelExplorer = renderModelExplorer;
window.explorerPick = explorerPick;

function onApiKeyInputChanged(val) {
  const provider = $('cfgProvider') ? $('cfgProvider').value : cfg.provider;
  if (!cfg.providerKeys) cfg.providerKeys = {};
  cfg.providerKeys[provider] = val.trim();

  const statusBadge = $('providerKeyStatusBadge');
  if (statusBadge) {
    if (val.trim()) {
      statusBadge.textContent = `🔑 Chave configurada (${provider})`;
      statusBadge.style.color = 'var(--accent-teal)';
    } else {
      statusBadge.textContent = '⚠️ Sem chave configurada';
      statusBadge.style.color = 'var(--text-dim)';
    }
  }
}

function saveModelsDrawer() {
  const provider = $('cfgProvider') ? $('cfgProvider').value : 'auto';
  const key = $('cfgKey') ? $('cfgKey').value.trim() : '';
  const selectedModel = $('cfgModel') ? $('cfgModel').value.trim() : '';
  const customModelInput = $('cfgCustomModelInput') ? $('cfgCustomModelInput').value.trim() : '';
  const customUrl = $('cfgCustomUrl') ? $('cfgCustomUrl').value.trim() : '';

  const finalModel = customModelInput || selectedModel || 'gemini-3.8-flash';

  if (!cfg.providerKeys) cfg.providerKeys = {};
  cfg.providerKeys[provider] = key;

  cfg.provider = provider;
  cfg.key = key;
  cfg.model = finalModel;
  cfg.customBaseUrl = customUrl;

  store.set('cfg', cfg);
  if ($('cfgMsg')) $('cfgMsg').textContent = `✓ Provedor [${provider.toUpperCase()}] e Modelo [${finalModel}] salvos!`;
  updateModelBadge();

  if (window.TermFirebase) {
    window.TermFirebase.saveProjectSettings(cfg);
  }
  setTimeout(() => closeModelsDrawer(), 800);
}

function updateModelBadge() {
  const prov = (cfg.provider || 'auto').toUpperCase();
  const mdl = cfg.model || 'gemini-3.8-flash';

  const topBadge = $('topModelName');
  if (topBadge) {
    topBadge.textContent = `${prov} • ${mdl}`;
  }

  const badgeOld = $('currentModelBadge');
  if (badgeOld) {
    badgeOld.textContent = `${prov}:${mdl}`;
  }
}

window.onApiKeyInputChanged = onApiKeyInputChanged;

function saveCfg() {
  if ($('cfgProvider')) cfg.provider = $('cfgProvider').value;
  if ($('cfgKey')) cfg.key = $('cfgKey').value.trim();
  if ($('cfgModel')) cfg.model = $('cfgModel').value.trim();
  store.set('cfg', cfg);
  if ($('cfgMsg')) $('cfgMsg').textContent = 'Configurações salvas ✓';
  updateModelBadge();

  if (window.TermFirebase) {
    window.TermFirebase.saveProjectSettings(cfg);
  }
}

function getActiveApiKey(provider) {
  if (cfg.providerKeys && cfg.providerKeys[provider]) {
    return cfg.providerKeys[provider];
  }
  if (cfg.provider === provider && cfg.key) {
    return cfg.key;
  }
  return '';
}
window.getActiveApiKey = getActiveApiKey;

async function checkProviderHealth(provider) {
  const card = $(`hc-${provider}`);
  const badge = card ? card.querySelector('.hc-badge') : null;
  if (badge) {
    badge.textContent = '⏳ Testando...';
    badge.style.background = 'rgba(255,215,0,0.15)';
    badge.style.color = '#ffd700';
  }

  const apiKey = getActiveApiKey(provider);
  const customBaseUrl = cfg.customBaseUrl || '';
  const providerModels = PROVIDER_MODELS_MAP[provider] || [];
  const model = (cfg.provider === provider && cfg.model) ? cfg.model : (providerModels[0] ? providerModels[0].id : '');

  try {
    const res = await fetch('/api/health-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        model,
        apiKey,
        customBaseUrl
      })
    });

    const data = await res.json();
    if (data.ok) {
      if (badge) {
        const keyInfo = apiKey ? ' (Key OK)' : ' (Server/Free)';
        badge.textContent = `🟢 Ativo${keyInfo} - ${data.latencyMs}ms`;
        badge.style.background = 'rgba(55,230,160,0.15)';
        badge.style.color = '#37e6a0';
      }
      return { ok: true, provider, latencyMs: data.latencyMs };
    } else {
      if (badge) {
        const shortErr = (data.error || 'Erro').substring(0, 24);
        badge.textContent = `🔴 ${shortErr}`;
        badge.style.background = 'rgba(255,107,107,0.15)';
        badge.style.color = '#ff6b6b';
        badge.title = data.error || 'Erro de validação de chave ou endpoint';
      }
      return { ok: false, provider, error: data.error };
    }
  } catch (err) {
    if (badge) {
      badge.textContent = `🔴 Erro de Rede`;
      badge.style.background = 'rgba(255,107,107,0.15)';
      badge.style.color = '#ff6b6b';
      badge.title = err.message;
    }
    return { ok: false, provider, error: err.message };
  }
}

async function checkActiveProviderHealth() {
  const provider = $('cfgProvider') ? $('cfgProvider').value : (cfg.provider || 'auto');
  if ($('cfgMsg')) $('cfgMsg').textContent = `Testando saúde da API [${provider.toUpperCase()}]...`;
  
  const res = await checkProviderHealth(provider === 'auto' ? 'gemini' : provider);
  if (res && res.ok) {
    if ($('cfgMsg')) $('cfgMsg').textContent = `🟢 Provedor [${provider.toUpperCase()}] verificado com sucesso (${res.latencyMs}ms) ✓`;
  } else if (res) {
    if ($('cfgMsg')) $('cfgMsg').textContent = `🔴 Falha na verificação de [${provider.toUpperCase()}]: ${res.error || 'Erro de autenticação ou cota'}`;
  }
}

async function runAllHealthChecks() {
  if ($('cfgMsg')) $('cfgMsg').textContent = 'Diagnosticando todas as 14 APIs de Provedores em tempo real...';
  const providersToTest = [
    'gemini', 'nvidia', 'groq', 'openrouter', 'opencode', 'deepseek',
    'meta', 'qwen', 'anthropic', 'openai', 'mistral', 'huggingface',
    'pollinations', 'custom'
  ];
  
  const results = await Promise.all(providersToTest.map(p => checkProviderHealth(p)));
  const successCount = results.filter(r => r && r.ok).length;
  
  if ($('cfgMsg')) {
    $('cfgMsg').textContent = `✓ Diagnóstico concluído: ${successCount}/${providersToTest.length} provedores respondendo com sucesso!`;
  }
}

window.checkProviderHealth = checkProviderHealth;
window.checkActiveProviderHealth = checkActiveProviderHealth;
window.runAllHealthChecks = runAllHealthChecks;

async function testAI() {
  return checkActiveProviderHealth();
}

function renderPerms() {
  const permList = $('permList');
  if (!permList) return;
  permList.innerHTML = Object.entries(PERMS).map(([k, p]) => {
    let st; try { st = permState(k); } catch (e) { st = 'prompt'; }
    const cls = st === 'granted' ? 'ok' : st === 'denied' ? 'no' : 'ask';
    return '<div class="perm"><span>' + esc(p.label) + '</span><span class="' + cls + '">' + st + '</span></div>';
  }).join('');
}

function renderExplore() {
  const q = ($('pluginSearch') ? $('pluginSearch').value : '').toLowerCase();
  const inst = installed();
  const list = PLUGINS.filter(p => !q || (p.name + p.desc + p.cat).toLowerCase().includes(q));

  const grid = $('pluginGrid');
  if (grid) {
    grid.innerHTML = list.map(p => {
      const on = inst.includes(p.id);
      return `
        <div class="card ${on ? 'installed' : ''}">
          <b>${esc(p.name)}</b>
          <div style="font-size:11px;color:var(--text-muted);margin:4px 0">${esc(p.desc)}</div>
          <button class="btn btn-sm ${on ? 'btn-danger' : 'btn-primary'}" onclick="togglePlugin('${p.id}')">
            ${on ? 'Remover' : 'Instalar'}
          </button>
        </div>
      `;
    }).join('');
  }
}

function togglePlugin(id) {
  const list = installed();
  const p = pluginById(id);
  if (list.includes(id)) {
    store.set('plugins', list.filter(x => x !== id));
  } else {
    list.push(id);
    store.set('plugins', list);
    if (p && p.perms) p.perms.forEach(pm => ensurePerm(pm));
  }
  renderExplore();
  updateProjectContextStats();
}

function exportCfg() {
  const data = {
    provider: cfg.provider,
    model: cfg.model,
    plugins: installed(),
    notes: store.get('notes', []),
    hist: history,
    workspaces: window.TermVFS ? window.TermVFS.getAllWorkspaces() : []
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'termchat-backup.json';
  a.click();
}

function importCfg(inp) {
  const f = inp.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (d.provider) {
        cfg.provider = d.provider;
        cfg.model = d.model || '';
        store.set('cfg', cfg);
      }
      if (Array.isArray(d.plugins)) store.set('plugins', d.plugins);
      if (d.workspaces && window.TermVFS) window.TermVFS.saveAllWorkspaces(d.workspaces);
      renderFileTree();
      renderExplore();
      alert('Configurações e projetos restaurados com sucesso!');
    } catch (e) {
      alert('Arquivo JSON inválido');
    }
  };
  rd.readAsText(f);
  inp.value = '';
}

function wipe() {
  if (!confirm('Apagar TODOS os dados locais e workspaces do TermChat?')) return;
  Object.keys(localStorage).filter(k => k.startsWith('tc_')).forEach(k => localStorage.removeItem(k));
  location.reload();
}

// ═════════════════════════════════════════════════════════════════
// BOOT SEQUENCE & ATTACHMENTS
// ═════════════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => { }));
}

// Global exposure
window.selectActivity = selectActivity;
window.toggleSidebar = toggleSidebar;
window.toggleAgentPanel = toggleAgentPanel;
window.toggleBottomDock = toggleBottomDock;
window.toggleDockMax = toggleDockMax;
window.toggleMultiPaneDock = toggleMultiPaneDock;
window.switchDockTab = switchDockTab;
window.switchAgentSubtab = switchAgentSubtab;
window.toggleMenu = toggleMenu;
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.filterPalette = filterPalette;
window.executePaletteItem = executePaletteItem;
window.openShortcutsModal = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;
window.toggleModelsDrawer = toggleModelsDrawer;
window.onProviderSelectChanged = onProviderSelectChanged;
window.setQuickProvider = setQuickProvider;
window.saveCfg = saveCfg;
window.testAI = testAI;
window.toggleTheme = toggleTheme;
window.toggleLayoutMode = toggleLayoutMode;
window.applyDeviceMode = applyDeviceMode;
window.openDevicePromptModal = openDevicePromptModal;
window.closeDevicePromptModal = closeDevicePromptModal;
window.mobileFocusPanel = mobileFocusPanel;
window.formatCurrentCode = formatCurrentCode;
window.duplicateCurrentLine = duplicateCurrentLine;
window.createNewFilePrompt = createNewFilePrompt;
window.createNewFolderPrompt = createNewFolderPrompt;
window.deleteFilePrompt = deleteFilePrompt;
window.toggleProjectRoot = toggleProjectRoot;
window.toggleAccordion = toggleAccordion;
window.onGlobalSearchInput = onGlobalSearchInput;
window.jumpToSearchResult = jumpToSearchResult;
window.runGlobalReplace = runGlobalReplace;
window.doSidebarCommit = doSidebarCommit;
window.renderSidebarPlugins = renderSidebarPlugins;
window.addDbKeyValue = addDbKeyValue;
window.deleteDbKey = deleteDbKey;
window.triggerDeployTarget = triggerDeployTarget;
window.renderProblems = renderProblems;
window.renderConsoleLogs = renderConsoleLogs;
window.renderDockPlugins = renderDockPlugins;
window.sendAgentPrompt = sendAgentPrompt;
window.promptMentionFile = promptMentionFile;
window.handleFormSubmit = handleFormSubmit;
window.handleChatKeydown = handleChatKeydown;
window.runSpecializedAgent = runSpecializedAgent;
window.addNewAgentTaskPrompt = addNewAgentTaskPrompt;
window.runAgentTask = runAgentTask;
window.deleteAgentTask = deleteAgentTask;
window.addAgentMemoryPrompt = addAgentMemoryPrompt;
window.deleteAgentMemory = deleteAgentMemory;
window.doGitCommit = doGitCommit;
window.suggestGitCommit = suggestGitCommit;
window.doGitHubPull = doGitHubPull;
window.doGitHubPush = doGitHubPush;
window.promptCreateRepo = promptCreateRepo;
window.promptPatToken = promptPatToken;
window.onSelectGitHubRepo = onSelectGitHubRepo;
window.setPreviewDevice = setPreviewDevice;
window.togglePlugin = togglePlugin;
window.exportCfg = exportCfg;
window.importCfg = importCfg;
window.wipe = wipe;

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  if ($('cfgProvider')) $('cfgProvider').value = cfg.provider;
  if ($('cfgKey')) $('cfgKey').value = cfg.key || '';
  if ($('cfgModel')) $('cfgModel').value = cfg.model;

  renderFileTree();
  renderExplore();
  renderGitPanel();
  renderProblems();
  updateModelBadge();
  updateProjectContextStats();

  if (window.TermEditorInst) {
    window.TermEditorInst.openFile(window.TermEditorInst.activeFile || 'index.html');
  }

  updatePreview();

  // Initialize Firebase Firestore & Auth
  if (window.TermFirebase) {
    window.TermFirebase.init();
  }

  // Register Service Worker for PWA Offline Caching & Background Workspace Sync
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        if (window.TermLogs) {
          window.TermLogs.add('PWA', 'ServiceWorker ativo ✓ Cache e sincronização offline habilitados.', 'info');
        }

        window.addEventListener('online', () => {
          if ('sync' in reg) {
            reg.sync.register('sync-workspace-data').catch(() => {});
          }
          if (window.TermVFS) {
            window.TermVFS.syncOfflineQueue();
          }
        });
      })
      .catch(err => {
        console.warn('ServiceWorker registration error:', err);
      });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'EVENT_ONLINE_SYNC') {
        if (window.TermVFS) {
          window.TermVFS.syncOfflineQueue();
        }
      }
    });
  }

  // Initialize Device Detection (PC vs Mobile)
  initDeviceDetection();

  // Show update notification banner
  if (window.TermLogs) {
    window.TermLogs.add('System', '🚀 TermChat v2.2 atualizado com sucesso! +300 novos recursos, modelos Free AI, repositórios Git, linter Acorn em WebWorker e transições suaves ativos.', 'success');
  }
  setTimeout(() => {
    const updateBanner = document.createElement('div');
    updateBanner.id = 'updateBannerNotice';
    updateBanner.style.cssText = 'position:fixed;top:50px;right:20px;z-index:99999;background:var(--bg-card);border:1px solid var(--accent-cyan);color:#fff;padding:14px 18px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.6);font-size:12px;display:flex;align-items:center;gap:14px;max-width:380px;animation:panelFadeSlideIn 0.3s ease';
    updateBanner.innerHTML = `
      <span style="font-size:24px">🎉</span>
      <div style="flex:1">
        <b>Plataforma Atualizada! (v2.2)</b>
        <div style="color:var(--text-muted);font-size:11px;margin-top:3px">300+ novos recursos, modelos de IA Open/Free, linter Acorn em background e transições suaves ativados.</div>
      </div>
      <button onclick="document.getElementById('updateBannerNotice').remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px">&times;</button>
    `;
    document.body.appendChild(updateBanner);
    setTimeout(() => {
      if (document.getElementById('updateBannerNotice')) document.getElementById('updateBannerNotice').remove();
    }, 7000);
  }, 1000);
});

// Sync callbacks from Firestore
window.onFirestoreSettingsSync = function (settings) {
  if (!settings) return;
  if (settings.provider && $('cfgProvider')) {
    cfg.provider = settings.provider;
    $('cfgProvider').value = settings.provider;
  }
  if (settings.model && $('cfgModel')) {
    cfg.model = settings.model;
    $('cfgModel').value = settings.model;
  }
  updateModelBadge();
};

window.onFirestoreChatSync = function (msgs) {
  if (!Array.isArray(msgs) || msgs.length === 0) return;
  // If local history is empty, populate from Firestore
  if (history.length === 0) {
    msgs.forEach(m => {
      history.push({ role: m.role, content: m.content });
      print(m.role === 'assistant' ? 'ai' : m.role, m.content);
    });
    store.set('hist', history.slice(-40));
  }
};

// Fallback init
setTimeout(() => {
  renderFileTree();
  renderGitPanel();
  updateModelBadge();
  updateProjectContextStats();
  if (window.TermEditorInst && !window.TermEditorInst.activeFile) {
    window.TermEditorInst.openFile('index.html');
  }
}, 300);
