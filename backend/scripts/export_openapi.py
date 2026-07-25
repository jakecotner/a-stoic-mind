"""Dump the FastAPI OpenAPI schema to backend/openapi.json.

This feeds frontend type generation: run this, then `npm run generate:types`
in frontend/ (which runs openapi-typescript over the dump and writes
frontend/lib/api-types.d.ts). Commit the generated .d.ts; openapi.json
itself is a gitignored intermediate.

Imports the app without starting a server or touching the database, so it
runs anywhere the backend venv exists:

    python scripts/export_openapi.py [output-path]
"""
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.main import app  # noqa: E402


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else BACKEND / "openapi.json"
    out.write_text(json.dumps(app.openapi(), indent=2), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
