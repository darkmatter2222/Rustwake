# Automatic delivery and the public team dashboard

## Implemented versus activated

`.github/workflows/delivery.yml` packages the exact source SHA after a successful `ci` run caused by a same-repository push to main. It builds on a GitHub-hosted runner, adds a sanitized dashboard at `dist/team/`, inventories SHA-256/size for every file, then sends that artifact to a dedicated self-hosted deployment runner. It never executes PR code, checks out repository source, runs npm, or loads repository shell scripts on the server runner.

**Activation is pending local bootstrap.** No runner, host adapter, repository variable, server mount or dashboard route has been installed by this repository update. The intended URL is `https://home.darkmatter2222.com/rustwake/team/`; do not call it live until an actual GET and browser check succeeds. No additional OpenCode plugin is needed for CI/CD: this uses GitHub Actions plus its official runner application.

The workflow is disabled until repository variable `RUSTWAKE_CD_ENABLED` equals `true`. Missing setup fails closed. This is a commissioning switch, not a recurring human approval. The local release engineer is authorized to perform the scoped bootstrap autonomously using HomeAILab's existing access, then enable it after the canary. Do not ask the sponsor to repeat already-granted deployment permission. Actual missing credentials/admin capability must be reported precisely while other work continues.

## Bootstrap assignment for local release engineer

1. Read HomeAILab's current local AGENTS/skills and Rustwake's latest deployment receipt. OPS-013 records the existing route, Portainer endpoint 3, stack `rustwake`/125, host 8700, nonroot static container and release-bind pattern. These are discovery hints, not permission to trust stale IDs. Inspect live ownership and health before mutation. Do not recreate the stack or change shared DNS/ingress merely to install automation.
2. Provision a dedicated Linux x64 GitHub Actions runner, scoped only to Rustwake, label `rustwake-deploy`. Prefer an isolated account/container/VM with only the Rustwake deployment capability, never unrestricted Docker socket access. Follow GitHub's current official repository Settings → Actions → Runners instructions or authenticated administrative CLI equivalent. Do not write registration tokens into Git. Install the runner as a managed service and verify outbound GitHub connectivity. Do not attach PR jobs to this runner.
3. Create the `rustwake-databrick` GitHub environment with an allowed main-branch deployment policy. Preserve existing required policies. No new manual review requirement is introduced by this workflow. Configure the repository variable only after step 7. Installation of the official runner may require repository administrator privileges unavailable through this chat connection; the local authorized account must supply them.
4. Install a reviewed copy of `scripts/deploy-artifact.py` as root-owned `/opt/rustwake-delivery/deploy-artifact.py`, executable, with its containing directory not writable by the runner. Create `/var/lib/rustwake-delivery/deploy.lock` with narrowly scoped runner write access. This lock must also be used by manual/OpenCode deployments. GitHub workflow concurrency alone cannot lock out a local agent.
5. Implement and commission `/opt/rustwake-delivery/host-adapter` against the **discovered current environment**, following the contract below. The adapter intentionally is not fabricated by this cloud update: live compose, credential access and deployment ownership are local facts. Store credentials outside repo/artifact/runner workspace using HomeAILab conventions. The adapter itself and containing path must be root-owned and not group/other writable. Do not bypass the driver by pointing at arbitrary repo scripts.
6. Add one narrowly scoped persistent dashboard mount/location inside the Rustwake-owned static service so dashboard-only updates need no game-container recreation. Keep the directory stable; atomically replace `status.json`, then `index.html`. Set `Cache-Control: no-store` for dashboard and game HTML, retain immutable caching for hashed assets. Preserve previously referenced hashed assets through at least the prior release's client lifetime to fix the recorded old-client missing-asset defect. Validate nginx, backup scoped changes, smoke existing app and unrelated routes, and prove rollback. No new public ports or DNS needed.
7. Run a local canary with a hosted-built artifact through the installed driver. Confirm invalid digest rejected, wrong target/old source blocked, simultaneous manual deploy excluded, no-op works, dashboard-only publication does not restart the game, main game promotion works, rollback works, existing routes stay healthy, and both `/rustwake/` and `/rustwake/team/` serve the expected files. Record sanitized receipts. Once these pass, set `RUSTWAKE_CD_ENABLED=true` through the authorized repo administrative path. Next successful main push activates automatic delivery. The workflow must exist on default branch for `workflow_run` to trigger.
8. Verify one actual successful Actions run and server receipt. Release engineer imports that receipt into `work/deployments/`, updates README with verified live dashboard URL and dashboard/game source revisions separately, and then uses CI as the default promotion owner. No parallel manual promotions outside the shared lock. Remove the activation blocker only on evidence.

## Host-adapter contract

Invocation is a fixed argument vector, without shell interpolation:

```text
/opt/rustwake-delivery/host-adapter --preflight ARTIFACT_DIR FULL_SHA
/opt/rustwake-delivery/host-adapter --apply ARTIFACT_DIR FULL_SHA
```

The driver has already checked complete manifest inventory, digests, byte sizes, path traversal, symlinks, full source identity and a 256 MB bound. The adapter must still treat the artifact as static data, not executable instructions. The hosted manifest binds file bytes to the packaged source; the adapter must also verify release eligibility through trusted GitHub CI/status data for that SHA and the same repository's main ancestry. Store last deployed source/artifact digests locally and reject downgrade/replay after a newer release. Dashboard source and game source may differ; keep their monotonic records separate.

`--preflight` performs read-only checks and returns one JSON object on stdout:

```json
{"source_sha":"FULL_SHA","target_owned":true,"release_eligible":true,"rollback_ready":true,"monotonic_target":true,"dashboard_isolated":true}
```

Every boolean must be true. Required branch checks and affected-scope QA/product release policy remain mandatory. Do not assume every technically green experimental main commit is gameplay-release eligible: a trusted eligible-release receipt must cover the exact game-content digest, or its production source SHA with byte-equivalent package mapping. Dashboard-only status updates may publish independently. Avoid a self-referential commit-SHA requirement in the receipt; record tested source and exact app-content digest, then verify the built package against it.

`--apply` under the held cross-process lock must:

- Recheck ownership/config hashes; create only a unique Rustwake release directory, never overwrite a prior release.
- Compare app-content digest excluding `team/**` and `release-manifest.json`; if unchanged, publish dashboard atomically without recreating or redeploying the game. Never report a new game SHA merely because status changed.
- If game content changed and eligible, preserve cached-client asset availability, stage/health-check, update only Rustwake's existing bind and release label using verified Portainer APIs, then verify final served hashes, HTTPS and a touch-sized gameplay smoke. Latest-known receipt warns bind-only updates may not recreate; include the actual release label change if using that pattern.
- Compare unrelated-route health before/after. On failure restore only this operation's owned changes, respecting concurrent shared-config changes. No fleet cleanup or broad compose down.
- Write detailed protected local operation logs and a sanitized deployment record. Return one small JSON result: `{"source_sha":"FULL_SHA","status":"deployed|dashboard-only|unchanged","verified":true}`. Exit nonzero on any failure; never print credentials, environment dumps or raw API authentication output.

The driver only publishes allowlisted receipt fields plus error class, not arbitrary adapter output. Timeouts require adapter-owned cleanup/rollback recovery; process termination does not prove a deploy was undone. On restart reconcile pending operations before promotion. Retain bounded known-good releases and asset grace periods.

## Public dashboard and privacy

`node scripts/package-dashboard.mjs FULL_SHA` requires a built `dist/index.html`, generates `/team/index.html` and `/team/status.json`, then generates `release-manifest.json`. HTML auto-refreshes every 60 seconds and displays snapshot age/staleness. It does not claim a direct real-time connection to OpenCode. GitHub board publication should refresh operational evidence at the configured cadence; the delivered dashboard follows successful delivery events.

Public fields are deliberately allowlisted: ticket ID, stage, known role, prospective points, and an explicitly approved `public_title`. Ordinary private ticket titles, sponsor requests, acceptance prose, evidence paths, session IDs, local paths and infrastructure details are excluded. Product owner may add a deliberately public title after reviewing it for exposure; otherwise the dashboard says “Work item”. Never copy the full `work/` directory, inbox or canonical backlog into `dist/`. The authenticated GitHub board retains full detail.

## Checks and references

```sh
node --test scripts/package-dashboard.test.mjs
python scripts/deploy-artifact.test.py
```

These verify packaging/privacy and manifest failure cases, not actual server delivery. Local integration/canary evidence remains required.

Official references: [workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run), [self-hosted runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners), [adding a runner](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners). Pin and audit action versions under the repository's dependency policy before commissioning a privileged runner.
