"""Testi dei prompt in prompts/*.md, condivisi con prompts.mjs: {{nome}} si sostituisce con i valori passati."""

import functools
import re
from pathlib import Path

FOLDER = Path(__file__).resolve().parent / 'prompts'


@functools.cache
def _text(name):
    return (FOLDER / (name + '.md')).read_text(encoding='utf-8').replace('\r\n', '\n').removesuffix('\n')


def prompt(name, **values):
    def value(match):
        if match.group(1) not in values:
            raise ValueError('Valore mancante nel prompt ' + name + ': ' + match.group(1))
        return str(values[match.group(1)])

    return re.sub(r'\{\{(\w+)\}\}', value, _text(name))
