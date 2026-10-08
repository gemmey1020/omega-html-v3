"""Exercise the actual pinned Python bootstrap runtime and test dependency."""

import importlib.metadata
import sys
import tomllib
from pathlib import Path


def test_locked_python_toolchain() -> None:
    root = Path(__file__).resolve().parents[3]
    project = tomllib.loads((root / "pyproject.toml").read_text())
    assert sys.version_info[:3] == (3, 14, 8)
    assert project["project"]["requires-python"] == "==3.14.8"
    assert importlib.metadata.version("pytest") == "9.1.1"
    assert importlib.metadata.version("ruff") == "0.16.10"
    assert importlib.metadata.version("mypy") == "2.4.0"
