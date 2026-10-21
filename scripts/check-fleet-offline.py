"""Run only the opt-in external fleet regressions in the reviewed offline sandbox.

The original 330 server / 11 web checks remain in checks-offline.py unchanged.
Dependency installation and any hosted-runner namespace privilege setup happen
outside this helper; test children have no credentials, egress or capabilities.
"""
import argparse
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('nexus_original_offline_checks', ROOT / 'scripts/checks-offline.py')
checks = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checks)

# A linked worktree stores .git as a regular file. The original directory
# omission does not cover that form; extend export selection in this process
# without editing the original helper or admitting Git metadata to the sandbox.
original_files = checks.files


def export_files(root):
    for source in original_files(root):
        if source.relative_to(root).parts[0] != '.git':
            yield source


checks.files = export_files


def inner(scope):
    if Path(__file__).resolve() != Path('/work/scripts/check-fleet-offline.py'):
        raise ValueError('Fleet regressions require the reviewed namespace')
    checks.probe()
    assert os.environ.get('HOME') == '/home/fleet-test'
    assert not Path('/dev/dri').exists() and not list(Path('/dev').glob('nvidia*'))
    if scope == 'server':
        os.chdir('/work/server')
        checks.test_command(['/opt/node/bin/node', '--test', '--test-reporter=tap',
                             '--test-concurrency=1', 'test/externalFleet.regression.cjs'], 6)
    else:
        os.chdir('/work/web-v2')
        # The root tsconfig contains references only; use the existing browser
        # JSX transform for SSR imports without changing application sources.
        os.environ['TSX_TSCONFIG_PATH'] = '/work/web-v2/tsconfig.app.json'
        checks.test_command(['/opt/node/bin/node', '--import', 'tsx/esm', '--test',
                             '--test-reporter=tap', '--test-concurrency=1',
                             'test/fleetStatusBar.regression.ts'], 5)


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
    before = checks.hashes(ROOT)
    with tempfile.TemporaryDirectory(prefix='nexus-fleet-check-') as temporary:
        scratch = Path(temporary)
        snapshot = scratch / 'source'
        for source in export_files(ROOT):
            target = snapshot / source.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        for name in ('.data', 'dist', 'server/node_modules', 'web-v2/node_modules'):
            (snapshot / name).mkdir(parents=True, exist_ok=True)
        (scratch / 'build').mkdir()
        (scratch / 'hosts').write_text('127.0.0.1 localhost\n::1 localhost\n')
        (scratch / 'nsswitch.conf').write_text('hosts: files\n')
        assert checks.hashes(snapshot) == before
        original, staged, dependency_before = checks.stage_dependencies(dependencies, scratch / 'dependencies')
        if args.scope == 'web':
            # The original prefix overlays these namespace-only cache paths.
            # Add mount points only to the staged copy, never installed packages.
            for name in ('.tmp', '.vite-temp', '.vite'):
                target = staged / name
                if target.is_symlink():
                    raise ValueError('Cache mount points must not be symlinks')
                target.mkdir(exist_ok=True)
        staged_before = checks.dependency_manifest(staged)
        command = checks.prefix(snapshot, staged, args.node, scratch, args.scope)
        command += ['--dir', '/home/fleet-test', '--setenv', 'HOME', '/home/fleet-test',
                    '--chdir', '/work', '--', '/usr/bin/python3',
                    '/work/scripts/check-fleet-offline.py', args.scope, '--inner']
        result = subprocess.run(command, env={'PATH': '/usr/bin:/bin'}, timeout=180)
        assert checks.dependency_manifest(original) == dependency_before, 'Installed dependencies changed'
        assert checks.dependency_manifest(staged) == staged_before, 'Staged dependencies changed'
        assert checks.hashes(snapshot) == before, 'Snapshot changed during fleet checks'
        assert checks.hashes(ROOT) == before, 'Source changed during fleet checks'
        if result.returncode:
            raise SystemExit(result.returncode)
    print('Fleet extras passed; source/dependency hashes preserved; no providers, credentials or external network.')


if __name__ == '__main__':
    main()
