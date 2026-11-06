#!/usr/bin/env bash
# Run locally as root from a reviewed checkout; does not change Docker/Portainer/ingress.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo on Databrick.' >&2; exit 1; }
[[ $# -eq 1 ]] || { echo 'usage: sudo bash scripts/install-delivery-host.sh VERIFIED_CURRENT_STATIC_DIRECTORY' >&2; exit 1; }
seed=$(realpath -- "$1")
test -f "$seed/index.html"
id rustwake-runner >/dev/null
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
install -d -o root -g rustwake-runner -m 0750 /var/lib/rustwake-delivery
touch /var/lib/rustwake-delivery/deploy.lock
chown rustwake-runner:rustwake-runner /var/lib/rustwake-delivery/deploy.lock
chmod 0600 /var/lib/rustwake-delivery/deploy.lock
exec 9>/var/lib/rustwake-delivery/deploy.lock
flock -n 9
install -d -o root -g root -m 0755 /opt/rustwake-delivery
install -o root -g root -m 0755 "$repo_dir/scripts/deploy-artifact.py" /opt/rustwake-delivery/deploy-artifact.py
install -o root -g root -m 0755 "$repo_dir/scripts/host-adapter.py" /opt/rustwake-delivery/host-adapter
install -o root -g root -m 0644 "$repo_dir/deploy/nginx.conf" /opt/rustwake-delivery/nginx.conf
python3 - "$seed" <<'PY'
import json, os, pathlib, pwd, shutil, sys
root = pathlib.Path('/srv/rustwake-delivery')
seed = pathlib.Path(sys.argv[1])
if root.is_symlink():
    raise SystemExit('Unexpected symlink at serving root')
if not root.exists():
    if any(p.is_symlink() for p in seed.rglob('*')):
        raise SystemExit('Seed contains symlinks; inspect before adoption')
    root.mkdir(mode=0o755)
    (root/'releases').mkdir()
    shutil.copytree(seed, root/'releases'/'baseline')
    if (seed/'assets').exists():
        shutil.copytree(seed/'assets', root/'assets')
    else:
        (root/'assets').mkdir()
    (root/'current').symlink_to('releases/baseline')
    user = pwd.getpwnam('rustwake-runner')
    for p in [root, *root.rglob('*')]:
        os.chown(p, user.pw_uid, user.pw_gid, follow_symlinks=False)
        if not p.is_symlink():
            p.chmod(0o755 if p.is_dir() else 0o644)
elif not (root/'current').is_symlink():
    raise SystemExit('Existing layout incomplete; reconcile without overwriting')
config = pathlib.Path('/opt/rustwake-delivery/host-config.json')
if config.is_symlink():
    raise SystemExit('Unexpected symlink at host config')
expected = dict(repository='darkmatter2222/Rustwake', root=str(root),
                local_url='http://127.0.0.1:8700/', public_url='https://home.darkmatter2222.com/rustwake/')
if config.exists() and json.loads(config.read_text()) != expected:
    raise SystemExit('Existing host config differs; reconcile explicitly')
config.write_text(json.dumps(expected, indent=2)+'\n')
config.chmod(0o644)
PY
echo 'Installed static delivery components. Existing live service has NOT been modified.'
echo 'Next: adopt stable mount through the existing Rustwake Portainer stack; see docs/AUTOMATED_DELIVERY.md.'
