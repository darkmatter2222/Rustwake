# Automatic delivery on Databrick

## Verified status — 2026-11-06

Automatic delivery is enabled. Databrick's stable mounts were verified and [canary run 42144401481](https://github.com/darkmatter2222/Rustwake/actions/runs/42144401481) successfully packaged and deployed source `891ff04dc994ec9b1cffc5035ccb9ad0d38effe3`. The sponsor's successful commissioning output confirms `RUSTWAKE_CD_ENABLED=true`. Hostname HTTPS checks use Databrick's LAN hosts override; external Internet reachability and browser/visual quality are separate checks.

The normal operation is to push reviewed work to main, then monitor CI and delivery. No extra OpenCode plugin or manual server deployment is needed. All eight agent personas share this contract. Keep bootstrap steps below only for recovery/new-host commissioning; do not rerun them on every assignment. Record any remaining rollback, browser, real-device or external reachability tests separately rather than resetting the completed host setup to pending.

## Recurring delivery contract

1. Developers and independent reviewers complete affected-scope tests, visual/gameplay review and product decisions **before** publishing gameplay changes to main. Inspect actual screenshots and motion; green CI is not proof of beautiful graphics or strategic play. Keep experiments off main until eligible for production.
2. A successful same-repository main-push `ci` run triggers `delivery` when repository variable `RUSTWAKE_CD_ENABLED=true`. Failed CI and pull requests cannot deploy. Manual `workflow_dispatch` on main permits commissioning/recovery; the adapter independently requires successful CI for that exact latest main SHA.
3. GitHub-hosted packaging builds the immutable source and creates the public dashboard and complete hash manifest. The self-hosted job downloads static data only: no checkout, npm, repository shell scripts, Docker socket or sudo.
4. The root-installed driver validates inventory/digests and holds the shared file lock. The adapter uses the job's short-lived read-only GitHub token to check current main and successful CI. No personal GitHub login or Portainer secret is copied into the runner. A superseded source fails closed; the newer green run takes over.
5. A release is staged in `/srv/rustwake-delivery/releases/`. One atomic `current` symlink switch promotes it through the existing nginx service. Historical `/assets/` files remain available; different bytes under an existing asset filename are rejected. HTML/dashboard use `no-store`. No container restarts or DNS edits occur per release.
6. Exact entry/dashboard/manifest and asset bytes are checked through loopback and HTTPS. Failure restores the previous symlink and verifies rollback. A durable pending record allows the next attempt to reconcile interrupted promotion. The driver uploads a sanitized receipt, even on failure. Job failure alone never proves rollback succeeded: inspect recovery state and receipt.
7. The release engineer monitors run results asynchronously, imports sanitized evidence into `work/deployments/`, and updates README/board. Distinguish pushed, CI-passed, packaged, deployed and browser-reviewed. Dashboard-only byte-equivalent game updates preserve the recorded game-source SHA in server state. Every successful package has its own source SHA.

All production source changes on main are intended for automatic release after CI; there is no extra undocumented discretionary promotion gate. Product/visual approval belongs before main publication. These instructions supersede the earlier unimplemented Portainer-per-release adapter contract.

## Recovery reference: one-time commissioning — local release engineer

Use `C:\Users\ryans\source\repos\HomeAILab` and its current instructions/credential helpers. Do not echo credentials. Acquire the sole release lease, pause manual promotions and record the old Rustwake compose/config and route health. Read `docs/DEPLOYMENT.md` for shared-host boundaries.

1. Verify the live Portainer endpoint, Rustwake stack/container ownership, current static bind source and current nginx config. Prior receipt hints: endpoint 3, stack 125, host port 8700, `rustwake-static-1`, labels `app=rustwake`, `repo=Rustwake`, `env=databrick`. Discover rather than blindly trust these values. Confirm the actual bind source contains only public built files; never seed from the whole repository or an environment/config directory.
2. Transfer a reviewed checkout's `scripts/install-delivery-host.sh`, `scripts/deploy-artifact.py`, `scripts/host-adapter.py`, and `deploy/nginx.conf` to Databrick preserving those paths. Run the installer from that checkout as root with the verified current static directory:

   ```sh
   sudo bash scripts/install-delivery-host.sh /absolute/path/to/verified/current/static/files
   ```

   This seeds the existing game, installs root-owned code/config under `/opt/rustwake-delivery`, and grants the runner write access only to Rustwake delivery content and its lock. It does **not** touch containers or ingress. It preserves an existing initialized layout on rerun; interrupted/ambiguous layout requires reconciliation. Do not give `rustwake-runner` sudo, Docker group membership or the owner's gh credentials.
3. Through the existing Rustwake Portainer stack, replace only its static-content mount with `/srv/rustwake-delivery:/srv/rustwake-delivery:ro`, and its nginx server-config mount with `/opt/rustwake-delivery/nginx.conf:/etc/nginx/conf.d/default.conf:ro`. Preserve image, nonroot user, read-only rootfs, tmpfs, healthcheck, limits, labels, port 8700:8080 and all unrelated settings. Validate the supplied config against the actual image before promotion. The shared ingress already strips `/rustwake/`; verify that behavior. Back up the exact old compose; use its original mounts to roll back commissioning. Keep Portainer authoritative; do not recreate containers behind its back.
4. Verify old game bytes still serve through localhost and HTTPS, `/healthz` succeeds, HTML has `Cache-Control: no-store`, and unaffected baseline routes remain healthy. The seeded old game may not have a dashboard yet. Mount the **parent directory**, never `current` itself: bind-mounting a resolved symlink would pin the old release.
5. Ensure the `rustwake-databrick` GitHub environment allows main and preserves existing protection policies. Wait for latest main CI success. Run the manual canary (repository administrative commands run as the already-authenticated owner, not the runner):

   ```sh
   gh workflow run delivery.yml --repo darkmatter2222/Rustwake --ref main
   gh run list --repo darkmatter2222/Rustwake --workflow delivery.yml --limit 5
   # Watch the exact newly created run ID, then inspect/download its receipt:
   gh run watch RUN_ID --repo darkmatter2222/Rustwake --exit-status
   gh run download RUN_ID --repo darkmatter2222/Rustwake --pattern 'rustwake-deployment-*'
   ```

6. Prove an actual deploy, repeated delivery/no-op, a dashboard-only update, rollback on deliberately failed verification in an isolated test layout, invalid manifest rejection and cross-process lock exclusion. Run browser smoke at mobile size against the real game and dashboard; inspect console, route refresh, controls and save continuity. Do not inject deliberate failures into unrelated services. Preserve sanitized evidence. Unit tests are supporting evidence, not a substitute for commissioning.
7. After the canary and checks pass, enable automatic delivery:

   ```sh
   gh variable set RUSTWAKE_CD_ENABLED --body true --repo darkmatter2222/Rustwake
   gh workflow run databrick-readiness.yml --repo darkmatter2222/Rustwake --ref main
   ```

8. Publish the commissioning receipt/README/board through normal main integration and observe that push complete automatic delivery. Only then close OPS-102 and describe automatic delivery as working. Report the exact failed step if host/admin access is unavailable; keep independent development slots productive.

## Operations and recovery

- One deployment owner: Actions. Manual emergency work must take `/var/lib/rustwake-delivery/deploy.lock` and preserve monotonic release state. No parallel legacy publisher/deployer promotion.
- Pause automatic triggers with `gh variable set RUSTWAKE_CD_ENABLED --body false --repo darkmatter2222/Rustwake`. This does not cancel an in-flight or manual job. Inspect it before touching the host.
- `pending.json` means an interrupted transaction; installed adapter restores the prior release on its next apply. Inspect `state.json` and served bytes before claiming recovery. Rollback failures stay visibly blocked.
- Assets are intentionally retained, with no automatic destructive pruning in this first adapter. Cache lifetime is seven days; cleanup must additionally account for long-lived clients. A release engineer may implement measured retention under a separate reviewed change. Below 1 GB free, publication blocks and creates a maintenance task rather than deleting rollback material. Track disk growth and archive old releases deliberately.
- Code in `/opt/rustwake-delivery` does not auto-update from pushed source. Changes to trusted deployment code require a reviewed local installer rerun; document installed-source provenance. Application releases remain automatic.
- `databrick-readiness` proves runner execution and file presence only, not successful delivery. Its failed first run is useful diagnostic evidence, not a broken runner installation.
- External HTTP hash checks do not establish visual quality, audible sound or real-device performance. QA must still inspect/play/listen where supported and label unverified aspects honestly.

## Public dashboard

Intended URL: https://home.darkmatter2222.com/rustwake/team/ . First delivery verified by canary run 42144401481; browser visual review remains separate. Packaging exposes only allowlisted fields (ticket ID, stage, role, prospective points, approved public title and aggregate metrics). Never serve raw backlog, inbox, session IDs, credentials or host diagnostics. Dashboard snapshots refresh every 60 seconds and display age; they are not a direct live OpenCode feed.

## Tests

```sh
python3 scripts/deploy-artifact.test.py
python3 scripts/host-adapter.test.py
bash -n scripts/install-delivery-host.sh
node --test scripts/package-dashboard.test.mjs
```

[GitHub runner service documentation](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application) · [nginx root documentation](https://nginx.org/en/docs/http/ngx_http_core_module.html#root)
