// ═════════════════════════════════════════════════════════════════
// TermChat Offline Guard — modo estático sem quebrar nada
// 1) Detecta se existe backend (sonda /api/health uma vez)
// 2) Sem backend: chamadas /api/* recebem 503 JSON com mensagem clara
//    em vez de 404 HTML ilegível (código existente lê .detail e mostra)
// 3) IA direta do navegador: Gemini (chave do usuário) e Pollinations
//    (livre, CORS aberto) para o chat funcionar no GitHub Pages
// ═════════════════════════════════════════════════════════════════
(function () {
  window.TERM_HAS_BACKEND = null; // null = sondando, true, false

  // Sonda o backend uma única vez (no GitHub Pages /api/health dá 404)
  fetch('/api/health', { method: 'GET' })
    .then(r => { window.TERM_HAS_BACKEND = r.ok; })
    .catch(() => { window.TERM_HAS_BACKEND = false; });

  const origFetch = window.fetch.bind(window);

  function isLocalApi(input) {
    try {
      const url = (typeof input === 'string') ? input : (input && input.url) || '';
      const u = new URL(url, location.origin);
      return u.origin === location.origin && u.pathname.startsWith('/api/');
    } catch (e) {
      return false;
    }
  }

  window.fetch = function (input, init) {
    if (window.TERM_HAS_BACKEND === false && isLocalApi(input)) {
      return Promise.resolve(new Response(JSON.stringify({
        detail: 'Backend não conectado. Este recurso precisa do servidor (node server.js no Termux/PC). O chat de IA funciona direto pelo navegador.'
      }), {
        status: 503,
        statusText: 'Backend Offline',
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    return origFetch(input, init);
  };

  // ─── IA direta do navegador (fallback do chat sem backend) ───
  window.directAIChat = async function (messages) {
    const cfg = window.cfg || {};
    const geminiKey = (cfg.providerKeys && cfg.providerKeys.gemini) ||
      (cfg.provider === 'gemini' ? cfg.key : '') || '';

    // 1) Gemini direto se o usuário tem chave própria
    if (geminiKey && /^AIza[A-Za-z0-9_\-]{20,}$/.test(geminiKey)) {
      try {
        const sys = (messages.find(m => m.role === 'system') || {}).content || '';
        const chat = messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        const model = (cfg.model && String(cfg.model).startsWith('gemini')) ? cfg.model : 'gemini-1.5-flash';
        const r = await origFetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(geminiKey),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: chat,
              systemInstruction: sys ? { parts: [{ text: sys }] } : undefined
            })
          }
        );
        if (r.ok) {
          const d = await r.json();
          const text = d && d.candidates && d.candidates[0] && d.candidates[0].content &&
            d.candidates[0].content.parts && d.candidates[0].content.parts[0] &&
            d.candidates[0].content.parts[0].text;
          if (text) return { text: text, provider: 'gemini-direto' };
        }
      } catch (e) { /* cai para Pollinations */ }
    }

    // 2) Pollinations: livre, sem chave, CORS aberto
    try {
      const r = await origFetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai', messages: messages })
      });
      if (r.ok) {
        const d = await r.json();
        const text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        if (text) return { text: text, provider: 'pollinations-direto' };
      }
    } catch (e) { /* tenta plano C */ }

    // 3) Plano C: Pollinations via GET simples (texto puro)
    const prompt = messages.map(m => m.role + ': ' + m.content).join('\n\n');
    const r2 = await origFetch('https://text.pollinations.ai/' + encodeURIComponent(prompt.slice(0, 4000)));
    if (!r2.ok) throw new Error('IA direta indisponível (status ' + r2.status + ')');
    const text2 = (await r2.text()).trim();
    if (!text2) throw new Error('IA direta devolveu resposta vazia');
    return { text: text2, provider: 'pollinations-get' };
  };
})();
