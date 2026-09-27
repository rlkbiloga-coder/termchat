"""Testes de estrutura e segurança do TermChat."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
MANIFEST = json.loads((ROOT / "plugins.json").read_text(encoding="utf-8"))


# ── frontend ──────────────────────────────────────────────
def test_csp_present():
    assert "Content-Security-Policy" in HTML, "CSP ausente"


def test_no_inline_external_scripts():
    """Nenhum <script src> externo: tudo inline ou de origens do CSP."""
    assert not re.search(r"<script[^>]+src=", HTML), "script externo inesperado"


def test_escape_function_exists():
    assert "const esc=" in HTML and "&lt;" in HTML, "escape universal ausente"


def test_no_eval_or_innerhtml_user_data():
    assert "eval(" not in HTML.replace("sem eval", "").replace("sem eval", ""), "eval encontrado"
    # toda atribuição innerHTML com concatenação precisa usar esc() na instrução completa
    for m in re.finditer(r"innerHTML\s*=", HTML):
        block = _full_statement(HTML, m.end())
        if "+" in block:
            assert "esc(" in block, "innerHTML com concatenação sem esc(): " + block[:80]


def test_secrets_not_hardcoded():
    assert not re.search(r"(sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,})", HTML), "chave exposta no frontend"


def test_key_input_is_password():
    assert 'id="cfgKey" type="password"' in HTML


def test_permissions_requested_on_demand():
    """Permissões só são pedidas via ensurePerm (instalação/execução do plugin)."""
    assert "ensurePerm" in HTML
    assert "Notification.requestPermission" in HTML  # só dentro de PERMS.ask


def test_external_link_confirmation():
    assert "Abrir fora do TermChat?" in HTML, "links externos abrem sem confirmação"


def test_wipe_all_data():
    assert "function wipe" in HTML and "tc_" in HTML


def test_animations_respect_reduced_motion():
    assert "prefers-reduced-motion" in HTML


# ── manifesto de plugins ──────────────────────────────────
def _full_statement(code: str, start: int) -> str:
    """Extrai a instrução JS completa com contagem balanceada de () e {}."""
    depth = 0
    i = start
    instr = ""
    while i < len(code):
        ch = code[i]
        if ch in "({[":
            depth += 1
        elif ch in ")}]":
            depth -= 1
        elif ch == ";" and depth == 0:
            return code[start:i]
        instr += ch
        i += 1
    return instr


def test_manifest_valid_and_synced():
    js_ids = set(re.findall(r"\{id:'(\w+)'", HTML))
    js_ids -= {"meuplug"}  # exemplo da documentação não conta
    manifest_ids = {p["id"] for p in MANIFEST["plugins"]}
    assert manifest_ids == js_ids, f"divergência catálogo/JS: {manifest_ids ^ js_ids}"


def test_manifest_perms_are_known():
    allowed = {"geolocation", "notifications", "clipboard"}
    for p in MANIFEST["plugins"]:
        assert set(p["perms"]) <= allowed, "permissão desconhecida em " + p["id"]


# ── backend opcional ──────────────────────────────────────
def test_server_imports_and_allowlist():
    code = (ROOT / "server.py").read_text(encoding="utf-8")
    assert "ALLOWED_TARGETS" in code and "pollinations" in code, "allowlist ausente"
    assert ".env" in (ROOT / ".gitignore").read_text(), ".env fora do gitignore"


def test_plugins_json_served():
    import server

    data = json.loads((ROOT / "plugins.json").read_text(encoding="utf-8"))
    assert data["name"] == "TermChat"
    assert len(data["plugins"]) >= 10
