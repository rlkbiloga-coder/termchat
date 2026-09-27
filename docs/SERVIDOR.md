# Servidor opcional (bridge Python)

O site funciona sem servidor. O bridge server.py serve para:
1. `/api/plugins` — manifesto JSON como API
2. `/api/chat` — proxy com lista fixa de destinos (sem CORS no navegador,
   chaves ficam no .env do servidor em vez do dispositivo)

## Rodar
```bash
cp .env.example .env    # preencha se usar Groq/OpenRouter no proxy
pip install -r requirements.txt
uvicorn server:app --port 8080
```

## Segurança
- ALLOWED_TARGETS é fixo: provedor fora da lista é recusado (anti-SSRF)
- CORS vem de ALLOWED_ORIGINS; em produção liste só o seu domínio
- Chaves: variáveis de ambiente, .env está no .gitignore
