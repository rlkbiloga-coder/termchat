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

## Repositório
```
index.html           app completo (arquivo único, sem dependências)
plugins.json         manifesto do catálogo de plugins
server.py            proxy opcional em Python/FastAPI (ver docs/SERVIDOR.md)
tests/               testes de segurança e estrutura (CI no GitHub Actions)
docs/                como criar plugins e rodar o servidor
```

## Rodar localmente
```bash
python -m http.server 8080        # só o site
# ou com o bridge:
pip install -r requirements.txt && uvicorn server:app --port 8080
```

## Licença
MIT — use, estude, modifique e redistribua livremente.
