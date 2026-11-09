#!/usr/bin/env python3
"""Launch the real client twice with isolated data and verify plugin startup/storage."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, default=ROOT / 'out/bin/DamZaGram')
    args = parser.parse_args()
    binary = args.binary.resolve()
    work = Path(tempfile.mkdtemp(prefix='damza-client-smoke-'))
    print(f'Smoke artifacts: {work}', flush=True)
    plugins = work / 'tdata/plugins'
    data = work / 'tdata/plugins_data'
    data.mkdir(parents=True)

    def plugin(name, source, manifest=None):
        folder = plugins / name
        folder.mkdir(parents=True)
        (folder / 'main.js').write_text(source, encoding='utf-8')
        (folder / 'manifest.json').write_text(json.dumps(manifest or {
            'id': name, 'name': name, 'version': '1.0.0',
        }), encoding='utf-8')

    plugin('smoke-probe', '''
dzg.on('ready', () => {
  dzg.storage.set('boots', dzg.storage.get('boots', 0) + 1);
  setTimeout(() => {
    dzg.fs.write(dzg.plugin.dir + '/../reload-target/manifest.json', JSON.stringify({
      id: 'changed-target', version: '1.0.0'
    }));
    dzg.plugins.reload('reload-target');
  }, 300);
  setTimeout(() => {
    dzg.fs.write(dzg.plugin.dataDir + 'smoke-result.json', JSON.stringify({
      boots: dzg.storage.get('boots'), plugins: dzg.plugins.list()
    }));
  }, 1500);
  let tested = false;
  setInterval(() => {
    if (tested || !dzg.fs.exists(dzg.plugin.dataDir + 'failure-trigger')) return;
    tested = true;
    let failed = false;
    try { dzg.storage.set('boots', 999); } catch (_) { failed = true; }
    dzg.fs.write(dzg.plugin.dataDir + 'failure-result.json', JSON.stringify({
      failed, boots: dzg.storage.get('boots')
    }));
  }, 100);
});
''')
    marker = "dzg.fs.write(dzg.plugin.dataDir + 'unexpected-execution', 'bad');"
    plugin('bad-storage', marker)
    plugin('bad-type', marker, {'id': 'bad-type', 'type': 'invalid'})
    plugin('bad-main', marker, {'id': 'bad-main', 'main': '../outside.js'})
    plugin('bad-json', marker)
    plugin('reload-target', "dzg.on('unload', () => dzg.fs.write(dzg.plugin.dataDir + 'reload-unloaded', 'yes'));")
    (plugins / 'bad-json/manifest.json').write_text('{broken', encoding='utf-8')
    (plugins / 'outside.js').write_text(marker, encoding='utf-8')
    corrupt = b'{not valid storage'
    (data / 'bad-storage.json').write_bytes(corrupt)
    names = ['smoke-probe', 'bad-storage', 'bad-type', 'bad-main', 'bad-json', 'reload-target']
    (data / '_state.json').write_text(json.dumps({
        'enabled': {name: True for name in names}, 'devMode': False,
    }), encoding='utf-8')
    expected = {p.name for p in (ROOT / 'plugins/builtin').iterdir() if p.is_dir()}
    result_file = data / 'smoke-result.json'
    env = dict(os.environ, QT_QPA_PLATFORM='offscreen', QT_OPENGL='software')
    for boot in (1, 2):
        result_file.unlink(missing_ok=True)
        (data / 'reload-unloaded').unlink(missing_ok=True)
        (plugins / 'reload-target/manifest.json').write_text(json.dumps({
            'id': 'reload-target', 'version': '1.0.0',
        }), encoding='utf-8')
        with (work / f'boot-{boot}.log').open('wb') as log:
            process = subprocess.Popen([str(binary), '-many', '-workdir', str(work)],
                                       stdout=log, stderr=log, env=env)
            try:
                deadline = time.monotonic() + 45
                result = None
                while result is None:
                    if process.poll() is not None:
                        raise RuntimeError(f'Client exited with {process.returncode}; see {work}')
                    if time.monotonic() >= deadline:
                        raise RuntimeError(f'Plugin startup timed out; see {work}')
                    if result_file.exists():
                        try:
                            result = json.loads(result_file.read_text())
                        except json.JSONDecodeError:
                            pass
                    time.sleep(0.1)
                assert result['boots'] == boot, result
                states = {p['id']: p for p in result['plugins']}
                for name in expected:
                    assert states[name]['loaded'] and not states[name]['error'], states[name]
                    source = ROOT / 'plugins/builtin' / name
                    assert states[name]['version'] == json.loads((source / 'manifest.json').read_text())['version']
                    assert (plugins / name / 'main.js').read_bytes() == (source / 'main.js').read_bytes()
                for name in names[1:]:
                    assert not states[name]['loaded'] and states[name]['error'], states[name]
                assert 'id changed' in states['reload-target']['error']
                assert (data / 'reload-unloaded').read_text() == 'yes'
                assert not (data / 'unexpected-execution').exists()
                if boot == 1:
                    storage = data / 'smoke-probe.json'
                    backup = data / 'smoke-probe.saved.json'
                    storage.rename(backup)
                    storage.mkdir()
                    try:
                        (data / 'failure-trigger').touch()
                        failure = None
                        deadline = time.monotonic() + 10
                        while failure is None and time.monotonic() < deadline:
                            try:
                                failure = json.loads((data / 'failure-result.json').read_text())
                            except (FileNotFoundError, json.JSONDecodeError):
                                time.sleep(0.1)
                        assert failure == {'failed': True, 'boots': 1}, failure
                        assert json.loads(backup.read_text())['boots'] == 1
                    finally:
                        (data / 'failure-trigger').unlink(missing_ok=True)
                        storage.rmdir()
                        backup.rename(storage)
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
        assert (data / 'bad-storage.json').read_bytes() == corrupt
        print(f'PASS boot {boot}: {len(expected)} builtins, rejected invalid plugins, persistent storage', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
