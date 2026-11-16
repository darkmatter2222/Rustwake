#!/usr/bin/env python3
"""Unprivileged static delivery. Install beside deploy-artifact.py, outside checkout.

Requires the one-time stable nginx mount described in AUTOMATED_DELIVERY.md.
No Docker, sudo, SSH, Portainer credentials, or repository commands at runtime.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import time
import urllib.request
import urllib.parse

CONFIG = Path('/opt/rustwake-delivery/host-config.json')
REPO = 'darkmatter2222/Rustwake'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def atomic_json(path, data):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, sort_keys=True) + '\n')
    with tmp.open('rb') as stream:
        os.fsync(stream.fileno())
    tmp.replace(path)

def switch(root, target):
    link = root / '.next'
    link.unlink(missing_ok=True)
    link.symlink_to(target)
    link.replace(root / 'current')
    fd = os.open(root, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def get(url, token=None):
    headers = {'User-Agent': 'Rustwake-delivery', 'Cache-Control': 'no-cache'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as response:
        return response.read(256_000_001)

def eligible(sha):
    token = os.environ.get('RUSTWAKE_GITHUB_TOKEN')
    if not token:
        raise ValueError('Ephemeral read-only Actions token required')
    api = 'https://api.github.com/repos/' + REPO
    head = json.loads(get(api + '/git/ref/heads/main', token))['object']['sha']
    if head != sha:
        raise ValueError('Superseded candidate; deploy latest green main instead')
    runs = json.loads(get(api + '/actions/workflows/ci.yml/runs?event=push&branch=main&head_sha=' + sha, token))['workflow_runs']
    if not any(r['head_sha'] == sha and r['conclusion'] == 'success'
               and r['head_repository']['full_name'] == REPO for r in runs):
        raise ValueError('Successful same-repository main CI required')

def load_config():
    for path in (CONFIG.parent, CONFIG):
        st = path.lstat()
        if path.is_symlink() or st.st_uid != 0 or st.st_mode & 0o022:
            raise ValueError('Untrusted host configuration')
    config = json.loads(CONFIG.read_text())
    if config.get('repository') != REPO or config.get('root') != '/srv/rustwake-delivery':
        raise ValueError('Unexpected deployment ownership')
    if config.get('public_url') != 'https://home.darkmatter2222.com/rustwake/':
        raise ValueError('Unexpected public route')
    if config.get('local_url') != 'http://127.0.0.1:8700/':
        raise ValueError('Unexpected local route')
    return config

def current_target(root):
    current = root / 'current'
    if not current.is_symlink():
        raise ValueError('Stable serving layout has not been commissioned')
    target = current.resolve(strict=True)
    if target.parent != (root / 'releases').resolve() or not (target / 'index.html').is_file():
        raise ValueError('Unexpected current release')
    return target.relative_to(root).as_posix()

def verify_served(config, release):
    # Both routes must return exact bytes; a SPA fallback cannot masquerade as success.
    paths = ['index.html', 'team/index.html', 'team/status.json', 'release-manifest.json']
    manifest = release / 'release-manifest.json'
    if manifest.exists():
        paths += [f['path'] for f in json.loads(manifest.read_text())['files']
                  if f['path'].startswith('assets/')]
    else:
        paths = ['index.html']  # adopted baseline rollback
    for base in (config['local_url'], config['public_url']):
        for name in dict.fromkeys(paths):
            expected = (release / name).read_bytes()
            if get(base + urllib.parse.quote(name, safe='/') + '?delivery=' + digest(expected)[:12]) != expected:
                raise ValueError('Served bytes mismatch')

def app_digest(manifest):
    return digest(json.dumps([f for f in manifest['files'] if not f['path'].startswith('team/')],
                             sort_keys=True).encode())

def recover(root, config):
    pending = root / 'pending.json'
    if pending.exists():
        record = json.loads(pending.read_text())
        prior = record['prior']
        if not isinstance(prior, str) or not prior.startswith('releases/') or len(Path(prior).parts) != 2 or '..' in Path(prior).parts:
            raise ValueError('Invalid recovery record')
        switch(root, prior)
        verify_served(config, root / prior)
        atomic_json(root / 'state.json', record['prior_state'])
        pending.unlink()

def apply(root, config, directory, sha, manifest):
    recover(root, config)
    previous = current_target(root)
    state_path = root / 'state.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    package_hash = digest((directory / 'release-manifest.json').read_bytes())
    if state.get('source_sha') == sha:
        if state.get('manifest_digest') != package_hash:
            raise ValueError('Same source has different package')
        verify_served(config, root / previous)
        return {'source_sha': sha, 'status': 'unchanged', 'verified': True}
    release = root / 'releases' / (sha + '-' + package_hash[:16])
    if release == root / previous:
        raise ValueError('Active release lacks consistent state; reconcile before retry')
    if release.exists():
        shutil.rmtree(release)  # only our inactive failed attempt, never current
    if shutil.disk_usage(root).free < 1_000_000_000:
        raise ValueError('Less than 1GB free; retain rollback and raise maintenance ticket')
    shutil.copytree(directory, release)
    # Keep all historical content-addressed assets. Reject filename reuse with different bytes.
    for source in (release / 'assets').rglob('*') if (release / 'assets').exists() else []:
        if source.is_file():
            target = root / 'assets' / source.relative_to(release / 'assets')
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and digest(target.read_bytes()) != digest(source.read_bytes()):
                raise ValueError('Asset filename collision')
            if not target.exists():
                temp = target.with_name(target.name + '.pending')
                shutil.copyfile(source, temp)
                temp.chmod(0o644)
                temp.replace(target)
    if (release / 'assets').exists():
        shutil.rmtree(release / 'assets')
    (release / 'assets').symlink_to('../../assets')
    for path in release.rglob('*'):
        if not path.is_symlink():
            path.chmod(0o755 if path.is_dir() else 0o644)
    release.chmod(0o755)
    eligible(sha)  # recheck immediately before promotion
    game_digest = app_digest(manifest)
    status = 'dashboard-only' if state.get('game_digest') == game_digest else 'deployed'
    atomic_json(root / 'pending.json', {'prior': previous, 'prior_state': state})
    try:
        switch(root, release.relative_to(root))
        verify_served(config, release)
        atomic_json(state_path, {'source_sha': sha, 'manifest_digest': package_hash,
                    'game_digest': game_digest, 'game_source_sha': state.get('game_source_sha') if status == 'dashboard-only' else sha,
                    'verified_at': time.time(), 'previous': previous})
        (root / 'pending.json').unlink()
    except BaseException:
        recover(root, config)
        raise
    return {'source_sha': sha, 'status': status, 'verified': True}

def main():
    if len(sys.argv) != 4 or sys.argv[1] not in ('--preflight', '--apply'):
        raise ValueError('Expected --preflight|--apply ARTIFACT FULL_SHA')
    spec = importlib.util.spec_from_file_location('validator', Path(__file__).with_name('deploy-artifact.py'))
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    directory, sha = Path(sys.argv[2]).resolve(strict=True), sys.argv[3]
    manifest = validator.verify_artifact(directory, sha)
    config = load_config()
    root = Path(config['root'])
    if root.is_symlink() or (root / 'releases').is_symlink() or (root / 'assets').is_symlink():
        raise ValueError('Unsafe serving layout')
    eligible(sha)
    if sys.argv[1] == '--preflight':
        # Pending interrupted transactions are recovered by apply under the driver lock.
        current_target(root)
        print(json.dumps(dict(source_sha=sha, target_owned=True, release_eligible=True,
                              rollback_ready=True, monotonic_target=True, dashboard_isolated=True)))
    else:
        print(json.dumps(apply(root, config, directory, sha, manifest)))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Host delivery failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
