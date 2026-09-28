/**
 * Testes unitários do TermChat (Node puro — node:test)
 * Rodar: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const ROOT = new URL("..", import.meta.url);

// ── manifesto de plugins (esquema v2.0) ──────────────────
const manifest = JSON.parse(readFileSync(new URL("plugins.json", ROOT), "utf8"));

test("plugins.json é um manifesto válido do TermChat", () => {
  assert.ok(manifest.name.startsWith("TermChat"), "nome do manifesto inesperado: " + manifest.name);
  assert.ok(Array.isArray(manifest.plugins));
  assert.ok(manifest.plugins.length >= 200, "catálogo encolheu demais: " + manifest.plugins.length);
});

test("todo plugin tem id único, name, desc e cat não-vazia", () => {
  const ids = new Set();
  for (const p of manifest.plugins) {
    assert.ok(p.id && p.name && p.desc, `plugin incompleto: ${JSON.stringify(p).slice(0, 80)}`);
    assert.ok(!ids.has(p.id), `id duplicado: ${p.id}`);
    ids.add(p.id);
    assert.ok(typeof p.cat === "string" && p.cat.length > 0, `cat ausente em ${p.id}`);
  }
});

test("permissões de plugins são apenas do conjunto permitido", () => {
  const allowed = new Set(["geolocation", "notifications", "clipboard"]);
  for (const p of manifest.plugins) {
    for (const perm of p.perms || []) {
      assert.ok(allowed.has(perm), `permissão fora da allowlist em ${p.id}: ${perm}`);
    }
  }
});

// ── catálogo de modelos (data/models.json) ───────────────
test("data/models.json é um catálogo válido de provedores gratuitos", () => {
  const modelsData = JSON.parse(readFileSync(new URL("data/models.json", ROOT), "utf8"));
  const providers = modelsData.providers || modelsData.provedores;
  assert.ok(Array.isArray(providers), "providers deve ser um array");
  assert.ok(providers.length >= 8, `deve conter no mínimo 8 provedores, encontrou ${providers.length}`);
  
  const ids = new Set();
  for (const p of providers) {
    assert.ok(p.id, "provedor sem id");
    assert.ok(!ids.has(p.id), `id de provedor duplicado: ${p.id}`);
    ids.add(p.id);
    assert.ok(p.endpoint, `provedor ${p.id} sem endpoint`);
    assert.ok(Array.isArray(p.models || p.modelos_principais), `provedor ${p.id} sem lista de modelos`);
    assert.ok((p.models || p.modelos_principais).length > 0, `provedor ${p.id} com lista de modelos vazia`);
    assert.ok(p.prioridade || p.priority || p.tier_prioridade, `provedor ${p.id} sem tier de prioridade`);
    assert.ok(p.doc_url || p.url_documentacao, `provedor ${p.id} sem url de documentação`);
  }
});

// ── sintaxe de todos os módulos JS ───────────────────────
const vm = await import("node:vm");
for (const f of ["app.js", "auth.js", "vfs.js", "icons.js", "integrations.js", "editor.js", "terminal.js"]) {
  test(`sintaxe OK: js/${f}`, () => {
    const src = readFileSync(new URL(`js/${f}`, ROOT), "utf8");
    // remove imports/exports (frontend puro, sem bundler) e valida o resto
    new vm.Script(src.replace(/^[ \t]*import[^\n]*$/gm, "").replace(/^[ \t]*export[^\n]*;?[ \t]*$/gm, ""));
  });
}

// ── segurança: sem segredos no frontend ─────────────────
const sensitive = [/sk-[A-Za-z0-9]{20,}/, /gsk_[A-Za-z0-9]{20,}/, /ghp_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/];
test("nenhuma chave sensível hardcoded no frontend", () => {
  for (const f of ["js/app.js", "js/auth.js", "index.html"]) {
    const src = readFileSync(new URL(f, ROOT), "utf8");
    for (const re of sensitive) {
      assert.ok(!re.test(src), `segredo em ${f}: ${re.source}`);
    }
  }
});

// ── boot + /health do servidor ───────────────────────────
test("servidor sobe sem chaves e responde /health", async (t) => {
  const child = spawn("node", ["server.js"], { cwd: ROOT.pathname, stdio: "ignore" });
  t.after(() => child.kill("SIGTERM"));

  let ok = false;
  for (let i = 0; i < 25 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 200));
    ok = await fetch("http://localhost:3000/health")
      .then((res) => res.json())
      .then((d) => d.ok === true && Array.isArray(d.providers))
      .catch(() => false);
  }
  assert.ok(ok, "servidor não respondeu /health");
});
