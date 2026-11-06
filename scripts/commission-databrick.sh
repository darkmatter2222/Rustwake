#!/usr/bin/env bash
# Run as the gh-authenticated owner on Databrick, not as root.
set -Eeuo pipefail
trap 'echo "Commissioning stopped; deployment is NOT confirmed. Paste the output back." >&2' ERR
REPO=darkmatter2222/Rustwake
gh auth status
sudo -v
sudo docker compose version >/dev/null
gh variable set RUSTWAKE_CD_ENABLED --body false --repo "$REPO"
ACTIVE="$(gh run list --repo "$REPO" --workflow delivery.yml --limit 100 --json status --jq '[.[] | select(.status != "completed")] | length')"
[[ "$ACTIVE" == 0 ]] || { echo 'A delivery run is active. Let it finish before rerunning.'; exit 1; }

sudo python3 - <<'HOST_PY'
import datetime
import fcntl
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import warnings

os.umask(0o077)
API = 'http://192.168.86.50:9000/api'
LOCAL = 'http://127.0.0.1:8700/'
HTTPS = 'https://home.darkmatter2222.com/rustwake/'
token = None

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def username_prompt():
    # /dev/tty is nonseekable. Text r+ mode fails on Linux; open read-only.
    sys.stderr.write('Portainer username [admin]: ')
    sys.stderr.flush()
    with open('/dev/tty', 'r') as tty:
        value = tty.readline()
    require(value != '', 'No interactive terminal input available.')
    return value.strip() or 'admin'

def docker(*args):
    result = subprocess.run(['docker', *args], capture_output=True, text=True)
    require(result.returncode == 0, 'Docker check failed: ' + ' '.join(args[:2]))
    return result.stdout.strip()

def api(path, method='GET', data=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(API + path, headers=headers, method=method,
        data=None if data is None else json.dumps(data).encode())
    with urllib.request.urlopen(request, timeout=180) as response:
        body = response.read()
        return json.loads(body) if body else None

def fetch(url):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read(), response.headers

def owned_container():
    matches = []
    for cid in docker('ps', '-q', '--filter', 'label=app=rustwake').split():
        item = json.loads(docker('inspect', cid))[0]
        labels = item['Config'].get('Labels') or {}
        if labels.get('repo') == 'Rustwake' and labels.get('env') == 'databrick':
            matches.append(item)
    require(len(matches) == 1, 'Expected exactly one running Rustwake-owned container.')
    return matches[0]

def mount_map(container):
    return {m['Destination']: m for m in container['Mounts'] if m['Type'] == 'bind'}

def main():
    global token
    lock = open('/var/lib/rustwake-delivery/deploy.lock', 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    for name in ('host-adapter', 'deploy-artifact.py', 'host-config.json', 'nginx.conf'):
        path = Path('/opt/rustwake-delivery') / name
        require(path.is_file() and not path.is_symlink(), 'Missing trusted file: ' + name)
        st = path.stat()
        require(st.st_uid == 0 and not st.st_mode & 0o022, 'Unsafe ownership: ' + name)
    container = owned_container()
    mounts = mount_map(container)
    require(container['Config']['Labels'].get('com.docker.compose.project') == 'rustwake',
            'Unexpected Compose project.')
    require(Path('/srv/rustwake-delivery/current/index.html').is_file(), 'Seeded release missing.')
    expected = {
        '/srv/rustwake-delivery': '/srv/rustwake-delivery',
        '/etc/nginx/conf.d/default.conf': '/opt/rustwake-delivery/nginx.conf',
    }
    baseline, _ = fetch(LOCAL)
    https_baseline, _ = fetch(HTTPS)
    require(baseline == https_baseline, 'Local and hostname HTTPS bytes differ.')
    if all(target in mounts and mounts[target]['Source'] == source and not mounts[target]['RW']
           for target, source in expected.items()):
        _, headers = fetch(HTTPS)
        require('no-store' in headers.get('Cache-Control', ''), 'Missing no-store header.')
        print('Stable mounts already active; proceeding to canary.')
        return
    require('/usr/share/nginx/html' in mounts, 'Original static mount missing.')
    require('/etc/nginx/conf.d/default.conf' in mounts, 'Original nginx config mount missing.')
    print('Enter Portainer credentials. Credentials are not saved.', flush=True)
    username = username_prompt()
    warnings.simplefilter('error', getpass.GetPassWarning)
    password = getpass.getpass('Portainer password: ')
    token = api('/auth', 'POST', {'Username': username, 'Password': password})['jwt']
    password = None
    matches = []
    for stack in api('/stacks'):
        if stack.get('Name') != 'rustwake' or stack.get('Type') != 2:
            continue
        remote = api(f"/endpoints/{stack['EndpointId']}/docker/containers/json?all=1")
        if any(c['Id'] == container['Id'] for c in remote):
            matches.append(stack)
    require(len(matches) == 1, 'Could not uniquely match the Portainer stack to this host.')
    stack = api('/stacks/' + str(matches[0]['Id']))
    require(not stack.get('GitConfig'), 'Stack is Git-managed; refusing to override its source.')
    sid, endpoint = stack['Id'], stack['EndpointId']
    file_path = f'/stacks/{sid}/file'
    original = api(file_path)['StackFileContent']
    candidate = original
    for old, new in (
        (mounts['/usr/share/nginx/html']['Source'] + ':/usr/share/nginx/html:ro',
         '/srv/rustwake-delivery:/srv/rustwake-delivery:ro'),
        (mounts['/etc/nginx/conf.d/default.conf']['Source'] + ':/etc/nginx/conf.d/default.conf:ro',
         '/opt/rustwake-delivery/nginx.conf:/etc/nginx/conf.d/default.conf:ro'),
    ):
        require(candidate.count(old) == 1, 'Unexpected Compose mount format; refusing ambiguous edit.')
        candidate = candidate.replace(old, new, 1)
    result = subprocess.run(['docker', 'compose', '-f', '-', 'config', '--no-interpolate', '--quiet'],
                            input=candidate, text=True, capture_output=True)
    require(result.returncode == 0, 'Compose validation failed; live stack unchanged.')
    user = container['Config'].get('User')
    require(user and user not in ('root', '0', '0:0'), 'Expected existing nonroot nginx user.')
    command = ['run', '--rm', '--pull=never', '--network', 'none', '--read-only',
               '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
               '--entrypoint', 'nginx', '--user', user]
    for destination, options in (container['HostConfig'].get('Tmpfs') or {}).items():
        command += ['--tmpfs', destination + (':' + options if options else '')]
    for mount in container['Mounts']:
        require(mount['Type'] == 'bind', 'Unexpected mount type.')
        source, destination = mount['Source'], mount['Destination']
        if destination == '/usr/share/nginx/html':
            source = destination = '/srv/rustwake-delivery'
        elif destination == '/etc/nginx/conf.d/default.conf':
            source = '/opt/rustwake-delivery/nginx.conf'
        command += ['--volume', source + ':' + destination + (':rw' if mount['RW'] else ':ro')]
    command += [container['Image'], '-t']
    test = subprocess.run(['docker', *command], capture_output=True, text=True)
    require(test.returncode == 0, 'Candidate nginx validation failed:\n' + test.stderr[-2000:])
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = Path('/var/lib/rustwake-delivery') / ('commissioning-' + stamp)
    backup.mkdir(mode=0o700)
    (backup/'original-compose.yaml').write_text(original)
    (backup/'candidate-compose.yaml').write_text(candidate)
    (backup/'stack-env.json').write_text(json.dumps(stack.get('Env') or []))

    def update(content):
        return api(f'/stacks/{sid}?endpointId={endpoint}', 'PUT', {
            'StackFileContent': content, 'Env': stack.get('Env') or [],
            'Prune': False, 'PullImage': False, 'RepullImageAndRedeploy': False,
        })

    def verify(new):
        current = mount_map(owned_container())
        if new:
            require(all(target in current and current[target]['Source'] == source
                        and not current[target]['RW'] for target, source in expected.items()),
                    'Waiting for new mounts.')
        else:
            require(current.get('/usr/share/nginx/html', {}).get('Source') ==
                    mounts['/usr/share/nginx/html']['Source'], 'Waiting for original mounts.')
        for base in (LOCAL, HTTPS):
            body, headers = fetch(base)
            require(body == baseline, 'Game bytes changed during mount adoption.')
            if new:
                require('no-store' in headers.get('Cache-Control', ''), 'Missing no-store header.')
        body, _ = fetch(LOCAL + 'healthz')
        require(body.strip() == b'ok', 'Health check failed.')

    def wait_for(new):
        for _ in range(60):
            try:
                verify(new)
                return
            except Exception:
                time.sleep(2)
        raise RuntimeError('Mount/HTTP verification timed out.')

    require(api(file_path)['StackFileContent'] == original, 'Stack changed concurrently.')
    try:
        print('Updating only the existing Rustwake stack...', flush=True)
        update(candidate)
        wait_for(True)
    except Exception:
        print('Adoption failed; checking scoped rollback...', flush=True)
        require(api(file_path)['StackFileContent'] in (original, candidate),
                'Concurrent stack edit detected. No overwrite performed. Backup: ' + str(backup))
        update(original)
        wait_for(False)
        raise RuntimeError('Original mounts restored. Automatic delivery remains disabled.')
    print('PASS: stable mounts verified. Rollback backup:', backup)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('STOPPED:', str(error) if isinstance(error, RuntimeError)
              else type(error).__name__ + ': ' + str(getattr(error, 'reason', '')))
        raise SystemExit(1)
HOST_PY

python3 - <<'ACTIONS_PY'
import datetime
import json
import subprocess
import time
REPO = 'darkmatter2222/Rustwake'
def gh(*args):
    return subprocess.check_output(['gh', *args], text=True).strip()
def api(path):
    return json.loads(gh('api', path))
def head():
    return api(f'repos/{REPO}/git/ref/heads/main')['object']['sha']
print('Waiting for successful main CI...', flush=True)
sha = head()
for _ in range(90):
    sha = head()
    runs = api(f'repos/{REPO}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha={sha}&per_page=10')['workflow_runs']
    if runs:
        latest = max(runs, key=lambda r: r['id'])
        if latest['status'] == 'completed':
            if latest['conclusion'] != 'success':
                raise SystemExit('Main CI failed. Automatic delivery remains disabled.')
            break
    time.sleep(10)
else:
    raise SystemExit('CI wait timed out. Automatic delivery remains disabled.')
started = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=2)
gh('workflow', 'run', 'delivery.yml', '--repo', REPO, '--ref', 'main')
run = None
for _ in range(30):
    runs = api(f'repos/{REPO}/actions/workflows/delivery.yml/runs?event=workflow_dispatch&branch=main&per_page=20')['workflow_runs']
    candidates = [r for r in runs if r['head_sha'] == sha and
                  datetime.datetime.fromisoformat(r['created_at'].replace('Z', '+00:00')) >= started]
    if candidates:
        run = min(candidates, key=lambda r: r['id'])
        break
    time.sleep(2)
if run is None:
    raise SystemExit('Canary run not identified. Automatic delivery remains disabled.')
print('Canary:', run['html_url'], flush=True)
subprocess.run(['gh', 'run', 'watch', str(run['id']), '--repo', REPO, '--exit-status'], check=True)
jobs = api(f"repos/{REPO}/actions/runs/{run['id']}/jobs")['jobs']
if not any(j['name'] == 'deploy' and j['conclusion'] == 'success' for j in jobs):
    raise SystemExit('No successful deploy job. Automatic delivery remains disabled.')
gh('variable', 'set', 'RUSTWAKE_CD_ENABLED', '--body', 'true', '--repo', REPO)
print('SUCCESS: canary deployment passed; automatic delivery enabled.')
print('Game: https://home.darkmatter2222.com/rustwake/')
print('Dashboard: https://home.darkmatter2222.com/rustwake/team/')
print('Verified run:', run['html_url'])
print('Hostname HTTPS was checked from Databrick; external Internet reachability is a separate check.')
ACTIONS_PY
