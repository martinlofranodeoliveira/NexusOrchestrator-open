"""Reviewed Node release checks; no provider credentials, private home or egress."""
import argparse
import errno
import hashlib
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
OMIT = {'.git', 'node_modules', 'dist', '.data', '.venv', '__pycache__',
        '.pytest_cache', '.vite', '.vite-temp', '.tmp', 'playwright-report', 'test-results'}


def files(root):
    for directory, names, names_files in os.walk(root, followlinks=False):
        names[:] = [name for name in names if name not in OMIT]
        for name in names_files:
            path = Path(directory) / name
            if name == '.env' or (name.startswith('.env.') and name != '.env.example'):
                continue
            if path.is_symlink():
                raise ValueError('Symlinks are not admitted to the release snapshot')
            yield path


def hashes(root):
    return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in files(root)}


def probe():
    assert not Path('/home/martin').exists()
    assert not Path('/work/.git').exists()
    assert not Path('/work/.env').exists()
    assert not any(name.endswith(('_TOKEN', '_API_KEY')) for name in os.environ)
    for path in ('/work/README.md',):
        try:
            descriptor = os.open(path, os.O_WRONLY)
        except OSError as error:
            assert error.errno == errno.EROFS
        else:
            os.close(descriptor)
            raise AssertionError('Source must be read-only')
    for host, expected in (('1.1.1.1', errno.ENETUNREACH), ('127.0.0.1', errno.ECONNREFUSED)):
        with socket.socket() as connection:
            connection.settimeout(.5)
            try:
                connection.connect((host, 8081 if host.startswith('127.') else 443))
            except OSError as error:
                assert error.errno == expected
            else:
                raise AssertionError('Unexpected provider/model network access')


def test_command(command, expected):
    with tempfile.TemporaryFile() as output:
        result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT)
        assert output.tell() <= 3_000_000, 'Test output exceeded reviewed budget'
        output.seek(0)
        text = output.read().decode('utf-8', errors='replace')
    print(text, end='', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
    def last(label):
        values = re.findall(r'^# ' + label + r' (\d+)\s*$', text, re.M)
        assert values, 'Missing TAP summary: ' + label
        return int(values[-1])
    assert last('tests') == expected and last('pass') == expected
    assert all(last(label) == 0 for label in ('fail', 'cancelled', 'skipped', 'todo'))
    print(f'Accepted exactly {expected} offline test cases.', flush=True)


def inner(scope):
    probe()
    if scope == 'server':
        os.chdir('/work/server')
        subprocess.run(['/opt/node/bin/node', 'scripts/check-syntax.js'], check=True)
        tests = [str(path.relative_to(Path.cwd())) for path in sorted(Path('test').resolve().glob('*.test.js'))]
        test_command(['/opt/node/bin/node', '--test', '--test-reporter=tap', '--test-concurrency=2', *tests], 330)
    else:
        os.chdir('/work/web-v2')
        tests = [str(path.relative_to(Path.cwd())) for path in sorted(Path('test').resolve().glob('*.test.ts'))]
        test_command(['/opt/node/bin/node', '--import', 'tsx/esm', '--test', '--test-reporter=tap',
                      '--test-concurrency=1', *tests], 11)
        for command in (['node_modules/typescript/bin/tsc', '-b'],
                        ['node_modules/eslint/bin/eslint.js', '.'],
                        ['node_modules/vite/bin/vite.js', 'build']):
            subprocess.run(['/opt/node/bin/node', *command], check=True)


def prefix(snapshot, dependencies, node, scratch, scope):
    command = ['bwrap', '--unshare-all', '--unshare-user', '--disable-userns',
               '--die-with-parent', '--new-session', '--clearenv']
    for name in ('usr', 'bin', 'sbin', 'lib', 'lib64'):
        path = Path('/') / name
        if path.is_symlink():
            command += ['--symlink', os.readlink(path), '/' + name]
        elif path.exists():
            command += ['--ro-bind', str(path), str(path)]
    if Path('/etc/ld.so.cache').exists():
        command += ['--ro-bind', '/etc/ld.so.cache', '/etc/ld.so.cache']
    command += ['--symlink', '/usr/bin/which.debianutils', '/etc/alternatives/which',
                '--ro-bind', str(scratch / 'hosts'), '/etc/hosts',
                '--ro-bind', str(scratch / 'nsswitch.conf'), '/etc/nsswitch.conf',
                '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
                '--ro-bind', str(snapshot), '/work', '--tmpfs', '/work/.data',
                '--bind', str(scratch / 'build'), '/work/dist',
                '--ro-bind', str(Path(node).resolve()), '/opt/node/bin/node']
    package = 'server' if scope == 'server' else 'web-v2'
    command += ['--ro-bind', str(Path(dependencies).resolve()), '/work/' + package + '/node_modules']
    if scope == 'web':
        for cache in ('.tmp', '.vite-temp', '.vite'):
            command += ['--tmpfs', '/work/web-v2/node_modules/' + cache]
    for key, value in {'PATH': '/opt/node/bin:/usr/bin:/bin', 'HOME': '/tmp', 'LANG': 'C.UTF-8',
                       'NODE_OPTIONS': '--max-old-space-size=512', 'CI': 'true',
                       'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONNOUSERSITE': '1',
                       'NEXUS_AUTO_DISPATCH': 'false', 'NEXUS_BOOTSTRAP_DEMO_TASKS': 'false',
                       'NEXUS_ORPHAN_TASK_RESCUE': 'false', 'NEXUS_USE_GITHUB_BOARD': 'false'}.items():
        command += ['--setenv', key, value]
    return command


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scope', choices=('server', 'web'))
    parser.add_argument('--dependencies')
    parser.add_argument('--node')
    parser.add_argument('--inner', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.inner:
        inner(args.scope)
        return
    if not (args.dependencies and args.node):
        parser.error('Explicit dependency-only node_modules and Node paths are required')
    dependencies = Path(args.dependencies).resolve(strict=True)
    if args.scope == 'web':
        # Empty mount points are setup metadata, not executable dependency edits.
        # They are overlaid by writable namespace-only caches during validation.
        for name in ('.tmp', '.vite-temp', '.vite'):
            target = dependencies / name
            if target.is_symlink():
                raise ValueError('Cache mount points must not be symlinks')
            target.mkdir(exist_ok=True)
    before = hashes(ROOT)
    with tempfile.TemporaryDirectory(prefix='nexus-public-check-') as temporary:
        scratch = Path(temporary)
        snapshot = scratch / 'source'
        for source in files(ROOT):
            target = snapshot / source.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        for path in ('.data', 'dist', 'server/node_modules', 'web-v2/node_modules'):
            (snapshot / path).mkdir(parents=True, exist_ok=True)
        (scratch / 'build').mkdir()
        (scratch / 'hosts').write_text('127.0.0.1 localhost\n::1 localhost\n')
        (scratch / 'nsswitch.conf').write_text('hosts: files\n')
        assert hashes(snapshot) == before
        command = prefix(snapshot, args.dependencies, args.node, scratch, args.scope)
        command += ['--chdir', '/work', '--', '/usr/bin/python3',
                    '/work/scripts/checks-offline.py', args.scope, '--inner']
        result = subprocess.run(command, env={'PATH': '/usr/bin:/bin'}, timeout=600)
        assert hashes(snapshot) == before, 'Snapshot changed during isolated checks'
        assert hashes(ROOT) == before, 'Source changed during isolated checks'
        if result.returncode:
            raise SystemExit(result.returncode)
    print('Source hashes preserved; providers, credentials and private home were unavailable.')


if __name__ == '__main__':
    main()
