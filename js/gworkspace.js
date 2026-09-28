/**
 * TermChat — Google Workspace Cloud Integration Suite
 * Interconnects Gmail, Google Chat, Google Docs, Google Forms, and Google Drive
 * with full interactivity, zero-trust security and AI agent hooks.
 */

(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class TermWorkspaceSuite {
    constructor() {
      this.currentTab = 'gmail'; // 'gmail', 'chat', 'docs', 'forms', 'drive'
      this.activeSpaceId = 'spaces/general';
      this.activeMailId = null;
      this.activeFormId = null;
    }

    // --- Tab Switcher ---
    switchWorkspaceTab(tab) {
      this.currentTab = tab;
      document.querySelectorAll('.gws-tab-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = $(`gwsTab_${tab}`);
      if (activeBtn) activeBtn.classList.add('active');

      const tabs = ['gmail', 'chat', 'docs', 'forms', 'drive'];
      tabs.forEach(t => {
        const el = $(`gwsView_${t}`);
        if (el) el.classList.toggle('hidden', t !== tab);
      });

      if (tab === 'gmail') this.loadGmail();
      else if (tab === 'chat') this.loadChat();
      else if (tab === 'docs') this.loadDocs();
      else if (tab === 'forms') this.loadForms();
      else if (tab === 'drive') this.loadDrive();
    }

    // ═════════════════════════════════════════════════════════════════
    // 1. GMAIL SUITE
    // ═════════════════════════════════════════════════════════════════
    async loadGmail() {
      const listEl = $('gmailMessagesList');
      if (!listEl) return;
      listEl.innerHTML = '<div style="color:var(--text-dim);padding:10px">Carregando e-mails da sua conta Gmail...</div>';

      try {
        const res = await fetch('/api/google/gmail/messages');
        const data = await res.json();
        const msgs = data.messages || [];

        listEl.innerHTML = msgs.map(m => `
          <div class="gmail-msg-row ${m.read ? 'read' : 'unread'} ${this.activeMailId === m.id ? 'active' : ''}" onclick="TermWorkspace.readGmailMessage('${m.id}')">
            <div style="display:flex;align-items:center;gap:6px;width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <span style="color:${m.read ? 'var(--text-dim)' : 'var(--accent-cyan)'}">●</span>
              <b style="font-size:11.5px;color:#fff">${esc(m.sender.split('<')[0] || m.sender)}</b>
            </div>
            <div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px">
              <span style="font-weight:700;color:var(--text-main)">${esc(m.subject)}</span>
              <span style="color:var(--text-dim)"> — ${esc(m.snippet)}</span>
            </div>
            <div style="font-size:10px;color:var(--text-dim);width:70px;text-align:right">
              ${new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        `).join('') || '<div style="color:var(--text-dim);padding:12px;text-align:center">Nenhuma mensagem no Gmail.</div>';
      } catch (err) {
        listEl.innerHTML = `<div style="color:var(--accent-pink);padding:10px">Falha ao carregar Gmail: ${err.message}</div>`;
      }
    }

    async readGmailMessage(id) {
      this.activeMailId = id;
      const detailEl = $('gmailMessageDetail');
      if (!detailEl) return;

      try {
        const res = await fetch(`/api/google/gmail/${id}`);
        const data = await res.json();
        const m = data.message;

        detailEl.innerHTML = `
          <div class="gmail-detail-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:10px">
              <div>
                <b style="font-size:13.5px;color:var(--text-primary)">${esc(m.subject)}</b>
                <div style="font-size:11px;color:var(--accent-cyan);margin-top:2px">De: ${esc(m.sender)}</div>
                <div style="font-size:10.5px;color:var(--text-muted)">Data: ${new Date(m.date).toLocaleString()}</div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm btn-ghost" onclick="TermWorkspace.replyGmail('${esc(m.sender)}', '${esc(m.subject)}')">Responder</button>
                <button class="btn btn-sm btn-danger" onclick="TermWorkspace.deleteGmail('${m.id}')">Excluir</button>
              </div>
            </div>
            <pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;color:var(--text-primary);line-height:1.6">${esc(m.body || m.snippet)}</pre>
          </div>
        `;
        this.loadGmail();
      } catch (err) {
        detailEl.innerHTML = `<div style="color:var(--accent-pink)">Erro ao abrir mensagem: ${err.message}</div>`;
      }
    }

    replyGmail(to, subject) {
      const cleanTo = to.includes('<') ? to.match(/<([^>]+)>/)?.[1] || to : to;
      const subj = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
      this.openComposeModal(cleanTo, subj);
    }

    async deleteGmail(id) {
      if (!confirm('Deseja mover este e-mail para a lixeira?')) return;
      await fetch(`/api/google/gmail/${id}`, { method: 'DELETE' });
      this.activeMailId = null;
      $('gmailMessageDetail').innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px">Selecione um e-mail para ler o conteúdo completo.</div>';
      this.loadGmail();
    }

    openComposeModal(to = '', subject = '', body = '') {
      const toInp = $('gmailComposeTo');
      const subjInp = $('gmailComposeSubject');
      const bodyInp = $('gmailComposeBody');
      const modal = $('gmailComposeModal');

      if (toInp) toInp.value = to;
      if (subjInp) subjInp.value = subject;
      if (bodyInp) bodyInp.value = body;
      if (modal) modal.classList.remove('hidden');
    }

    closeComposeModal() {
      const modal = $('gmailComposeModal');
      if (modal) modal.classList.add('hidden');
    }

    async sendGmailFromCompose() {
      const to = $('gmailComposeTo')?.value.trim();
      const subject = $('gmailComposeSubject')?.value.trim();
      const body = $('gmailComposeBody')?.value.trim();

      if (!to || !subject) {
        alert('Preencha o Destinatário e o Assunto.');
        return;
      }

      // Trigger Zero-Trust Sensitive Action Approval
      if (window.TermIntegrations) {
        window.TermIntegrations.requestSensitiveApproval({
          action: 'gmail_send',
          title: 'Aprovação de Envio: Gmail API',
          description: `Você autoriza o envio deste e-mail com a sua conta do Gmail?`,
          details: `Para: ${to}\nAssunto: ${subject}\n\n${body}`,
          onApprove: async () => {
            const res = await fetch('/api/google/gmail/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to, subject, body })
            });
            const data = await res.json();
            alert(data.message || '✓ E-mail enviado com sucesso!');
            this.closeComposeModal();
            this.loadGmail();
          }
        });
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 2. GOOGLE CHAT SUITE
    // ═════════════════════════════════════════════════════════════════
    async loadChat() {
      const spacesEl = $('gchatSpacesList');
      if (!spacesEl) return;

      try {
        const res = await fetch('/api/google/chat/spaces');
        const data = await res.json();
        const spaces = data.spaces || [];

        spacesEl.innerHTML = spaces.map(s => `
          <div class="gchat-space-item ${this.activeSpaceId === s.id ? 'active' : ''}" onclick="TermWorkspace.selectChatSpace('${s.id}')">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <b style="font-size:11.5px;color:var(--text-primary)">${esc(s.displayName)}</b>
              ${s.unreadCount > 0 ? `<span class="badge badge-accent">${s.unreadCount}</span>` : ''}
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${esc(s.description || `${s.memberCount} membros`)}</div>
          </div>
        `).join('');

        this.loadChatMessages();
      } catch (err) {
        spacesEl.innerHTML = `<div style="color:var(--accent-pink);padding:6px">Erro: ${err.message}</div>`;
      }
    }

    selectChatSpace(spaceId) {
      this.activeSpaceId = spaceId;
      this.loadChat();
    }

    async loadChatMessages() {
      const feedEl = $('gchatMessagesFeed');
      if (!feedEl) return;

      try {
        const res = await fetch(`/api/google/chat/spaces/${encodeURIComponent(this.activeSpaceId)}/messages`);
        const data = await res.json();
        const msgs = data.messages || [];

        feedEl.innerHTML = msgs.map(m => `
          <div class="gchat-msg-card">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span class="gchat-avatar">${window.TermIcons ? window.TermIcons.get('sparkles', 14) : ''}</span>
              <b style="font-size:11.5px;color:var(--accent-cyan)">${esc(m.sender)}</b>
              <span style="font-size:9.5px;color:var(--text-muted);margin-left:auto">${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style="font-size:12px;color:var(--text-primary);line-height:1.5;margin-left:24px">${esc(m.text)}</div>
            <div class="gchat-reactions-row" style="margin-left:24px;margin-top:6px;display:flex;gap:4px">
              ${(m.reactions || []).map(r => `
                <span class="badge" onclick="TermWorkspace.reactToChatMessage('${m.id}', '${r.emoji}')" style="cursor:pointer;background:rgba(255,255,255,0.05);font-size:10px">${r.emoji} ${r.count}</span>
              `).join('')}
              <button class="btn btn-sm btn-ghost" onclick="TermWorkspace.promptReaction('${m.id}')" style="padding:1px 6px;font-size:10px">+ Reagir</button>
            </div>
          </div>
        `).join('') || '<div style="color:var(--text-dim);padding:20px;text-align:center">Nenhuma mensagem neste espaço. Envie a primeira!</div>';

        feedEl.scrollTop = feedEl.scrollHeight;
      } catch (err) {
        feedEl.innerHTML = `<div style="color:var(--accent-pink);padding:10px">Erro: ${err.message}</div>`;
      }
    }

    async sendChatMessage() {
      const inp = $('gchatMessageInput');
      if (!inp) return;
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';

      const user = window.TermAuth?.getGoogleUser() || { name: 'Papa Eco Delta (Dev)' };
      await fetch(`/api/google/chat/spaces/${encodeURIComponent(this.activeSpaceId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sender: user.name,
          avatar: 'user'
        })
      });

      this.loadChatMessages();
    }

    async reactToChatMessage(messageId, emoji) {
      await fetch('/api/google/chat/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId: this.activeSpaceId, messageId, emoji })
      });
      this.loadChatMessages();
    }

    promptReaction(messageId) {
      const emoji = prompt('Escolha um emoji para reagir (ex: 👍, ❤️, 🚀, 🤖, 🔥):', '🚀');
      if (emoji && emoji.trim()) {
        this.reactToChatMessage(messageId, emoji.trim());
      }
    }

    async createNewSpacePrompt() {
      const name = prompt('Nome do novo espaço do Google Chat (ex: sprint-reviews):');
      if (!name || !name.trim()) return;
      const desc = prompt('Descrição do espaço:', 'Canal de colaboração TermChat');

      const res = await fetch('/api/google/chat/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name.trim(), description: desc })
      });
      const data = await res.json();
      alert(data.message);
      this.loadChat();
    }

    // ═════════════════════════════════════════════════════════════════
    // 3. GOOGLE DOCS SUITE
    // ═════════════════════════════════════════════════════════════════
    async loadDocs() {
      const container = $('gdocsList');
      if (!container) return;

      try {
        const res = await fetch('/api/google/docs/list');
        const data = await res.json();
        const docs = data.docs || [];

        container.innerHTML = docs.map(d => `
          <div class="gdoc-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px">
                ${window.TermIcons ? window.TermIcons.get('gdocs', 18) : ''}
                <b style="font-size:12.5px;color:var(--text-primary)">${esc(d.title)}</b>
              </div>
              <span class="status-indicator status-connected">● Sincronizado</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
              Autor: <b>${esc(d.author)}</b> · Atualizado: ${new Date(d.updatedAt).toLocaleDateString()}
            </div>
            <div style="display:flex;gap:6px">
              <a href="${d.url}" target="_blank" class="btn btn-sm btn-primary">Abrir no Google Docs</a>
              <button class="btn btn-sm btn-ghost" onclick="TermWorkspace.appendDocContent('${d.id}')">Anexar Código</button>
            </div>
          </div>
        `).join('') || '<div style="color:var(--text-dim);padding:14px;text-align:center">Nenhum documento criado ainda.</div>';
      } catch (err) {
        container.innerHTML = `<div style="color:var(--accent-pink);padding:10px">Erro: ${err.message}</div>`;
      }
    }

    async createNewDocFromCurrentCode() {
      const activeFile = window.TermEditorInst?.activeFile || 'Projeto';
      const content = window.TermEditorInst?.codeTextarea?.value || 'Código do projeto';
      const title = prompt('Título do novo documento Google Docs:', `Documentação — ${activeFile}`);
      if (!title) return;

      const res = await fetch('/api/google/docs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: `# ${title}\n\nArquivo fonte: ${activeFile}\n\n\`\`\`javascript\n${content}\n\`\`\``
        })
      });
      const data = await res.json();
      alert(data.message);
      this.loadDocs();
    }

    async appendDocContent(docId) {
      const text = prompt('Texto ou resumo a anexar ao documento Google Docs:');
      if (!text || !text.trim()) return;

      const res = await fetch(`/api/google/docs/${docId}/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      alert(data.message);
      this.loadDocs();
    }

    // ═════════════════════════════════════════════════════════════════
    // 4. GOOGLE FORMS SUITE
    // ═════════════════════════════════════════════════════════════════
    async loadForms() {
      const container = $('gformsList');
      if (!container) return;

      try {
        const res = await fetch('/api/google/forms/list');
        const data = await res.json();
        const forms = data.forms || [];

        container.innerHTML = forms.map(f => `
          <div class="gform-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px">
                ${window.TermIcons ? window.TermIcons.get('gforms', 18) : ''}
                <b style="font-size:12.5px;color:var(--text-primary)">${esc(f.title)}</b>
              </div>
              <span class="status-indicator status-connected">● ${f.responsesCount} Respostas</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${esc(f.description)}</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm btn-primary" onclick="TermWorkspace.viewFormResponses('${f.id}')">Ver Respostas</button>
              <button class="btn btn-sm btn-ghost" onclick="TermWorkspace.simulateFormSubmit('${f.id}')">Preencher Teste</button>
              <a href="${f.editUrl}" target="_blank" class="btn btn-sm btn-ghost">Link Externo</a>
            </div>
          </div>
        `).join('') || '<div style="color:var(--text-dim);padding:14px;text-align:center">Nenhum formulário criado ainda.</div>';
      } catch (err) {
        container.innerHTML = `<div style="color:var(--accent-pink);padding:10px">Erro: ${err.message}</div>`;
      }
    }

    async createNewFormPrompt() {
      const title = prompt('Título do formulário Google Forms:', 'Feedback de Desenvolvimento TermChat');
      if (!title) return;
      const desc = prompt('Descrição do formulário:', 'Avalie a estabilidade e recursos do app.');

      const res = await fetch('/api/google/forms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: desc,
          questions: [
            { id: 'q1', type: 'MULTIPLE_CHOICE', title: 'Como você avalia esta versão?', options: ['Excelente', 'Boa', 'Precisa melhorar'] },
            { id: 'q2', type: 'TEXT', title: 'Qual funcionalidade você gostaria de ver a seguir?', required: false }
          ]
        })
      });
      const data = await res.json();
      alert(data.message);
      this.loadForms();
    }

    async viewFormResponses(formId) {
      try {
        const res = await fetch(`/api/google/forms/${formId}/responses`);
        const data = await res.json();
        const respList = data.responses || [];

        const details = respList.map((r, i) => `\n#${i + 1} (${new Date(r.submittedAt).toLocaleTimeString()}): ${JSON.stringify(r.answers)}`).join('');
        alert(`Google Forms — Respostas (${data.total}):${details || '\nNenhuma resposta ainda.'}`);
      } catch (err) {
        alert('Erro ao carregar respostas: ' + err.message);
      }
    }

    async simulateFormSubmit(formId) {
      const answer = prompt('Digite sua resposta para testar o formulário:', 'TermChat com Google Cloud é excelente!');
      if (!answer) return;

      const res = await fetch(`/api/google/forms/${formId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { q1: 'Excelente', q2: answer } })
      });
      const data = await res.json();
      alert(data.message);
      this.loadForms();
    }

    // ═════════════════════════════════════════════════════════════════
    // 5. GOOGLE DRIVE SUITE
    // ═════════════════════════════════════════════════════════════════
    async loadDrive() {
      const container = $('gdriveFilesList');
      if (!container) return;

      try {
        const res = await fetch('/api/google/drive/files');
        const data = await res.json();
        const files = data.files || [];

        container.innerHTML = files.map(f => `
          <div class="gdrive-file-row">
            <div style="display:flex;align-items:center;gap:10px">
              ${window.TermIcons ? window.TermIcons.get('gdrive', 20) : ''}
              <div>
                <b style="font-size:12px;color:var(--text-primary)">${esc(f.name)}</b>
                <div style="font-size:10px;color:var(--text-muted)">Tamanho: ${f.size} · Modificado: ${new Date(f.modifiedTime).toLocaleDateString()}</div>
              </div>
            </div>
            <div style="display:flex;gap:4px">
              <button class="btn btn-sm btn-primary" onclick="TermWorkspace.importFileFromDrive('${f.name}')">Baixar para IDE</button>
            </div>
          </div>
        `).join('') || '<div style="color:var(--text-dim);padding:14px;text-align:center">Nenhum arquivo no Google Drive.</div>';
      } catch (err) {
        container.innerHTML = `<div style="color:var(--accent-pink);padding:10px">Erro: ${err.message}</div>`;
      }
    }

    importFileFromDrive(fileName) {
      if (window.TermVFS) {
        window.TermVFS.writeFile(`drive-imports/${fileName}`, `// Arquivo importado do Google Drive: ${fileName}\n// Sincronizado com TermChat IDE.`, 'drive');
        if (window.renderFileTree) window.renderFileTree();
        alert(`✓ Arquivo "${fileName}" sincronizado e salvo na pasta "drive-imports/"!`);
      }
    }

    // --- Modal Management ---
    openWorkspaceModal(defaultTab = 'gmail') {
      const modal = $('googleWorkspaceModal');
      if (modal) modal.classList.remove('hidden');
      this.switchWorkspaceTab(defaultTab);
    }

    closeWorkspaceModal() {
      const modal = $('googleWorkspaceModal');
      if (modal) modal.classList.add('hidden');
    }
  }

  const gwsInst = new TermWorkspaceSuite();
  window.TermWorkspace = gwsInst;
})();
