from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def patch(path: Path, import_line: str) -> None:
    text = path.read_text(encoding="utf-8")
    if "apiBase" not in text:
        lines = text.splitlines(True)
        j = 0
        while j < len(lines) and (lines[j].startswith("import ") or lines[j].startswith("from ")):
            j += 1
        lines.insert(j, import_line)
        text = "".join(lines)
    text = re.sub(r'"http://localhost:3000(/api/v1[^"]*)"', r'apiUrl("\1")', text)
    text = re.sub(r"`http://localhost:3000(/api/v1[^`]*)`", r"apiUrl(`\1`)", text)
    path.write_text(text, encoding="utf-8")
    left = text.count("localhost:3000")
    print(f"{path.name}: apiUrl calls={text.count('apiUrl(')} leftover localhost={left}")


patch(ROOT / "apps/web/src/App.tsx", 'import { apiUrl } from "./apiBase";\n')
patch(ROOT / "apps/web/src/dashboard/SessionLauncherCard.tsx", 'import { apiUrl } from "../apiBase";\n')
