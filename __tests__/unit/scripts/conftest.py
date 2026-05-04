"""
Stub heavy dependencies so that scripts/*.py can be imported in unit tests
without the full ML / service stack installed.

Covers: fastapi, httpx, pydantic, torch, transformers, databases, predictive_model,
        kafka, aiokafka.
"""

import sys
from unittest.mock import MagicMock

# --- Register stubs before any script module is imported ---

_STUBS = [
    "fastapi",
    "httpx",
    "pydantic",
    "torch",
    "transformers",
    "kafka",
    "aiokafka",
    "databases",
    "predictive_model",
]

for _mod in _STUBS:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# FastAPI attributes used at module level in service files
_fa = sys.modules["fastapi"]
_fa.Query = MagicMock(return_value=None)
_fa.HTTPException = Exception
_fa.FastAPI = MagicMock(return_value=MagicMock())

# Pydantic BaseModel must be a real class so dataclass-style subclasses work
_real_base = type("BaseModel", (), {"model_dump": lambda self: self.__dict__})
sys.modules["pydantic"].BaseModel = _real_base
