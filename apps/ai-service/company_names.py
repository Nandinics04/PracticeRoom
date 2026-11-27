import json
from server import question_rows

names = sorted({(row.get("company") or "").strip() for row in question_rows() if (row.get("company") or "").strip()})
print(json.dumps(names))
