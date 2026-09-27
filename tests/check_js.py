"""Valida a sintaxe de todos os arquivos JS do projeto com node --check."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS_FILES = [ROOT / "js" / "app.js", ROOT / "js" / "auth.js", ROOT / "service-worker.js"]

failed = False
for f in JS_FILES:
    res = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"FALHA em {f.name}:\n{res.stderr[:600]}")
        failed = True
    else:
        print(f"{f.name}: OK")

sys.exit(1 if failed else 0)
