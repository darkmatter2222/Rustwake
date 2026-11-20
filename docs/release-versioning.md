# Release versioning scheme (Refs #600)

Binding policy: product ruling comment `7029297423` on issue #600. This file is
the in-repo statement of the scheme; the `publish-release` job header in
`.github/workflows/delivery.yml` carries the same summary.

## Rule

Every verified deploy publishes a GitHub Release automatically. The version is
a deterministic **auto patch bump within the highest existing semver series**,
computed purely from the tag list at publish time:

1. Read all tags matching strict `vMAJOR.MINOR.PATCH` (`v` prefix, no leading
   zeros, no prerelease/build suffixes).
2. Take the highest `MAJOR.MINOR` series (today: `0.3`).
3. The new version is `v<MAJOR>.<MINOR>.<max existing patch in that series + 1>`.

With the current tag list `v0.1.0`, `v0.2.0`, `v0.3.0`, the first automated
release is **`v0.3.1`**. Zero human judgement at deploy time.

- **Minor/major bumps are product decisions**, banked by product publishing a
  curated tag (as with `v0.2.0`/`v0.3.0`). The automation then continues
  patch-bumping within the new series. It never invents a minor bump, and an
  empty or fully non-semver tag list is a hard error, not a guess.
- **Docs-only / dashboard-only deploys DO get a release** at the same patch
  bump. The invariant is "Latest release tag resolves to the verified live
  `source_sha`"; a docs-only deploy still changes the manifest `source_sha`.
  When `git diff <prev tag>..<sha> -- src` is empty, the notes state
  mechanically: "No game-source changes (docs/infra/dashboard only)."

## Trigger and gates

`publish-release` is an additive **terminal** job in `delivery.yml` with
`needs: [package, deploy, verify-live, hosted-browser]`, no `if:` override and
no `continue-on-error`. Default success-only semantics mean a failed,
cancelled, timed-out or skipped delivery publishes **nothing**. A failed
publish fails the whole delivery run loudly — a confirmed deploy with no
published release is precisely the defect this scheme eliminates.

It tags exactly `needs.package.outputs.source_sha` — the same SHA `verify-live`
proved against the served manifest — never a branch SHA or a PR merge ref. The
decision also refuses to publish unless that SHA equals the triggering main
head (`github.event.workflow_run.head_sha || github.sha`).

Race safety comes from the existing workflow-level concurrency group
`rustwake-databrick-delivery` (`cancel-in-progress: false`); there is no second
concurrency group.

## Immutability and idempotence

- Tags are created via the API pointed at the verified SHA. If the computed
  tag already exists at a **different** SHA, the job hard-fails — never
  force-move, never delete-and-recreate.
- If a release already exists whose tag resolves to **this exact**
  `source_sha` (same-SHA re-run), the job is a no-op success: no second
  release, no tag mutation.

## Notes content

Every generated release body carries: the full 40-hex deployed SHA and its
tag; the git-generated commit range `<previous tag>..<sha>` (one line per
commit); the main CI run URL (or the honest fallback "workflow_dispatch (no
upstream CI run)"); the delivery run URL; the receipt artifact names
`rustwake-live-verification-<sha>` and `rustwake-hosted-browser-<sha>`; and the
mechanical game-source classification.

Notes are a deploy receipt, never a pitch. They must **never** claim sponsor
visual acceptance or a G1 pass: the hosted-browser smoke is a numeric/liveness
receipt, and sponsor visual review at G1 (Refs #276) is the only visual gate.

## Implementation and tests

- Decision (pure, unit-tested): `scripts/release-publish.mjs` —
  `nextVersion`, `shouldPublish`, `tagAvailability`, `buildNotes`.
- Side effect: thin CLI shell in the same file (`gh` via `execFileSync`, zero
  new third-party actions, job-scoped `contents: write` only).
- Tests: `tests/releasePublish.test.mjs` — unit truth tables, negative
  controls, notes contract, and a static guard proving the existing
  `delivery.yml` content is byte-identical to the pre-#600 audited baseline
  (the drift-guard hash in `tests/deliveryAlert.test.mjs` is re-baselined to
  the additive content only, as the ruling permits).

## Release verification checklist change (effective on merge)

The standard release verification gains a third check: the two receipts
(live-verification + hosted-browser) **plus the Releases-page check** — the
Latest release tag must resolve to the verified live `source_sha`. A deploy
whose release did not publish is an unverified release and gets a blocking
bug, not a pass.
