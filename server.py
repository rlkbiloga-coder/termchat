"""Servidor opcional do TermChat (FastAPI).

O site funciona 100% sem este servidor. Ele existe para quem quer:
  1. Proxy /api/chat com lista de destinos permitidos (evita CORS e expõe menos o navegador)
  2. Servir o catálogo plugins.json como API

Segurança: nenhuma chave é escrita em código; use .env (ver .env.example).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="TermChat Bridge", version="1.0.0")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080").split(",")

# Lista fixa de destinos permitidos — nenhum endereço arbitrário é aceito.
ALLOWED_TARGETS = {
    "pollinations": "https://text.pollinations.ai/openai",
    "zen": "https://opencode.ai/zen/v1/chat/completions",
    "groq": "https://api.groq.com/openai/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=600,
)

_PLUGINS = json.loads((Path(__file__).parent / "plugins.json").read_text(encoding="utf-8"))


class ChatRequest(BaseModel):
    provider: str
    model: str = ""
    messages: list[dict]


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "termchat-bridge", "version": "1.0.0"}


@app.get("/api/plugins")
async def plugins() -> dict:
    return _PLUGINS


@app.post("/api/chat")
async def chat(req: ChatRequest) -> dict:
    target = ALLOWED_TARGETS.get(req.provider)
    if not target:
        raise HTTPException(status_code=400, detail="provedor não permitido")

    body: dict = {"messages": req.messages}
    if req.model:
        body["model"] = req.model

    key = os.getenv(f"{req.provider.upper()}_API_KEY", "")
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(target, json=body, headers=headers)

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"upstream {resp.status_code}")

    data = resp.json()
    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="resposta inválida do provedor") from exc
    return {"ok": True, "text": text}
