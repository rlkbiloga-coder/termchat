/**
 * TermChat — Cloud SQL PostgreSQL Database Studio
 * Project: original-mission-k5xj8
 * Instance: ai-studio-7a30a4e2 (Region: us-west2)
 * Provides SQL query execution, schema visualization, table inspection,
 * and database seeding.
 */

(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class TermCloudSqlStudio {
    constructor() {
      this.config = null;
      this.tables = [];
      this.queryHistory = [];
    }

    async init() {
      await this.loadStatus();
      await this.loadTables();
    }

    async loadStatus() {
      try {
        const res = await fetch('/api/cloudsql/status');
        const data = await res.json();
        if (data.ok) {
          this.config = data.config;
          this.renderStatusBanner();
        }
      } catch (err) {
        console.warn('Cloud SQL status error:', err);
      }
    }

    renderStatusBanner() {
      const banner = $('cloudSqlStatusBanner');
      if (!banner || !this.config) return;

      const iconSvg = window.TermIcons ? window.TermIcons.get('cloudsql', 24) : '';

      banner.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:6px;padding:10px 12px;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <span>${iconSvg}</span>
            <div>
              <div style="display:flex;align-items:center;gap:6px">
                <b style="font-size:13px;color:#fff">${esc(this.config.instanceId)}</b>
                <span class="status-indicator status-connected">● ${esc(this.config.status)}</span>
                <span class="badge" style="background:rgba(56,189,248,0.15);color:var(--accent-cyan);font-size:9.5px">${esc(this.config.engine)}</span>
              </div>
              <div style="font-size:10.5px;color:var(--text-dim);margin-top:2px">
                GCP Project: <b style="color:#fff">${esc(this.config.projectId)}</b> | Região: <b>${esc(this.config.region)}</b> | DB: <b style="color:var(--accent-cyan)">${esc(this.config.database)}</b>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost" onclick="TermCloudSql.seedDatabase()">Popular Dados</button>
            <button class="btn btn-sm btn-primary" onclick="TermCloudSql.loadTables()">Atualizar</button>
          </div>
        </div>
      `;
    }

    async loadTables() {
      const listEl = $('cloudSqlTablesList');
      if (!listEl) return;

      try {
        const res = await fetch('/api/cloudsql/tables');
        const data = await res.json();
        this.tables = data.tables || [];

        const tableIcon = window.TermIcons ? window.TermIcons.get('database', 14) : '';

        listEl.innerHTML = this.tables.map(t => `
          <div class="cloudsql-table-card" onclick="TermCloudSql.setQuickQuery('SELECT * FROM ${t.name} LIMIT 20')">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div style="display:flex;align-items:center;gap:5px">
                ${tableIcon}
                <b style="font-size:12px;color:var(--accent-cyan)">${esc(t.name)}</b>
              </div>
              <span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text-dim);font-size:10px">${t.rowCount} registros</span>
            </div>
            <div style="font-size:10px;color:var(--text-dim);margin-top:4px">Colunas: ${t.columns.join(', ')}</div>
          </div>
        `).join('') || '<div style="color:var(--text-dim);padding:10px">Nenhuma tabela carregada.</div>';
      } catch (err) {
        listEl.innerHTML = `<div style="color:var(--accent-pink)">Erro: ${err.message}</div>`;
      }
    }

    setQuickQuery(sql) {
      const inp = $('cloudSqlQueryInput');
      if (inp) {
        inp.value = sql;
        this.executeQuery();
      }
    }

    async executeQuery() {
      const inp = $('cloudSqlQueryInput');
      const resultsContainer = $('cloudSqlQueryResults');
      if (!inp || !resultsContainer) return;

      const sql = inp.value.trim();
      if (!sql) return;

      resultsContainer.innerHTML = '<div style="color:var(--text-dim);padding:12px">Executando query no Cloud SQL PostgreSQL...</div>';

      try {
        const res = await fetch('/api/cloudsql/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql })
        });
        const data = await res.json();

        if (!data.ok) {
          resultsContainer.innerHTML = `<div style="color:var(--accent-pink);padding:12px">❌ Erro na query: ${esc(data.error)}</div>`;
          return;
        }

        const rows = data.rows || [];
        if (rows.length === 0) {
          resultsContainer.innerHTML = `<div style="color:var(--accent-teal);padding:12px">✓ Query executada com sucesso. 0 linhas retornadas.</div>`;
          return;
        }

        const columns = Object.keys(rows[0]);
        resultsContainer.innerHTML = `
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
            Linhas retornadas: <b style="color:var(--accent-teal)">${rows.length}</b> | Executado em: ${new Date(data.executedAt).toLocaleTimeString()}
          </div>
          <div style="overflow-x:auto;max-height:220px;border:1px solid var(--border);border-radius:6px">
            <table class="cloudsql-result-table">
              <thead>
                <tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>${columns.map(c => `<td>${esc(typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])}</td>`).join('')}</tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

        if (window.TermLogs) {
          window.TermLogs.add('CloudSQL', `Query executada: [${sql}]`, 'info');
        }
      } catch (err) {
        resultsContainer.innerHTML = `<div style="color:var(--accent-pink);padding:12px">Falha de conexão: ${err.message}</div>`;
      }
    }

    async seedDatabase() {
      const res = await fetch('/api/cloudsql/seed', { method: 'POST' });
      const data = await res.json();
      alert(data.message);
      this.loadTables();
      this.setQuickQuery('SELECT * FROM users');
    }

    // Modal UI Management
    openCloudSqlModal() {
      const modal = $('cloudSqlModal');
      if (modal) modal.classList.remove('hidden');
      this.init();
    }

    closeCloudSqlModal() {
      const modal = $('cloudSqlModal');
      if (modal) modal.classList.add('hidden');
    }
  }

  const cloudSqlInst = new TermCloudSqlStudio();
  window.TermCloudSql = cloudSqlInst;
})();
