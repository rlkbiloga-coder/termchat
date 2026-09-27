# TermChat

Chatbot leve estilo terminal com um **Explorar** de plugins — como uma loja de
extensões de terminal, mas integrada ao chat. 100% gratuito e open source (MIT).

Site: https://nicolaswjwkwk.github.io/termchat/

## Como usar
1. Abra o site — a IA já funciona no modo *auto* (cadeia grátis sem chave:
   Pollinations (grátis, sem chave) → Ollama local)
2. Opcional: em *config*, coloque sua chave do Groq/OpenRouter (fica só no seu
   navegador) ou aponte para seu Ollama local
3. Aba *explorar*: instale plugins (clima, cripto, wiki, notas, timer com
   notificação, QR, tradutor, tech-news, calc, sysinfo, meu-ip)
4. No chat: `/help` lista os comandos do terminal

## Permissões do dispositivo
O site só pede notificação/localização/clipboard no momento em que você instala
o plugin que precisa da permissão. Painel de estado em *config → permissões*.

## Repositório (PWA instalável)
```
index.html                 app shell (HTML puro, liga css/js)
manifest.json               manifesto PWA (ícones, cores, instalável)
service-worker.js           cache offline do app shell (nunca cacheia chamadas de IA/plugins)
.htaccess                    cabeçalhos de segurança para hospedagem Apache
css/style.css                todo o visual do app
js/app.js                    lógica principal: chat, IA, plugins, explorar, config
js/auth.js                   ID de dispositivo local e estado de chave verificada (sem servidor de login)
icons/                        icon-192x192.png, icon-512x512.png, apple-touch-icon.png
plugins.json                 manifesto do catálogo de plugins
server.py                    proxy opcional em Python/FastAPI (ver docs/SERVIDOR.md)
tests/                        testes de segurança e estrutura
docs/                         como criar plugins e rodar o servidor
```

## Instalar como app (PWA)
No Android/Chrome: menu → "Instalar app". No iPhone/Safari: compartilhar →
"Adicionar à Tela de Início". O TermChat abre em tela cheia com ícone próprio
e continua funcionando offline (exceto respostas de IA/plugins, que exigem rede).

## Rodar localmente
```bash
python -m http.server 8080        # só o site
# ou com o bridge:
pip install -r requirements.txt && uvicorn server:app --port 8080
```

## Licença
MIT — use, estude, modifique e redistribua livremente.
