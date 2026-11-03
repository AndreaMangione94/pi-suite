"""Credential helper for byok-network.mjs: prints one protected key to stdout and never writes it elsewhere."""
import os
import sys
import suite_byok as byok


def main():
    name = sys.argv[1] if len(sys.argv) == 2 else ''
    home = os.environ.get('PI_SUITE_HOME')
    if not home:
        raise ValueError('PI_SUITE_HOME non impostata')
    store = byok.Store(home, byok.protect)
    connection = next((c for c in store.config()['connections'] if byok.env_name(c['id']) == name), None)
    if connection is None or connection['auth']['type'] != 'secret':
        raise ValueError('Connessione con chiave protetta non trovata: ' + name)
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stdout.write(store.secret(connection))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error)[:300], file=sys.stderr)
        sys.exit(1)
