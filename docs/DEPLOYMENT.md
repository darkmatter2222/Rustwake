# Rustwake on Databrick — safe adoption and recurring releases

## Automatic delivery update

`docs/AUTOMATED_DELIVERY.md` is authoritative for the new Actions delivery path and commissioning status. The runner executed a job on 2026-11-06; production adapter installation is still pending. Once commissioned, releases use a stable parent mount and atomic static-file promotion, not a Portainer bind change per release. Preserve the discovery/ownership/rollback guidance below for initial adoption and recovery.

## Historical deployment evidence

The latest checked repository receipt, [OPS-007](../work/deployments/OPS-007-g1.json), records deployment of `4c30fb4e247fe2a9da400b8e778296f422d6721e` at [https://home.darkmatter2222.com/rustwake/](https://home.darkmatter2222.com/rustwake/), verified 2026-11-04T19:16:00Z with served asset hashes and external checks. This is receipt-backed status, not a new live check by the team-configuration update. Newer main work may not be deployed.

Rustwake already exists. Read the newest receipt and inspect current ownership before any change; do not repeat initial installation. Local HomeAILab access was demonstrated by the local deployment agent; the earlier cloud workspace limitation is not a blocker for that local agent. Release engineer now owns this lane; legacy deployer is a mutually exclusive compatibility mode. Use the safety protocol below for any adoption/recovery, not as a reason to recreate a healthy stack.

## Verified HomeAILab references

Inspected HomeAILab commit: `0e232833ac7e582970f79e7e67cda0329bd0245b`. Refresh local references before changing infrastructure.

| Fact | Reference |
|---|---|
| Portainer server is on `controlplane`, not Databrick | HomeAILab `AGENTS.md`, `README.md`, `CLAUDE.md` |
| Databrick endpoint is documented as 3 through the agent | same docs; `.env.example` `PORTAINER_ENDPOINT_DATABRICK` |
| SSH alias documented as `databricks` | `.env.example` and deployment scripts |
| Existing `susman-ingress` owns host 80/443 | `mail/README.md` |
| LAN DNS uses `lan-dns` / dnsmasq | `mail/scripts/set-lan-dns.sh` and mail docs |
| DNS config documented at `/home/darkmatter2222/lan-dns/dnsmasq.conf` | DNS script |
| DuckDNS compose project documented at `/home/darkmatter2222/docker/duckdns` | recovery/deployment docs |
| A separate ingress compose path `/home/darkmatter2222/vega-ingress` also appears | recovery script; inspect live ownership before assuming which serves Rustwake |
| Credential procedures | `.opencode/agents/keepass-keeper.md`, `.opencode/skills/keepass/SKILL.md`, `docs/KEEPASS.md` |

Do not assume endpoint 3 or a historical stack ID still identifies the intended host. Verify live endpoint identity and labels before each first adoption. Existing ranges 8000–8599, 9000–9099, 9100–9199 and ingress/mail ports already have documented uses; never choose a port merely because it seems memorable.

## Credential handling

Load only required values using HomeAILab's current local procedures. Relevant variable names include `PORTAINER_API_URL`, `PORTAINER_USERNAME`, `PORTAINER_PASSWORD`, `HOST_DATABRICK`, `PORTAINER_ENDPOINT_DATABRICK`; do not copy values into Rustwake or echo environment dumps. Prefer existing credential helper/SSH alias over embedding tokens in commands. Disable shell tracing around secrets. Receipts contain references and redacted outcomes, not passwords, key paths with contents, bearer tokens or full config dumps.

Follow HomeAILab's keeper instructions if accessing its vault. This file does not authorize bulk vault export. Never commit `.env`, private keys, temporary authenticated request bodies or downloaded secrets.

## First deployment: discover and adopt once

1. Read current local `AGENTS.md`, deployment/ingress/DNS docs and relevant skills. Confirm repository, endpoint hostname, container runtime and available disk/memory.
2. Inventory existing stacks, containers, port mappings, networks, volumes, ingress routes, DNS records and TLS coverage read-only. Record only nonsecret necessary facts. Confirm whether Rustwake already exists before creating anything.
3. Choose a unique Rustwake stack/project name and ownership labels (`app=rustwake`, repository identity, environment). If a same-named stack exists without matching ownership, stop this mutation and record conflict; do not adopt by name alone.
4. Prefer a dedicated Rustwake internal service/port behind the established ingress. Attach to an existing ingress network only when its ownership/use is verified; otherwise create a dedicated network and the minimal approved connection. No new bind on host 80/443.
5. Identify the existing intended DNS name from live/local configuration. If none exists, choose a nonconflicting Rustwake subdomain within the authorized existing zone only after checking current ownership, routing and certificate capability; record it as proposed until verified. Do not overwrite another A/CNAME or wildcard to make Rustwake work. Public exposure must use the existing authorized route and access policy, not a new router port-forward.
6. Create a deployment plan containing exact resources to create/change, chosen upstream, route/include file, health endpoint, candidate SHA/digest and rollback actions. Back up exact affected configuration to a local protected location. Capture baseline health for relevant unrelated routes/services.
7. Build the React static artifact from the reviewed immutable source. Create an isolated static-serving container or appropriate existing approved service pattern. No Vite development server in production. Nonroot serving, minimal capabilities, bounded resources, correct SPA fallback and asset cache behavior, explicit health check. Avoid privileged mode, host network, broad host mounts or docker socket exposure to the app.
8. Validate compose/config syntax and resource names. Create/update only the verified Rustwake stack. Reuse its recorded identity on subsequent runs. HomeAILab examples may delete/recreate their own named stacks: do not execute them wholesale or inherit their deletion behavior for unrelated resources. Verify the current Portainer API rather than assuming example payloads remain valid.
9. Verify internal service health and version before routing. Apply a narrowly scoped ingress include/route, validate ingress syntax and reload only the affected service. Apply a DNS change only if required and safe, validate it and reload only its owner. Do not run broad fleet recovery or global `docker compose down`.
10. Test through the final intended hostname: DNS resolution, expected HTTPS certificate, HTTP status, HTML/JS/CSS assets, gameplay load, browser console, refresh/SPA route, and a short touch-sized path. Check existing relevant routes again. Record LAN-only versus externally verified reachability truthfully.
11. Write a sanitized receipt and provide it to publisher. Only after successful verification may README show the URL as live.

The initial deployment itself must be idempotent: an interrupted attempt is reconciled before another stack/network/route is created. A process restart is not permission to repeat installation blindly.

## Recurring releases

Discover current Rustwake deployment identity from receipt plus live ownership labels. If intended source SHA/artifact digest is already active and healthy, no-op. If a newer eligible candidate exists, build/tag immutably, run health checks in an isolated candidate, promote using the established Rustwake route, verify end-to-end and save prior release for rollback. Do not change DNS on every release.

Avoid fixed container names that collide during candidate testing. Use a declared release identifier. Keep at least one known-good image/artifact under a bounded retention policy; cleanup targets Rustwake-owned retired releases only. Never global-prune images, containers, networks or volumes.

For this current static local-save app, no shared production database is necessary. If accounts/backend arrive later, add migration and data-backup gates before deploying them. Do not pretend a UI-only deployment provides server authority.

## Rollback

If candidate health, assets, gameplay smoke, TLS/route or unrelated baseline checks fail, stop promotion or restore only Rustwake's previous route/image and any exact configuration changed by this operation. Revalidate service and unaffected-route health. Keep failure evidence and failed release quarantined. Never restore an entire ingress/DNS file over somebody else's concurrent edits: compare current hash and revert the owned patch or reconcile safely.

Server changes use a deployer lease plus before/after resource/config identity checks. A changed shared configuration is a conflict to reconcile, not permission to force overwrite. No source push should race a server artifact build; build by SHA, not mutable working directory.

## Deployment receipt schema

```json
{
  "status": "pending | deployed | rolled-back | blocked",
  "sourceSha": "immutable source commit",
  "artifactDigest": "verified immutable artifact/image digest",
  "environment": "databrick",
  "endpointIdentityVerified": false,
  "stackName": null,
  "stackId": null,
  "ownedResources": [],
  "url": null,
  "reachability": "unverified | LAN | external",
  "checks": [],
  "priorRelease": null,
  "rollbackResult": null,
  "verifiedAt": null,
  "blocker": "local host access not available in this cloud session"
}
```

This is a schema example, not evidence of deployment. Publisher records a real receipt under `work/deployments/` and updates the README's live URL and deployed revision without secrets.


