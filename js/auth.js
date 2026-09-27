/**
 * TermChat — auth.js
 *
 * TermChat NÃO tem login em servidor: é um app 100% client-side, sem conta.
 * Este arquivo cuida só de duas coisas locais, ambas sem backend:
 *
 *   1. Um ID de dispositivo anônimo e aleatório (fica só no seu navegador,
 *      não é enviado a nenhum servidor) — serve para identificar exports/
 *      imports de configuração como vindos do mesmo aparelho.
 *   2. Um helper para guardar chaves de API com uma marca de "verificado"
 *      (a chave testou com sucesso contra o provedor), usado pela tela de
 *      configurações para não repetir testes desnecessários.
 *
 * Se um dia o TermChat ganhar um backend real (ex.: server.py com contas),
 * este arquivo é o lugar certo para o fluxo de login/token — hoje ele só
 * gerencia estado local, sem exigir nenhuma senha ou servidor.
 */
(function () {
  "use strict";

  function getDeviceId() {
    var KEY = "tc_device_id";
    var id = localStorage.getItem(KEY);
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "dev-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      localStorage.setItem(KEY, id);
    }
    return id;
  }

  function markKeyVerified(provider, verified) {
    var KEY = "tc_key_verified";
    var map = {};
    try { map = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { map = {}; }
    map[provider] = !!verified;
    localStorage.setItem(KEY, JSON.stringify(map));
  }

  function isKeyVerified(provider) {
    try {
      var map = JSON.parse(localStorage.getItem("tc_key_verified") || "{}");
      return !!map[provider];
    } catch (e) {
      return false;
    }
  }

  window.TermAuth = {
    getDeviceId: getDeviceId,
    markKeyVerified: markKeyVerified,
    isKeyVerified: isKeyVerified
  };
})();
