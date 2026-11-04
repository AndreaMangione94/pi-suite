"""Host bridge to the separately installable pi-suite-benchmarks npm dependency."""

import importlib
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent / 'node_modules' / 'pi-suite-benchmarks'


def load():
    """Return the optional installed module; the export source folder is never loaded."""
    python_root = PACKAGE_ROOT / 'python'
    if not (python_root / 'pi_suite_benchmarks' / '__init__.py').is_file():
        return None
    if str(python_root) not in sys.path:
        sys.path.insert(0, str(python_root))
    module = importlib.import_module('pi_suite_benchmarks')
    if module.API_VERSION != 1:
        raise ImportError('Versione API del modulo benchmark incompatibile: è richiesta la versione 1.')
    return module


def require():
    module = load()
    if module is None:
        raise ImportError('Modulo pi-suite-benchmarks non installato. Installa la dipendenza npm per abilitarlo.')
    return module


def asset(name):
    return require().asset(name)


def __getattr__(name):
    # Preserve imports made by older callers without duplicating the implementation.
    if name.startswith('__'):
        raise AttributeError(name)
    return getattr(require().ledger, name)
