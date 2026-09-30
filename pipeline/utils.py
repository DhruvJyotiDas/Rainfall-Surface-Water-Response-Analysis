"""Shared helpers for the pipeline/NN_*.py scripts.

Keeps config loading, EE init, and disk-caching in one place so every script
behaves the same way (cache-first, no silent recompute, no hardcoded tunables).
"""
from __future__ import annotations

import functools
import hashlib
import json
import random
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = REPO_ROOT / "config" / "config.yaml"
CACHE_DIR = REPO_ROOT / "cache"


@functools.lru_cache(maxsize=1)
def load_config() -> dict[str, Any]:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def set_seeds() -> None:
    cfg = load_config()
    seed = cfg.get("seeds", {}).get("numpy_seed", 42)
    random.seed(seed)
    np.random.seed(seed)


def ee_init():
    """Initialize Earth Engine using the project pinned in config.yaml.

    Raises the underlying EEException if auth/registration isn't done yet —
    callers must not catch-and-mock; surface the real error to the user.
    """
    import ee

    cfg = load_config()
    project = cfg.get("earth_engine", {}).get("project")
    if not project:
        raise RuntimeError(
            "config.yaml: earth_engine.project is not set. "
            "Run `earthengine authenticate`, register a Cloud project for EE, "
            "then set earth_engine.project in config.yaml."
        )
    ee.Initialize(project=project)
    return ee


def retry_with_backoff(fn: Callable[[], Any], max_retries: int = 5, base_delay: float = 2.0, label: str = "") -> Any:
    """Retry a zero-arg callable with exponential backoff.

    GEE/OAuth calls observed to fail intermittently with transient connection
    errors (not auth/quota errors) even when the endpoint is generally
    reachable. Required by the spec for chunked GEE requests; used here for
    any network call that showed flakiness rather than a real failure.
    """
    last_exc = None
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - deliberately broad, this is a transport retry
            last_exc = e
            if attempt == max_retries - 1:
                break
            delay = base_delay * (2 ** attempt)
            print(f"  [retry] {label or fn}: attempt {attempt + 1}/{max_retries} failed ({e.__class__.__name__}: {e}); retrying in {delay:.0f}s")
            time.sleep(delay)
    raise last_exc


def cache_path(name: str, ext: str = "parquet") -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{name}.{ext}"


def cache_key(*parts: Any) -> str:
    """Short stable hash for cache filenames derived from run parameters."""
    blob = json.dumps(parts, sort_keys=True, default=str).encode()
    return hashlib.sha256(blob).hexdigest()[:12]


def read_json_cache(name: str) -> dict | None:
    p = cache_path(name, "json")
    if p.exists():
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def write_json_cache(name: str, data: dict) -> Path:
    p = cache_path(name, "json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    return p
