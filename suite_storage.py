"""File JSON condivisi fra i processi della suite (pannello, chat, refresh): scrittura atomica, lock e fusione."""

import contextlib
import copy
import json
import os
import time
import uuid
from pathlib import Path

if os.name == 'nt':
    import msvcrt
else:
    import fcntl


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name('.' + uuid.uuid4().hex[:8] + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    for attempt in range(5):
        try:
            temporary.replace(path)
            break
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.05 * (attempt + 1))


@contextlib.contextmanager
def file_lock(path, timeout=30):
    """Lock esclusivo fra processi e thread su path + '.lock'; il lock di sistema cade anche se il processo termina."""
    lock = Path(str(path) + '.lock')
    lock.parent.mkdir(parents=True, exist_ok=True)
    with open(lock, 'a+b') as handle:
        deadline = time.monotonic() + timeout
        while True:
            try:
                if os.name == 'nt':
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise TimeoutError('File in uso da un altro processo della suite: ' + str(path)) from None
                time.sleep(0.05)
        try:
            yield
        finally:
            if os.name == 'nt':
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def update_json(path, mutate, default):
    """Legge, modifica e riscrive sotto lock: mutate riceve il valore corrente e può restituirne uno nuovo."""
    with file_lock(path):
        value = read_json(path) if Path(path).exists() else copy.deepcopy(default)
        result = mutate(value)
        value = value if result is None else result
        save_json(path, value)
        return value


_MISSING = object()


def merge_changes(base, mine, theirs):
    """Fusione a tre vie: tiene le modifiche di mine e di theirs rispetto a base; in conflitto vince mine.

    Dizionari e liste di oggetti con 'id' univoco (per esempio i progetti) si fondono elemento per elemento.
    """
    if mine == base or theirs == mine:
        return copy.deepcopy(theirs)
    if theirs == base:
        return copy.deepcopy(mine)
    if isinstance(base, dict) and isinstance(mine, dict) and isinstance(theirs, dict):
        return _merge_items(base, mine, theirs)
    keyed = [_by_id(value) for value in (base, mine, theirs)]
    if all(items is not None for items in keyed):
        return list(_merge_items(*keyed).values())
    return copy.deepcopy(mine)


def _by_id(value):
    if not isinstance(value, list) or not all(isinstance(i, dict) and isinstance(i.get('id'), str) for i in value):
        return None
    items = {i['id']: i for i in value}
    return items if len(items) == len(value) else None


def _merge_items(base, mine, theirs):
    result = {}
    for key in dict.fromkeys([*theirs, *mine]):
        old, new, other = base.get(key, _MISSING), mine.get(key, _MISSING), theirs.get(key, _MISSING)
        if new is _MISSING:
            # Tolto da mine: resta tolto, salvo che l'altro processo l'abbia modificato nel frattempo.
            if other is not _MISSING and other != old:
                result[key] = copy.deepcopy(other)
        elif other is _MISSING:
            if new != old:
                result[key] = copy.deepcopy(new)
        else:
            empty = type(new)() if isinstance(new, (dict, list)) else None
            result[key] = merge_changes(empty if old is _MISSING else old, new, other)
    return result
