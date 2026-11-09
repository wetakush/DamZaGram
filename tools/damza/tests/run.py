#!/usr/bin/env python3
"""Run plugin regression checks; add --native for Qt/C++ integration tests."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native', action='store_true')
    parser.add_argument('--docs', action='store_true')
    options = parser.parse_args()
    checks = []
    for name in ('plugins', 'messages', 'chats', 'mtproto', 'ui'):
        checks.append([sys.executable, 'tools/damza/sandbox.py',
                       f'tools/damza/tests/{name}.plugin.js', f'tools/damza/tests/{name}.test.js'])
    for name in ('core-timers', 'builtin-module', 'storage'):
        checks.append([sys.executable, 'tools/damza/sandbox.py',
                       'plugins/examples/hello/main.js', f'tools/damza/tests/{name}.test.js'])
    checks.extend([
        [sys.executable, 'tools/damza/tests/builtins/run.py'],
        [sys.executable, 'tools/damza/tests/scaffold_test.py'],
        [sys.executable, 'tools/damza/embed_builtins.py', '--check'],
        [sys.executable, 'tools/damza/embed_types.py', '--check'],
    ])
    if options.native:
        checks.extend([['sh', f'tools/damza/tests/{name}_test.sh']
                       for name in ('js_runtime', 'install', 'tl_codec')])
    if options.docs:
        checks.append([sys.executable, 'tools/damza/check_docs.py'])
    failed = []
    for command in checks:
        print('RUN', ' '.join(command), flush=True)
        result = subprocess.run(command, cwd=ROOT)
        if result.returncode:
            failed.append(' '.join(command))
    if failed:
        print('FAILED:\n' + '\n'.join(failed))
        return 1
    print(f'PASS: {len(checks)} regression checks')
    return 0


if __name__ == '__main__':
    sys.exit(main())
