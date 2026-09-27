"use strict";

/**
 * TermChat Observability & Real-time Logs Manager
 */
class TermLogsManager {
  constructor() {
    this.logs = [];
    this.maxLogs = 300;
  }

  add(category, message, level = 'info') {
    const entry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      category,
      message,
      level
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.render();
  }

  render() {
    const container = document.getElementById('logsContainer');
    if (!container) return;

    const filterCat = (document.getElementById('logsCatFilter') || {}).value || 'all';
    const filtered = this.logs.filter(l => filterCat === 'all' || l.category.toLowerCase() === filterCat.toLowerCase());

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-hint">Nenhum evento registrado nesta categoria.</div>';
      return;
    }

    container.innerHTML = filtered.map(l => {
      const levelClass = l.level === 'error' ? 'log-err' : l.level === 'warning' ? 'log-warn' : l.level === 'success' ? 'log-succ' : 'log-info';
      return `
        <div class="log-entry ${levelClass}">
          <span class="log-time">[${l.timestamp}]</span>
          <span class="log-cat">${l.category}</span>
          <span class="log-msg">${this.escape(l.message)}</span>
        </div>
      `;
    }).join('');
  }

  clear() {
    this.logs = [];
    this.render();
  }

  exportLogs() {
    const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `termchat-logs-${Date.now()}.json`;
    a.click();
  }

  escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
}

window.TermLogs = new TermLogsManager();
