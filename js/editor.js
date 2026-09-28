"use strict";

/**
 * TermChat Code Editor Engine
 * Multi-tab code editor with syntax highlighting, dynamic real-time minimap,
 * interactive viewport slider, and real-time live code streaming/typing engine.
 */
class TermEditor {
  constructor() {
    this.openTabs = ['index.html', 'style.css', 'main.js'];
    this.activeFile = 'index.html';
    this.dirty = new Set();
    this.pendingDiff = null;
    this.isStreaming = false;
    this.streamCancelRequested = false;
    this.streamFinishImmediately = false;
    this.streamTimer = null;
    this.linterWorker = null;

    try {
      this.linterWorker = new Worker('/js/linter.worker.js');
      this.linterWorker.onmessage = e => {
        const { problems } = e.data;
        this.handleLinterResults(problems);
      };
    } catch (err) {
      console.warn('WebWorker linter not supported, running on main thread:', err);
    }

    this.init();
  }

  init() {
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveCurrent();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.toggleSearch();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && e.shiftKey) {
        e.preventDefault();
        this.openLiveCodeModal();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        this.gotoLine();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        this.replaceAll();
      }
      if (e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.toggleWrap();
      }
    });

    if (window.TermVFS) {
      window.TermVFS.subscribe((event, data) => {
        if (event === 'file_deleted' && this.openTabs.includes(data.path)) {
          this.closeTab(data.path);
        }
        if (event === 'workspace_restored' || event === 'workspace_changed') {
          this.openFile(this.activeFile);
        }
      });
    }

    // Attach minimap click listener
    setTimeout(() => {
      const minimap = document.getElementById('editorMinimap');
      if (minimap) {
        minimap.addEventListener('click', e => this.handleMinimapClick(e));
      }
      this.renderMinimap();
    }, 200);
  }

  renderTabs() {
    const bar = document.getElementById('editorTabs');
    if (!bar) return;

    bar.innerHTML = this.openTabs.map(path => {
      const active = path === this.activeFile ? 'active' : '';
      const isDirty = this.dirty.has(path) ? '● ' : '';
      const ext = path.split('.').pop();
      const icon = this.getFileIcon(ext);
      return `
        <div class="editor-tab ${active}" onclick="TermEditorInst.openFile('${path}')">
          <span class="tab-icon">${icon}</span>
          <span class="tab-name">${isDirty}${path.split('/').pop()}</span>
          <span class="tab-close tab-close-btn" title="Fechar arquivo (×)" onclick="event.stopPropagation(); TermEditorInst.closeTab('${path}')">×</span>
        </div>
      `;
    }).join('');
  }

  getFileIcon(ext) {
    if (window.TermIcons) {
      if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return window.TermIcons.get('code', 14, 'icon-js');
      if (['html', 'htm'].includes(ext)) return window.TermIcons.get('globe', 14, 'icon-html');
      if (['css', 'scss', 'less'].includes(ext)) return window.TermIcons.get('sparkles', 14, 'icon-css');
      if (['json', 'geojson'].includes(ext)) return window.TermIcons.get('plugins', 14, 'icon-json');
      if (['sql', 'db'].includes(ext)) return window.TermIcons.get('database', 14, 'icon-sql');
      if (['sh', 'bash', 'zsh'].includes(ext)) return window.TermIcons.get('terminal', 14, 'icon-sh');
      return window.TermIcons.get('file', 14, 'icon-file');
    }
    return '';
  }

  openFile(path) {
    if (!path) return;
    if (!this.openTabs.includes(path)) {
      this.openTabs.push(path);
    }
    this.activeFile = path;
    this.renderTabs();

    const file = window.TermVFS ? window.TermVFS.getFile(path) : null;
    const textarea = document.getElementById('codeTextarea');
    const pathLabel = document.getElementById('editorFilePath');
    const extLabel = document.getElementById('editorFileExt');
    const bcFolder = document.getElementById('bcFolder');
    const bcFile = document.getElementById('bcFile');

    if (pathLabel) pathLabel.textContent = path;
    if (extLabel) extLabel.textContent = (path.split('.').pop() || 'txt').toUpperCase();
    
    const parts = path.split('/');
    if (bcFile) bcFile.textContent = parts.pop() || path;
    if (bcFolder) bcFolder.textContent = parts.join('/') || 'root';

    if (textarea) {
      textarea.value = file ? file.content : '';
      this.updateLineNumbers();
      this.updateHighlight();
      this.renderMinimap();
    }
  }

  closeTab(path) {
    this.openTabs = this.openTabs.filter(p => p !== path);
    if (this.activeFile === path) {
      this.activeFile = this.openTabs[0] || null;
      if (this.activeFile) this.openFile(this.activeFile);
    }
    this.renderTabs();
    if (!this.activeFile) {
      const textarea = document.getElementById('codeTextarea');
      if (textarea) textarea.value = '';
      this.updateLineNumbers();
      this.renderMinimap();
    }
  }

  onCodeInput() {
    const textarea = document.getElementById('codeTextarea');
    if (!textarea || !this.activeFile) return;

    this.dirty.add(this.activeFile);
    this.renderTabs();
    this.updateLineNumbers();
    this.updateHighlight();
    this.renderMinimap();
    this.runRealtimeLinter(textarea.value);

    // Auto-save debounce
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveCurrent();
    }, 1000);
  }

  runRealtimeLinter(code) {
    if (this.linterWorker) {
      this.linterWorker.postMessage({ code, activeFile: this.activeFile });
      return;
    }

    // Main thread fallback if WebWorker is unavailable
    const ext = (this.activeFile || '').split('.').pop().toLowerCase();
    const problems = [];

    if (['js', 'jsx', 'ts', 'tsx', 'mjs'].includes(ext)) {
      try {
        new Function(code);
      } catch (err) {
        let line = 1;
        const match = err.stack ? err.stack.match(/:(\d+):\d+/) : null;
        if (match && match[1]) {
          line = parseInt(match[1], 10);
        }
        problems.push({
          file: this.activeFile,
          line,
          message: err.message,
          severity: 'error'
        });
      }
    } else if (ext === 'json') {
      try {
        JSON.parse(code);
      } catch (err) {
        problems.push({
          file: this.activeFile,
          line: 1,
          message: `Erro JSON: ${err.message}`,
          severity: 'error'
        });
      }
    }

    this.handleLinterResults(problems);
  }

  handleLinterResults(problems) {
    const badge = document.getElementById('problemsBadgeCount');
    if (badge) {
      badge.textContent = problems.length;
      badge.style.display = problems.length > 0 ? 'inline-block' : 'none';
    }

    const statusMsg = document.getElementById('editorStatusMsg');
    if (statusMsg) {
      if (problems.length > 0) {
        statusMsg.innerHTML = `<span style="color:var(--accent-pink);cursor:pointer" title="${problems[0].message}">⚠️ ${problems.length} problema(s) (Ln ${problems[0].line})</span>`;
      } else {
        statusMsg.innerHTML = '<span style="color:var(--accent-teal)">✓ 0 erros de sintaxe</span>';
      }
    }

    window.TermEditorProblems = problems;
  }

  saveCurrent() {
    if (!this.activeFile) return;
    const textarea = document.getElementById('codeTextarea');
    if (!textarea) return;

    if (window.TermVFS) {
      window.TermVFS.writeFile(this.activeFile, textarea.value, 'user');
    }
    this.dirty.delete(this.activeFile);
    this.renderTabs();

    const statusMsg = document.getElementById('editorStatusMsg');
    if (statusMsg) {
      statusMsg.innerHTML = '<span style="color:var(--accent-teal)">✓ Salvo às ' + new Date().toLocaleTimeString() + '</span>';
      setTimeout(() => { if (statusMsg) statusMsg.textContent = ''; }, 3000);
    }

    if (window.updatePreview) {
      window.updatePreview();
    }
  }

  updateLineNumbers() {
    const textarea = document.getElementById('codeTextarea');
    const linesBox = document.getElementById('lineNumbers');
    if (!textarea || !linesBox) return;

    const lineCount = Math.max(1, textarea.value.split('\n').length);
    let numbers = '';
    for (let i = 1; i <= lineCount; i++) {
      numbers += `<div>${i}</div>`;
    }
    linesBox.innerHTML = numbers;

    // sync scroll
    linesBox.scrollTop = textarea.scrollTop;
  }

  updateHighlight() {
    const textarea = document.getElementById('codeTextarea');
    const highlight = document.getElementById('codeHighlight');
    if (!textarea || !highlight) return;

    const code = textarea.value;
    const ext = (this.activeFile || '').split('.').pop();
    highlight.innerHTML = this.simpleHighlight(code, ext) + '\n';
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }

  syncScroll() {
    const textarea = document.getElementById('codeTextarea');
    const linesBox = document.getElementById('lineNumbers');
    const highlight = document.getElementById('codeHighlight');

    if (textarea) {
      if (linesBox) linesBox.scrollTop = textarea.scrollTop;
      if (highlight) {
        highlight.scrollTop = textarea.scrollTop;
        highlight.scrollLeft = textarea.scrollLeft;
      }
      this.syncMinimapScroll();
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // REAL-TIME DYNAMIC MINIMAP
  // ═════════════════════════════════════════════════════════════════
  renderMinimap() {
    const minimap = document.getElementById('editorMinimap');
    const textarea = document.getElementById('codeTextarea');
    if (!minimap || !textarea) return;

    const lines = textarea.value.split('\n');
    const ext = (this.activeFile || '').split('.').pop();

    let barsHtml = '';
    const maxLinesToRender = Math.min(lines.length, 250);

    for (let i = 0; i < maxLinesToRender; i++) {
      const line = lines[i] || '';
      const trimmed = line.trim();
      if (!trimmed) {
        barsHtml += `<div class="minimap-bar" style="width:12%;opacity:0.2" data-line="${i + 1}"></div>`;
        continue;
      }

      const indent = (line.length - trimmed.length);
      const widthPct = Math.min(95, Math.max(15, trimmed.length * 2.2));
      const indentPct = Math.min(40, indent * 3);

      let typeClass = '';
      if (['js', 'ts'].includes(ext)) {
        if (/^(import|export|const|let|var|function|class|return|if|else|for|while|try|catch)/.test(trimmed)) typeClass = 'mm-kw';
        else if (/^(\/\/|\/\*)/.test(trimmed)) typeClass = 'mm-com';
        else if (/['"`]/.test(trimmed)) typeClass = 'mm-str';
      } else if (ext === 'html') {
        if (/^<(!|\/?[a-z0-9]+)/i.test(trimmed)) typeClass = 'mm-tag';
        else if (/^<!--/.test(trimmed)) typeClass = 'mm-com';
        else if (/class=|id=|style=/i.test(trimmed)) typeClass = 'mm-attr';
      } else if (ext === 'css') {
        if (/^(\/\*|@)/.test(trimmed)) typeClass = 'mm-com';
        else if (/:/.test(trimmed)) typeClass = 'mm-str';
        else typeClass = 'mm-kw';
      }

      barsHtml += `<div class="minimap-bar ${typeClass}" style="width:${widthPct}%;margin-left:${indentPct}px" data-line="${i + 1}" title="Linha ${i + 1}: ${this.escapeHtml(trimmed.slice(0, 40))}"></div>`;
    }

    minimap.innerHTML = `
      <div class="minimap-header-tag">
        <span>MAP</span>
        <span>${lines.length}L</span>
      </div>
      <div class="minimap-lines-container" id="minimapLinesContainer">
        ${barsHtml}
        <div class="minimap-viewport-slider" id="minimapSlider"></div>
      </div>
    `;

    this.syncMinimapScroll();
  }

  syncMinimapScroll() {
    const textarea = document.getElementById('codeTextarea');
    const slider = document.getElementById('minimapSlider');
    const linesContainer = document.getElementById('minimapLinesContainer');
    if (!textarea || !slider || !linesContainer) return;

    const scrollHeight = textarea.scrollHeight;
    const clientHeight = textarea.clientHeight;
    const scrollTop = textarea.scrollTop;

    if (scrollHeight <= clientHeight) {
      slider.style.top = '0px';
      slider.style.height = `${Math.min(linesContainer.clientHeight, 40)}px`;
      return;
    }

    const scrollRatio = scrollTop / (scrollHeight - clientHeight);
    const maxSliderTop = Math.max(10, linesContainer.clientHeight - 35);
    const sliderTop = scrollRatio * maxSliderTop;

    const visibleRatio = Math.min(1, clientHeight / scrollHeight);
    const sliderHeight = Math.max(20, visibleRatio * linesContainer.clientHeight);

    slider.style.top = `${sliderTop}px`;
    slider.style.height = `${sliderHeight}px`;
  }

  handleMinimapClick(e) {
    const textarea = document.getElementById('codeTextarea');
    const linesContainer = document.getElementById('minimapLinesContainer');
    if (!textarea || !linesContainer) return;

    const rect = linesContainer.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickRatio = Math.max(0, Math.min(1, clickY / rect.height));

    const targetScroll = clickRatio * (textarea.scrollHeight - textarea.clientHeight);
    textarea.scrollTop = targetScroll;
    this.syncScroll();
  }

  handleTab(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.target;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      this.onCodeInput();
    }
  }

  simpleHighlight(code, ext) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = esc(code);

    if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) {
      html = html.replace(/(['"`])(?:(?=(\\?))\2[\s\S])*?\1/g, '<span class="hl-str">$&</span>');
      html = html.replace(/\b(const|let|var|function|return|if|else|for|while|import|from|export|class|async|await|try|catch|new|this|typeof|instanceof)\b/g, '<span class="hl-kw">$&</span>');
      html = html.replace(/(\/\/[^\n]*)/g, '<span class="hl-com">$&</span>');
    } else if (ext === 'html') {
      html = html.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-com">$&</span>');
      html = html.replace(/(&lt;\/?[a-zA-Z0-9-]+)(\s|&gt;)/g, '<span class="hl-tag">$1</span>$2');
      html = html.replace(/([a-zA-Z-]+)=(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="hl-attr">$1</span>=<span class="hl-str">$2</span>');
    } else if (ext === 'css') {
      html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-com">$&</span>');
      html = html.replace(/([a-zA-Z-]+)\s*:/g, '<span class="hl-kw">$1</span>:');
      html = html.replace(/(#[a-fA-F0-9]{3,6}|rgba?\(.*?\))/g, '<span class="hl-str">$&</span>');
    } else if (ext === 'json') {
      html = html.replace(/(&quot;.*?&quot;)\s*:/g, '<span class="hl-kw">$1</span>:');
      html = html.replace(/:\s*(&quot;.*?&quot;)/g, ': <span class="hl-str">$1</span>');
      html = html.replace(/\b(true|false|null)\b/g, '<span class="hl-attr">$&</span>');
    }

    return html;
  }

  // ═════════════════════════════════════════════════════════════════
  // REAL-TIME LIVE CODE STREAMING ENGINE (ADICIONAR CÓDIGO AO VIVO)
  // ═════════════════════════════════════════════════════════════════
  async streamCodeIntoEditor(filePath, codeToStream, options = {}) {
    const {
      mode = 'replace', // 'replace' | 'append' | 'insertAtCursor'
      speedMs = 18,     // delay between chunks
      chunkSize = 3,    // characters per step
      onProgress = null,
      onComplete = null
    } = options;

    if (this.isStreaming) {
      this.stopStream(true);
    }

    this.isStreaming = true;
    this.streamCancelRequested = false;
    this.streamFinishImmediately = false;

    // Open the target file first
    this.openFile(filePath);

    const textarea = document.getElementById('codeTextarea');
    if (!textarea) {
      this.isStreaming = false;
      return;
    }

    let initialContent = '';
    let targetFullContent = '';

    if (mode === 'replace') {
      initialContent = '';
      targetFullContent = codeToStream;
    } else if (mode === 'append') {
      initialContent = textarea.value + (textarea.value ? '\n\n' : '');
      targetFullContent = initialContent + codeToStream;
    } else if (mode === 'insertAtCursor') {
      const pos = textarea.selectionStart || textarea.value.length;
      initialContent = textarea.value.slice(0, pos);
      const suffix = textarea.value.slice(pos);
      targetFullContent = initialContent + codeToStream + suffix;
    }

    textarea.value = initialContent;
    this.updateLineNumbers();
    this.updateHighlight();
    this.renderMinimap();

    // Show floating stream banner
    this.showStreamBanner(filePath, 0);

    const totalChars = codeToStream.length;
    let currentIdx = 0;

    const streamStep = () => {
      if (this.streamCancelRequested) {
        this.isStreaming = false;
        this.hideStreamBanner();
        return;
      }

      if (this.streamFinishImmediately || currentIdx >= totalChars) {
        // Complete the code immediately
        textarea.value = (mode === 'append' || mode === 'insertAtCursor') ? targetFullContent : codeToStream;
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        this.onCodeInput();
        this.saveCurrent();
        this.isStreaming = false;
        this.hideStreamBanner();
        
        if (window.updatePreview) window.updatePreview();
        if (onComplete) onComplete();
        return;
      }

      currentIdx = Math.min(totalChars, currentIdx + chunkSize);
      const insertedChunk = codeToStream.slice(0, currentIdx);

      if (mode === 'replace') {
        textarea.value = insertedChunk;
      } else if (mode === 'append') {
        textarea.value = initialContent + insertedChunk;
      } else {
        textarea.value = initialContent + insertedChunk;
      }

      // Keep cursor and view pinned to bottom of streamed text
      textarea.scrollTop = textarea.scrollHeight;
      this.syncScroll();
      this.updateLineNumbers();
      this.updateHighlight();

      const progressPct = Math.round((currentIdx / totalChars) * 100);
      this.updateStreamBannerProgress(progressPct, currentIdx, totalChars);

      if (currentIdx % (chunkSize * 6) === 0) {
        this.renderMinimap();
        if (window.updatePreview) {
          window.updatePreview();
        }
      }

      if (onProgress) onProgress(progressPct);

      this.streamTimer = setTimeout(streamStep, speedMs);
    };

    streamStep();
  }

  showStreamBanner(filePath, pct) {
    let banner = document.getElementById('editorStreamBanner');
    if (!banner) {
      const stage = document.querySelector('.editor-stage');
      if (stage) {
        banner = document.createElement('div');
        banner.id = 'editorStreamBanner';
        banner.className = 'editor-stream-banner';
        stage.appendChild(banner);
      }
    }

    if (banner) {
      banner.innerHTML = `
        <span class="stream-pulse-dot"></span>
        <span><b>Inserindo ao vivo:</b> <span id="streamTargetFile" style="color:var(--accent-cyan)">${filePath}</span> (<span id="streamPctVal">${pct}%</span>)</span>
        <div style="display:flex;gap:4px;margin-left:8px">
          <button class="btn btn-sm btn-primary" style="padding:2px 8px;font-size:10.5px" onclick="TermEditorInst.stopStream(true)">⚡ Concluir Agora</button>
          <button class="btn btn-sm" style="padding:2px 8px;font-size:10.5px" onclick="TermEditorInst.stopStream(false)">✕ Cancelar</button>
        </div>
      `;
      banner.classList.remove('hidden');
    }
  }

  updateStreamBannerProgress(pct, currentChars, totalChars) {
    const val = document.getElementById('streamPctVal');
    if (val) val.textContent = `${pct}% (${currentChars}/${totalChars} chars)`;
  }

  hideStreamBanner() {
    const banner = document.getElementById('editorStreamBanner');
    if (banner) banner.classList.add('hidden');
  }

  stopStream(finishImmediately = false) {
    if (!this.isStreaming) return;
    clearTimeout(this.streamTimer);
    if (finishImmediately) {
      this.streamFinishImmediately = true;
    } else {
      this.streamCancelRequested = true;
      this.isStreaming = false;
      this.hideStreamBanner();
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // LIVE CODE INSERTION MODAL & PRESET TEMPLATES
  // ═════════════════════════════════════════════════════════════════
  openLiveCodeModal() {
    let modal = document.getElementById('liveCodeInsertModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'liveCodeInsertModal';
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    const activeFile = this.activeFile || 'index.html';

    modal.innerHTML = `
      <div class="modal-dialog" style="max-width:680px">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:8px">
            <span data-icon="sparkles" data-icon-size="18" style="color:var(--accent-cyan)"></span>
            <b style="font-size:14px">Adicionar Código em Tempo Real (Live Stream)</b>
          </div>
          <button class="btn-close" onclick="TermEditorInst.closeLiveCodeModal()">×</button>
        </div>

        <div class="modal-body" style="padding:14px;display:flex;flex-direction:column;gap:12px">
          <div style="font-size:12px;color:var(--text-muted)">
            Transmita código diretamente no editor com visualização caractere por caractere, auto-scroll, destaque de sintaxe e atualização imediata do Live Preview.
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-dim);display:block;margin-bottom:4px">ARQUIVO DE DESTINO</label>
              <select id="liveTargetFileSelect" class="ide-input-small" style="width:100%">
                ${(window.TermVFS ? window.TermVFS.listFiles() : ['index.html', 'style.css', 'main.js']).map(f => `
                  <option value="${f}" ${f === activeFile ? 'selected' : ''}>${f}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:var(--text-dim);display:block;margin-bottom:4px">VELOCIDADE DE DIGITAÇÃO</label>
              <select id="liveStreamSpeedSelect" class="ide-input-small" style="width:100%">
                <option value="ultra">⚡ Ultra Rápida (5x)</option>
                <option value="fast" selected>🚀 Rápida (2x)</option>
                <option value="normal">⌨️ Realista (1x)</option>
                <option value="instant">⏩ Instantâneo</option>
              </select>
            </div>
          </div>

          <div>
            <label style="font-size:11px;font-weight:700;color:var(--text-dim);display:block;margin-bottom:6px">MODELOS PRONTOS PARA TRANSMISSÃO</label>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(190px, 1fr));gap:6px">
              <button class="btn" style="text-align:left;padding:8px;font-size:11.5px" onclick="TermEditorInst.loadPresetSnippet('canvas_game')">
                <b>🎮 Jogo Canvas Interativo</b>
                <div style="font-size:10px;color:var(--text-dim)">Jogo com controles e pontuação</div>
              </button>
              <button class="btn" style="text-align:left;padding:8px;font-size:11.5px" onclick="TermEditorInst.loadPresetSnippet('audio_synth')">
                <b>🎵 Sintetizador Web Audio</b>
                <div style="font-size:10px;color:var(--text-dim)">Teclado sonoro em tempo real</div>
              </button>
              <button class="btn" style="text-align:left;padding:8px;font-size:11.5px" onclick="TermEditorInst.loadPresetSnippet('dashboard_card')">
                <b>📊 Dashboard com Gráficos</b>
                <div style="font-size:10px;color:var(--text-dim)">Cards métricos e estatísticas</div>
              </button>
              <button class="btn" style="text-align:left;padding:8px;font-size:11.5px" onclick="TermEditorInst.loadPresetSnippet('reactive_form')">
                <b>✨ Formulário Reativo</b>
                <div style="font-size:10px;color:var(--text-dim)">Validação e preview ao vivo</div>
              </button>
            </div>
          </div>

          <div>
            <label style="font-size:11px;font-weight:700;color:var(--text-dim);display:block;margin-bottom:4px">OU DIGITE / COLE O CÓDIGO PERSONALIZADO</label>
            <textarea id="liveCodeCustomInput" class="ide-input-small" style="width:100%;height:130px;font-family:var(--font-mono);font-size:12px;line-height:1.5;resize:vertical" placeholder="Cole seu código HTML, CSS ou JavaScript aqui..."></textarea>
          </div>
        </div>

        <div class="modal-footer" style="padding:10px 14px;display:flex;justify-content:space-between">
          <div style="font-size:11px;color:var(--text-dim);display:flex;align-items:center;gap:6px">
            <span class="stream-pulse-dot"></span> Live Typing Engine
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn" onclick="TermEditorInst.closeLiveCodeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="TermEditorInst.startStreamingFromModal()">▶ Transmitir ao Vivo para o Editor</button>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    if (window.renderIconsInDom) window.renderIconsInDom();
  }

  closeLiveCodeModal() {
    const modal = document.getElementById('liveCodeInsertModal');
    if (modal) modal.classList.add('hidden');
  }

  loadPresetSnippet(presetKey) {
    const textarea = document.getElementById('liveCodeCustomInput');
    const targetSelect = document.getElementById('liveTargetFileSelect');
    if (!textarea) return;

    if (presetKey === 'canvas_game') {
      if (targetSelect) targetSelect.value = 'main.js';
      textarea.value = `// 🎮 Mini Jogo Canvas Interativo (Tempo Real)
const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
canvas.style.cssText = 'border:2px solid #38bdf8;border-radius:8px;background:#0f172a;display:block;margin:10px auto;box-shadow:0 0 15px rgba(56,189,248,0.3)';
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d');
let player = { x: 180, y: 250, size: 20, speed: 5, score: 0 };
let targets = [];

function spawnTarget() {
  targets.push({ x: Math.random() * 360, y: 0, size: 15, speed: 2 + Math.random() * 3 });
}

setInterval(spawnTarget, 900);

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' && player.x > 0) player.x -= player.speed;
  if (e.key === 'ArrowRight' && player.x < 380) player.x += player.speed;
});

function gameLoop() {
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Player
  ctx.fillStyle = '#38bdf8';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.fillRect(player.x, player.y, player.size, player.size);

  // Targets
  ctx.fillStyle = '#f43f5e';
  ctx.shadowColor = '#f43f5e';
  targets.forEach((t, i) => {
    t.y += t.speed;
    ctx.fillRect(t.x, t.y, t.size, t.size);

    if (Math.hypot(player.x - t.x, player.y - t.y) < 20) {
      player.score += 10;
      targets.splice(i, 1);
    }
  });

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px monospace';
  ctx.fillText('Score: ' + player.score + ' | Use Setas ← →', 10, 20);

  requestAnimationFrame(gameLoop);
}
gameLoop();
console.log('🎮 Jogo iniciado com sucesso!');`;
    } else if (presetKey === 'audio_synth') {
      if (targetSelect) targetSelect.value = 'main.js';
      textarea.value = `// 🎵 Web Audio Synthesizer (Tempo Real)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playNote(freq, type = 'sawtooth') {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.8);
}

const synthContainer = document.createElement('div');
synthContainer.style.cssText = 'display:flex;gap:6px;justify-content:center;margin:15px 0;padding:10px;background:#0d1424;border-radius:8px';
const notes = [
  { n: 'C4', f: 261.63 },
  { n: 'D4', f: 293.66 },
  { n: 'E4', f: 329.63 },
  { n: 'F4', f: 349.23 },
  { n: 'G4', f: 392.00 },
  { n: 'A4', f: 440.00 },
  { n: 'B4', f: 493.88 },
  { n: 'C5', f: 523.25 }
];

notes.forEach(note => {
  const btn = document.createElement('button');
  btn.textContent = note.n;
  btn.style.cssText = 'padding:12px 16px;font-weight:bold;background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:4px;cursor:pointer;transition:all 0.1s';
  btn.onmousedown = () => {
    btn.style.background = '#38bdf8';
    btn.style.color = '#000';
    playNote(note.f);
  };
  btn.onmouseup = () => {
    btn.style.background = '#1e293b';
    btn.style.color = '#38bdf8';
  };
  synthContainer.appendChild(btn);
});

document.body.appendChild(synthContainer);
console.log('🎵 Sintetizador ativo!');`;
    } else if (presetKey === 'dashboard_card') {
      if (targetSelect) targetSelect.value = 'index.html';
      textarea.value = `<!-- 📊 Dashboard de Métricas em Tempo Real -->
<div class="metrics-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;padding:16px">
  <div style="background:#0d1424;border:1px solid #1e293b;border-radius:8px;padding:14px;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700">Requisições API / seg</div>
    <div style="font-size:24px;font-weight:800;color:#38bdf8;margin:6px 0">1,482 <span style="font-size:12px;color:#10b981">↑ +14%</span></div>
    <div style="height:4px;background:#1e293b;border-radius:2px;overflow:hidden">
      <div style="width:78%;height:100%;background:#38bdf8"></div>
    </div>
  </div>

  <div style="background:#0d1424;border:1px solid #1e293b;border-radius:8px;padding:14px;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700">Latência Média</div>
    <div style="font-size:24px;font-weight:800;color:#10b981;margin:6px 0">18.4 ms <span style="font-size:12px;color:#10b981">● Ideal</span></div>
    <div style="height:4px;background:#1e293b;border-radius:2px;overflow:hidden">
      <div style="width:92%;height:100%;background:#10b981"></div>
    </div>
  </div>

  <div style="background:#0d1424;border:1px solid #1e293b;border-radius:8px;padding:14px;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700">Conexões WebSocket</div>
    <div style="font-size:24px;font-weight:800;color:#c084fc;margin:6px 0">842 <span style="font-size:12px;color:#c084fc">● Ao Vivo</span></div>
    <div style="height:4px;background:#1e293b;border-radius:2px;overflow:hidden">
      <div style="width:65%;height:100%;background:#c084fc"></div>
    </div>
  </div>
</div>`;
    } else if (presetKey === 'reactive_form') {
      if (targetSelect) targetSelect.value = 'index.html';
      textarea.value = `<!-- ✨ Formulário Reativo Interativo -->
<div style="max-width:420px;margin:20px auto;background:#0d1424;border:1px solid #1e293b;border-radius:8px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,0.5)">
  <h3 style="margin-top:0;color:#38bdf8;font-size:16px">Configuração de Perfil</h3>
  <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
    <div>
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Nome de Usuário</label>
      <input type="text" id="userInput" placeholder="@dev_master" style="width:100%;padding:8px 10px;background:#162032;border:1px solid #334155;border-radius:4px;color:#fff;outline:none" oninput="document.getElementById('previewBadge').textContent = this.value || '@anônimo'">
    </div>
    <div style="padding:10px;background:#111827;border-radius:4px;font-size:12px;color:#94a3b8">
      Preview do Card: <span id="previewBadge" style="color:#10b981;font-weight:bold">@dev_master</span>
    </div>
    <button style="padding:10px;background:#38bdf8;color:#000;border:none;border-radius:4px;font-weight:bold;cursor:pointer" onclick="alert('Salvo com sucesso!')">Salvar Configurações</button>
  </div>
</div>`;
    }
  }

  startStreamingFromModal() {
    const targetFile = document.getElementById('liveTargetFileSelect')?.value || 'index.html';
    const speed = document.getElementById('liveStreamSpeedSelect')?.value || 'fast';
    const customCode = document.getElementById('liveCodeCustomInput')?.value || '';

    if (!customCode.trim()) {
      alert('Por favor, selecione um modelo ou insira o código para transmitir.');
      return;
    }

    this.closeLiveCodeModal();

    let speedMs = 18;
    let chunkSize = 3;

    if (speed === 'ultra') {
      speedMs = 8;
      chunkSize = 8;
    } else if (speed === 'fast') {
      speedMs = 16;
      chunkSize = 4;
    } else if (speed === 'normal') {
      speedMs = 35;
      chunkSize = 2;
    } else if (speed === 'instant') {
      speedMs = 0;
      chunkSize = 999999;
    }

    this.streamCodeIntoEditor(targetFile, customCode, {
      mode: 'replace',
      speedMs,
      chunkSize
    });
  }

  gotoLine() {
    const ta = document.getElementById('codeTextarea');
    if (!ta) return;
    const n = parseInt(window.prompt('Ir para a linha (número):', '1'), 10);
    if (!n || n < 1) return;
    const lines = ta.value.split('\n');
    if (n > lines.length) return window.alert('Arquivo tem ' + lines.length + ' linhas.');
    let pos = 0;
    for (let i = 0; i < n - 1; i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 18;
    ta.scrollTop = Math.max(0, (n - 1) * lineHeight - ta.clientHeight / 2);
  }

  replaceAll() {
    const ta = document.getElementById('codeTextarea');
    if (!ta) return;
    const find = window.prompt('Substituir - texto a localizar:');
    if (find === null || find === '') return;
    const rep = window.prompt('Substituir "' + find + '" por:');
    if (rep === null) return;
    if (!ta.value.includes(find)) return window.alert('Texto não encontrado.');
    const total = ta.value.split(find).length - 1;
    if (!window.confirm('Substituir ' + total + ' ocorrência(s) de "' + find + '"?')) return;
    ta.value = ta.value.split(find).join(rep);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  toggleWrap() {
    const ta = document.getElementById('codeTextarea');
    if (!ta) return;
    const wrapped = ta.style.whiteSpace === 'pre-wrap';
    ta.style.whiteSpace = wrapped ? 'pre' : 'pre-wrap';
    ta.style.overflowX = wrapped ? 'auto' : 'hidden';
    try { localStorage.setItem('termchat_wrap', wrapped ? '0' : '1'); } catch (err) {}
    if (this.onWrapToggle) this.onWrapToggle(!wrapped);
  }

  applySavedWrap() {
    const ta = document.getElementById('codeTextarea');
    if (!ta) return;
    try {
      if (localStorage.getItem('termchat_wrap') === '1') {
        ta.style.whiteSpace = 'pre-wrap';
        ta.style.overflowX = 'hidden';
      }
    } catch (err) {}
  }

  toggleSearch() {
    const box = document.getElementById('editorSearchBox');
    if (box) {
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) {
        const inp = document.getElementById('editorFindInput');
        if (inp) { inp.focus(); inp.select(); }
      }
    }
  }

  findNext() {
    const inp = document.getElementById('editorFindInput');
    const textarea = document.getElementById('codeTextarea');
    if (!inp || !textarea || !inp.value) return;

    const query = inp.value;
    const text = textarea.value;
    const startPos = textarea.selectionEnd || 0;
    let nextIdx = text.toLowerCase().indexOf(query.toLowerCase(), startPos);

    if (nextIdx === -1) {
      nextIdx = text.toLowerCase().indexOf(query.toLowerCase(), 0);
    }

    if (nextIdx !== -1) {
      textarea.focus();
      textarea.setSelectionRange(nextIdx, nextIdx + query.length);
      this.syncScroll();
    }
  }

  replaceNext() {
    const findInp = document.getElementById('editorFindInput');
    const replaceInp = document.getElementById('editorReplaceInput');
    const textarea = document.getElementById('codeTextarea');
    if (!findInp || !replaceInp || !textarea || !findInp.value) return;

    const findStr = findInp.value;
    const replaceStr = replaceInp.value;
    const selStart = textarea.selectionStart;
    const selEnd = textarea.selectionEnd;
    const selected = textarea.value.substring(selStart, selEnd);

    if (selected.toLowerCase() === findStr.toLowerCase()) {
      textarea.value = textarea.value.substring(0, selStart) + replaceStr + textarea.value.substring(selEnd);
      textarea.selectionStart = textarea.selectionEnd = selStart + replaceStr.length;
      this.onCodeInput();
    }
    this.findNext();
  }

  // --- Diff Inspector UI ---
  showDiff(filePath, oldContent, newContent, reason = 'Modificação sugerida pelo Agente de IA') {
    this.pendingDiff = { filePath, oldContent, newContent, reason };
    const diffContainer = document.getElementById('diffModal');
    if (!diffContainer || !window.TermVFS) return;

    const lines = window.TermVFS.diff(oldContent, newContent);
    const diffHtml = lines.map(item => {
      const typeClass = item.type === 'add' ? 'diff-add' : item.type === 'del' ? 'diff-del' : 'diff-same';
      const prefix = item.type === 'add' ? '+ ' : item.type === 'del' ? '- ' : '  ';
      return `<div class="diff-line ${typeClass}"><span class="diff-num">${item.lineNum}</span><span class="diff-code">${prefix}${this.escapeHtml(item.line)}</span></div>`;
    }).join('');

    diffContainer.innerHTML = `
      <div class="diff-dialog">
        <div class="diff-header">
          <div class="diff-title">
            <span>⚡ Diff Inspector: <b>${filePath}</b></span>
            <small>${reason}</small>
          </div>
          <button class="btn-close" onclick="TermEditorInst.closeDiff()">×</button>
        </div>
        <div class="diff-body">
          ${diffHtml}
        </div>
        <div class="diff-footer">
          <button class="btn" onclick="TermEditorInst.rejectDiff()">✕ Rejeitar</button>
          <button class="btn btn-primary" onclick="TermEditorInst.acceptDiff()">✓ Aceitar Alterações</button>
          <button class="btn btn-secondary" onclick="TermEditorInst.streamDiffLive()">⚡ Transmitir ao Vivo</button>
        </div>
      </div>
    `;
    diffContainer.classList.remove('hidden');
  }

  streamDiffLive() {
    if (!this.pendingDiff) return;
    const { filePath, newContent } = this.pendingDiff;
    this.closeDiff();
    this.streamCodeIntoEditor(filePath, newContent, { mode: 'replace', speedMs: 14, chunkSize: 4 });
  }

  acceptDiff() {
    if (!this.pendingDiff) return;
    const { filePath, newContent } = this.pendingDiff;
    if (window.TermVFS) {
      window.TermVFS.writeFile(filePath, newContent, 'AI-Agent');
    }
    this.openFile(filePath);
    this.closeDiff();
    if (window.TermLogs) {
      window.TermLogs.add('IA', `Diff aceito no arquivo ${filePath}`, 'success');
    }
    if (window.updatePreview) window.updatePreview();
  }

  rejectDiff() {
    if (this.pendingDiff && window.TermLogs) {
      window.TermLogs.add('IA', `Diff rejeitado no arquivo ${this.pendingDiff.filePath}`, 'warning');
    }
    this.closeDiff();
  }

  closeDiff() {
    this.pendingDiff = null;
    const diffContainer = document.getElementById('diffModal');
    if (diffContainer) diffContainer.classList.add('hidden');
  }

  escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

window.TermEditorInst = new TermEditor();
