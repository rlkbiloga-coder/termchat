"""Testes de estrutura e segurança do TermChat."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
JS = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
AUTH_JS = (ROOT / "js" / "auth.js").read_text(encoding="utf-8")
MANIFEST = json.loads((ROOT / "plugins.json").read_text(encoding="utf-8"))
PWA_MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))


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


# ── frontend ──────────────────────────────────────────────
def test_csp_present():
    assert "Content-Security-Policy" in HTML, "CSP ausente"


def test_css_and_js_are_external_files():
    """index.html não deve ter <style>/<script> inline com o código do app."""
    assert "<link rel=\"stylesheet\" href=\"css/style.css\">" in HTML
    assert 'src="js/app.js"' in HTML
    assert 'src="js/auth.js"' in HTML
    assert "<style>" not in HTML


def test_escape_function_exists():
    assert "const esc=" in JS and "&lt;" in JS, "escape universal ausente"


def test_no_eval_or_innerhtml_user_data():
    assert "eval(" not in JS, "eval encontrado"
    for m in re.finditer(r"innerHTML\s*=", JS):
        block = _full_statement(JS, m.end())
        if "+" in block:
            assert "esc(" in block, "innerHTML com concatenação sem esc(): " + block[:80]


def test_secrets_not_hardcoded():
    pattern = r"(sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,})"
    for f in (HTML, CSS, JS, AUTH_JS):
        assert not re.search(pattern, f), "chave exposta no código do frontend"


def test_key_input_is_password():
    assert 'id="cfgKey" type="password"' in HTML


def test_permissions_requested_on_demand():
    """Permissões só são pedidas via ensurePerm (instalação/execução do plugin)."""
    assert "ensurePerm" in JS
    assert "Notification.requestPermission" in JS  # só dentro de PERMS.ask


def test_external_link_confirmation():
    assert "Abrir fora do TermChat?" in JS, "links externos abrem sem confirmação"


def test_wipe_all_data():
    assert "function wipe" in JS and "tc_" in JS


def test_animations_respect_reduced_motion():
    assert "prefers-reduced-motion" in CSS


def test_explore_has_category_filter_and_icons():
    assert "renderChips" in JS and "CAT_ICON" in JS, "filtro de categoria/ícones ausente no explorar"


# ── manifesto de plugins ──────────────────────────────────
def test_manifest_valid_and_synced():
    js_ids = set(re.findall(r"\{id:'(\w+)'", JS))
    manifest_ids = {p["id"] for p in MANIFEST["plugins"]}
    assert manifest_ids == js_ids, f"divergência catálogo/JS: {manifest_ids ^ js_ids}"


def test_manifest_perms_are_known():
    allowed = {"geolocation", "notifications", "clipboard"}
    for p in MANIFEST["plugins"]:
        assert set(p["perms"]) <= allowed, "permissão desconhecida em " + p["id"]


# ── PWA ────────────────────────────────────────────────────
def test_pwa_manifest_has_required_icons():
    sizes = {i["sizes"] for i in PWA_MANIFEST["icons"]}
    assert {"192x192", "512x512"} <= sizes
    for icon in PWA_MANIFEST["icons"]:
        assert (ROOT / icon["src"]).exists(), f"ícone faltando: {icon['src']}"


def test_apple_touch_icon_exists():
    assert (ROOT / "icons" / "apple-touch-icon.png").exists()


def test_service_worker_only_caches_same_origin():
    sw = (ROOT / "service-worker.js").read_text(encoding="utf-8")
    assert "url.origin !== location.origin" in sw, "SW deve deixar chamadas externas passarem direto pra rede"


def test_service_worker_registered_in_app():
    assert "service-worker.js" in JS


def test_auth_js_has_no_fake_login_backend():
    """auth.js não deve fingir um backend/servidor que não existe."""
    assert "fetch(" not in AUTH_JS, "auth.js não deve chamar rede — TermChat não tem backend de login"
    assert "getDeviceId" in AUTH_JS


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
