from __future__ import annotations

import importlib
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
api_root_str = str(API_ROOT)

if sys.path[0] != api_root_str:
    sys.path.insert(0, api_root_str)

loaded_api = sys.modules.get("api")
loaded_api_file = Path(getattr(loaded_api, "__file__", "")) if loaded_api else None

if loaded_api_file and API_ROOT not in loaded_api_file.parents:
    del sys.modules["api"]

importlib.import_module("api.v1")
