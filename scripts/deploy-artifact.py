#!/usr/bin/env python3
"""Install a reviewed copy at /opt/rustwake-delivery; never run from an artifact.
The machine-specific adapter is deliberately absent until local discovery/bootstrap.
"""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

ADAPTER = Path('/opt/rustwake-delivery/host-adapter')
LOCK = Path('/var/lib/rustwake-delivery/deploy.lock')

def verify_artifact(directory, sha):
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('Expected full source SHA')
    directory = Path(directory).resolve(strict=True)
    manifest_path = directory / 'release-manifest.json'
    if manifest_path.is_symlink():
        raise ValueError('Manifest cannot be a symlink')
    if manifest_path.stat().st_size > 2_000_000:
        raise ValueError('Manifest exceeds bound')
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('version') != 1 or manifest.get('source_sha') != sha:
        raise ValueError('Manifest identity mismatch')
    files = manifest.get('files')
    if not isinstance(files, list) or not 1 <= len(files) <= 10000:
        raise ValueError('Invalid file inventory')
    declared = set()
    total = 0
    for item in files:
        name = item.get('path', '')
        if not isinstance(name, str) or not name or '\\' in name or name.startswith('/') or any(p in ('..', '.', '') for p in name.split('/')):
            raise ValueError('Invalid artifact path')
        target = directory / name
        if name in declared or target.is_symlink() or not target.is_file() or directory not in target.resolve().parents:
            raise ValueError('Duplicate or unsafe artifact file')
        if target.stat().st_size != item.get('bytes'):
            raise ValueError('Artifact size mismatch')
        total += target.stat().st_size
        if total > 256_000_000:
            raise ValueError('Artifact exceeds 256MB bound')
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        if digest != item.get('sha256'):
            raise ValueError('Artifact digest mismatch')
        declared.add(name)
    actual = set()
    for target in directory.rglob('*'):
        if target.is_symlink():
            raise ValueError('Artifact symlink forbidden')
        if target.is_file():
            actual.add(target.relative_to(directory).as_posix())
    if actual != declared | {'release-manifest.json'}:
        raise ValueError('Undeclared artifact files')
    if not {'index.html', 'team/index.html', 'team/status.json'} <= declared:
        raise ValueError('Game and dashboard entries required')
    return manifest

def trusted_adapter():
    for entry in (ADAPTER.parent, ADAPTER):
        s = entry.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022:
            raise ValueError('Host adapter must be root owned and not group/other writable')
    if not os.access(ADAPTER, os.X_OK):
        raise ValueError('Host adapter is not executable')

def call_adapter(action, directory, sha):
    # No command text from repository data. No inherited provider/GitHub secrets.
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}
    result = subprocess.run([str(ADAPTER), action, str(directory), sha], env=env,
                            capture_output=True, text=True, timeout=900, check=False)
    if result.returncode:
        # Adapter owns protected detailed logs; never echo credential-bearing output.
        raise RuntimeError('Host adapter failed; inspect protected local operation log')
    data = json.loads(result.stdout)
    if not isinstance(data, dict) or data.get('source_sha') != sha:
        raise ValueError('Host adapter response identity mismatch')
    return data

def run(directory, sha, receipt):
    status = {'source_sha': sha, 'status': 'blocked', 'verified_at': None}
    try:
        verify_artifact(directory, sha)
        trusted_adapter()
        with LOCK.open('a') as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            preflight = call_adapter('--preflight', directory, sha)
            required = ('target_owned', 'release_eligible', 'rollback_ready', 'monotonic_target', 'dashboard_isolated')
            if any(preflight.get(k) is not True for k in required):
                raise ValueError('Host preflight did not establish every release gate')
            result = call_adapter('--apply', directory, sha)
            if result.get('status') not in ('deployed', 'dashboard-only', 'unchanged') or result.get('verified') is not True:
                raise ValueError('Host adapter did not verify promotion')
            status.update(status=result['status'], verified_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                          game_url='https://home.darkmatter2222.com/rustwake/',
                          dashboard_url='https://home.darkmatter2222.com/rustwake/team/')
    except Exception as error:
        status['error_class'] = type(error).__name__
        raise
    finally:
        target = Path(receipt)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(status, indent=2) + '\n')
        temporary.replace(target)

if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('usage: deploy-artifact.py ARTIFACT_DIR FULL_SHA RECEIPT_PATH')
    try:
        run(Path(sys.argv[1]).resolve(), sys.argv[2], sys.argv[3])
    except Exception as error:
        print('Delivery blocked: ' + type(error).__name__ + '; inspect local adapter setup/operation log.', file=sys.stderr)
        raise SystemExit(1)
