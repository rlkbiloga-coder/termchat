"""Extrai o JS do index.html e valida a sintaxe com node --check."""
import re
import subprocess
import sys
from pathlib import Path

html = Path(__file__).resolve().parents[1] / "index.html"
src = html.read_text(encoding="utf-8")
blocks = re.findall(r"<script>([\s\S]*?)</script>", src)
assert blocks, "nenhum bloco <script> encontrado"
Path("/tmp/termchat.js").write_text(blocks[0], encoding="utf-8")
res = subprocess.run(["node", "--check", "/tmp/termchat.js"], capture_output=True, text=True)
if res.returncode != 0:
    print(res.stderr[:800])
    sys.exit(1)
print("JS OK")
