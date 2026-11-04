"""Public API for the self-contained benchmark module (Python standard library only)."""

from pathlib import Path
from .ledger import Benchmarks

API_VERSION = 1
PACKAGE_ROOT = Path(__file__).resolve().parents[2]


def asset(name):
    """Resolve only public assets, never Python, the catalog or arbitrary paths."""
    if name not in ('benchmark-panel.js', 'benchmark.css'):
        raise ValueError('Risorsa benchmark non disponibile.')
    return PACKAGE_ROOT / 'ui' / name
