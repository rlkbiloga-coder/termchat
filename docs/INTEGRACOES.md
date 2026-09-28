# Integracoes OpenCode + Acode no TermChat

Documentacao de cada etapa da integracao (fontes, licencas, o que foi adotado e como atualizar).

## Fontes
- OpenCode: github.com/sst/opencode - Licenca MIT (Copyright (c) 2025 opencode)
- Acode: github.com/Acode-Foundation/Acode - Licenca MIT (Copyright (c) Acode-Foundation)

Ambas as licencas MIT permitem uso, copia e modificacao, desde que a atribuicao seja mantida.

## O que foi integrado

### 1. Provedor Zen (OpenCode)
O endpoint free do OpenCode (opencode.ai/zen) ja e o provider `zen`/`opencode` do TermChat.
- Arquivo: server.js (ALLOWED_TARGETS)
- Para atualizar a lista de modelos zen: ver packages/opencode no repo deles e espelhar os IDs.

### 2. Agentes com prompts reais do OpenCode
Adaptados de packages/opencode/src (prompts em .txt, MIT), traduzidos e condensados:
- `reviewer`: de src/command/template/review.txt - revisao de codigo com feedback acionavel.
- `explorer`: de src/agent/prompt/explore.txt - especialista em busca de arquivos.
- `beast`: de src/session/prompt/beast.txt - modo autonomo persistente ate resolver.
- Uso no chat: /agent reviewer <pedido>, /agent explorer <busca>, /agent beast <problema>.
- Arquivo: js/agents.js (objeto this.agents)

### 3. Quick tools do editor (padrao Acode)
O Acode e um editor mobile baseado em CodeMirror; adotamos os atalhos classicos de editor sobre o textarea nativo do TermChat:
- Ctrl+G: ir para linha (scroll ate a linha, cursor posicionado).
- Ctrl+H: substituir todas as ocorrencias (com confirmacao e contagem).
- Alt+Z: alternar quebra de linha (preferencia salva em localStorage `termchat_wrap`).
- Arquivo: js/editor.js (metodos gotoLine, replaceAll, toggleWrap, applySavedWrap)

## Como atualizar no futuro
1. `git clone --depth 1 https://github.com/sst/opencode` e conferir src/session/prompt/*.txt.
2. Reescrever os textos dos agentes em js/agents.js mantendo a logica (missao + restricoes + idioma PT-BR).
3. Para o editor, os atalhos sao independentes de versao externa: so manter os metodos em js/editor.js.

## Atribuicao
As logicas acima sao adaptacoes da obra OpenCode (sst) e Acode (Acode-Foundation), ambas MIT.
Mantenha este arquivo e os creditos acima ao redistribuir.
