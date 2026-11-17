# Observability, release truth and agent accountability

## Essential telemetry
- Engineering: open issues by accepted dependency, branch/PR age, current immutable heads, red tests by exact step, independently reviewed PR count, merge-to-deploy time, rollback SHA.
- Runtime: coordinator session identity and at most four child leases; task role, owned worktree, GitHub issue, actual execution start/completion, error/unknown. A queued child isn't running and CPU time isn't deliverable proof.
- Product: player construction actions, inventory movements, route completion, time-to-first-steel, production bottlenecks, research choices and recoverable errors. Distinguish synthetic fixtures from real user behavior; do not fabricate player telemetry.
- Performance: phone/desktop cold load, p95 frame, input latency, max GPU/heap and throttled scene; label actual hardware vs emulation.
- Release: package source SHA, main CI job ID, delivery job ID/status, receipt source_sha/status, served manifest/hash, browser screenshot/report, issue URL and production timestamp.

## Automated live release proof (OPS-08, #332)
The delivery workflow's `verify-live` job runs after the trusted host adapter promotes, on a GitHub-hosted runner (repository code never executes on the privileged deploy runner). `scripts/verify-live-release.mjs` fetches the public `https://home.darkmatter2222.com/rustwake/release-manifest.json`, asserts `source_sha` equals the exact promoted main commit, re-fetches the served entry JS/CSS plus `index.html` (or `--all-files` for every manifest entry), recomputes SHA-256 and byte sizes, and checks that `index.html` only references manifest-covered assets. Status contract: PASS (exit 0), FAILED (exit 1: wrong source_sha, stale/altered checksum or bytes, uncovered asset reference), UNKNOWN (exit 2: network/TLS failure, non-200, malformed manifest, invalid input SHA). FAILED/UNKNOWN fail the delivery run — never report a release verified from a red or missing proof. The receipt artifact `rustwake-live-verification-<sha>` (30-day retention) records manifest source_sha, per-file expected/served hashes, previous-main rollback target, main CI run URL and delivery run URL. Local runs honor `NODE_EXTRA_CA_CERTS` for the studio MITM proxy; Actions runners use plain HTTPS. Deterministic offline negative cases (mismatched source_sha, stale CDN JS/CSS) run in `tests/verify-live-release.test.mjs` via `npm test`. This is manifest+checksum proof only; the hosted-browser smoke is separate task #333.

## Status truth
Developer DONE means code proposed; QA APPROVED means current head reviewed; MERGED means main contains implementation; DEPLOYED means trusted adapter successfully promoted; LIVE VERIFIED means public source matches SHA and controls work; G1 VISUAL ACCEPTED means executive sponsor saw working product and approved visual/world-first experience. Never collapse these into one green badge or claim done because 20 files changed.

## Incident response
Blank 3D canvas, stale asset SHA, uncontrolled scrolling, camera cursor drift, zoom controls not functioning, freight duplication, save corruption, or lost security boundary are urgent and should generate a precise issue linked to immutable source/receipt. Block release/issue closure, preserve screenshots/logs and rollback reference. Use one browser capture workflow and human/vision review, not a model-run browser fleet.

## Data privacy and retention
Collect no personal identifiers, payment credentials or chat data in game telemetry without appropriate authorization. Analytics schema/BI pipelines must document origin/consent, retention, aggregation and access. Avoid logging private tokens, raw save content, user emails or chain-of-thought. Artifacts retained per Actions policy and issue links; purge only under approved retention policy.

## Regular maintenance
Every release reconciles issue statuses, docs/backlog/GAPS.md, ADRs, screenshots and deployment proof. Coordinator summarizes factual changes and blockers at event milestones. Documentation drift is treated as a defect, not optional cleanup.
