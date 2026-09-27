"use strict";

/**
 * TermChat Code Editor Engine
 * Multi-tab code editor with syntax highlighting, line numbers, search/replace & diff inspector.
 */
class TermEditor {
  constructor() {
    this.openTabs = ['index.html', 'style.css', 'main.js'];
    this.activeFile = 'index.html';
    this.dirty = new Set();
    this.pendingDiff = null;

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
          <span class="tab-close" onclick="event.stopPropagation(); TermEditorInst.closeTab('${path}')">×</span>
        </div>
      `;
    }).join('');
  }

  getFileIcon(ext) {
    const map = {
      html: '🌐',
      css: '🎨',
      js: '⚡',
      ts: '📘',
      json: '📦',
      md: '📝',
      py: '🐍',
      sh: '💻',
      sql: '🗄️'
    };
    return map[ext] || '📄';
  }

  openFile(path) {
    if (!path) return;
    if (!this.openTabs.includes(path)) {
      this.openTabs.push(path);
    }
    this.activeFile = path;
    this.renderTabs();

    const file = window.TermVFS.getFile(path);
    const textarea = document.getElementById('codeTextarea');
    const highlight = document.getElementById('codeHighlight');
    const pathLabel = document.getElementById('editorFilePath');
    const extLabel = document.getElementById('editorFileExt');

    if (pathLabel) pathLabel.textContent = path;
    if (extLabel) extLabel.textContent = (path.split('.').pop() || 'txt').toUpperCase();

    if (textarea) {
      textarea.value = file ? file.content : '';
      this.updateLineNumbers();
      this.updateHighlight();
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
    }
  }

  onCodeInput() {
    const textarea = document.getElementById('codeTextarea');
    if (!textarea || !this.activeFile) return;

    this.dirty.add(this.activeFile);
    this.renderTabs();
    this.updateLineNumbers();
    this.updateHighlight();

    // Auto-save debounce
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveCurrent();
    }, 1200);
  }

  saveCurrent() {
    if (!this.activeFile) return;
    const textarea = document.getElementById('codeTextarea');
    if (!textarea) return;

    window.TermVFS.writeFile(this.activeFile, textarea.value, 'user');
    this.dirty.delete(this.activeFile);
    this.renderTabs();

    const statusMsg = document.getElementById('editorStatusMsg');
    if (statusMsg) {
      statusMsg.textContent = 'Salvo às ' + new Date().toLocaleTimeString();
      setTimeout(() => { if (statusMsg) statusMsg.textContent = ''; }, 3000);
    }
  }

  updateLineNumbers() {
    const textarea = document.getElementById('codeTextarea');
    const linesBox = document.getElementById('lineNumbers');
    if (!textarea || !linesBox) return;

    const lineCount = textarea.value.split('\n').length;
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
    }
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

    if (['js', 'ts'].includes(ext)) {
      // strings
      html = html.replace(/(['"`])(?:(?=(\\?))\2[\s\S])*?\1/g, '<span class="hl-str">$&</span>');
      // keywords
      html = html.replace(/\b(const|let|var|function|return|if|else|for|while|import|from|export|class|async|await|try|catch|new|this)\b/g, '<span class="hl-kw">$&</span>');
      // comments
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

  // --- Diff Inspector UI (Section 16) ---
  showDiff(filePath, oldContent, newContent, reason = 'Modificação sugerida pelo Agente de IA') {
    this.pendingDiff = { filePath, oldContent, newContent, reason };
    const diffContainer = document.getElementById('diffModal');
    if (!diffContainer) return;

    const lines = TermVFS.diff(oldContent, newContent);
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
        </div>
      </div>
    `;
    diffContainer.classList.remove('hidden');
  }

  acceptDiff() {
    if (!this.pendingDiff) return;
    const { filePath, newContent } = this.pendingDiff;
    window.TermVFS.writeFile(filePath, newContent, 'AI-Agent');
    this.openFile(filePath);
    this.closeDiff();
    if (window.TermLogs) {
      window.TermLogs.add('IA', `Diff aceito no arquivo ${filePath}`, 'success');
    }
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
