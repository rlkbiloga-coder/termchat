/**
 * TermChat — Background Linter WebWorker with Acorn Parser
 * Runs robust syntax analysis off the main thread using Acorn parser.
 */

try {
  importScripts('https://cdnjs.cloudflare.com/ajax/libs/acorn/8.11.0/acorn.min.js');
} catch (e) {
  // Fallback if CDN is unreachable
}

self.onmessage = function(e) {
  const { code, activeFile } = e.data;
  const ext = (activeFile || '').split('.').pop().toLowerCase();
  const problems = [];

  if (['js', 'jsx', 'ts', 'tsx', 'mjs'].includes(ext)) {
    if (typeof acorn !== 'undefined') {
      try {
        acorn.parse(code, { ecmaVersion: 'latest', locations: true, sourceType: 'module' });
      } catch (err) {
        problems.push({
          file: activeFile,
          line: err.loc ? err.loc.line : 1,
          column: err.loc ? err.loc.column : 0,
          message: err.message.replace(/\s*\(\d+:\d+\)$/, ''),
          severity: 'error'
        });
      }
    } else {
      try {
        new Function(code);
      } catch (err) {
        let line = 1;
        const match = err.stack ? err.stack.match(/:(\d+):\d+/) : null;
        if (match && match[1]) {
          line = parseInt(match[1], 10);
        }
        problems.push({
          file: activeFile,
          line,
          column: 0,
          message: err.message,
          severity: 'error'
        });
      }
    }
  } else if (ext === 'json') {
    try {
      JSON.parse(code);
    } catch (err) {
      const match = err.message.match(/position\s+(\d+)/i);
      let line = 1;
      if (match) {
        const pos = parseInt(match[1], 10);
        line = code.slice(0, pos).split('\n').length;
      }
      problems.push({
        file: activeFile,
        line,
        column: 0,
        message: `Erro JSON: ${err.message}`,
        severity: 'error'
      });
    }
  }

  self.postMessage({ problems });
};
