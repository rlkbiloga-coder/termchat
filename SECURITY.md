# Critérios de segurança do TermChat

## Frontend (index.html)
1. CSP (Content-Security-Policy) via meta tag: scripts só de origens permitidas
2. Escape universal de texto (função esc) — nenhum input do usuário vira HTML
3. Sem eval, sem innerHTML com dado do usuário, sem trackers de terceiros
4. Links externos exigem confirmação antes de redirecionar (anti-phishing)
5. Chaves de API: tipo password, guardadas apenas no localStorage do
   dispositivo, nunca enviadas a terceiros além do provedor escolhido,
   nunca impressas em log, nunca versionadas no repositório

## Permissões do dispositivo
1. Notificação, localização e clipboard só são solicitadas quando o usuário
   instala o plugin que precisa delas — nunca no carregamento da página
2. Painel em config mostra estado concedido/negado de cada permissão
3. Botão "apagar tudo" remove todos os dados locais imediatamente

## Backend opcional (server.py)
1. Proxy só aceita destinos da lista fixa ALLOWED_TARGETS — sem SSRF
2. CORS restrito por ALLOWED_ORIGINS (sem wildcard em produção)
3. Chaves exclusivamente por variáveis de ambiente (.env no .gitignore)
4. Validação de payload com Pydantic; timeout de 60s no upstream

## Reportar vulnerabilidade
Abra uma issue privada em Security Advisories no repositório GitHub.
