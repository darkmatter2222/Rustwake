# Rustwake live release verification — issue #248

## Ownership and release chain

An accepted implementation PR is merged to main only by the release engineer. Main push CI triggers the trusted delivery workflow; successful deployment triggers its verify-live job. The release engineer tracks exact PR head approval, merged main SHA, CI run, deployment run, receipt, live served release manifest, assets and browser verification artifact. Green feature-branch CI is not deployment. Missing or failed proof is FAIL/UNKNOWN, not deployed-verified. Accepted PRs must not accumulate without a named blocker.

The new rustwake-live-verifier is one of the existing four child slots, NOT a sixth agent. It reads evidence; it never launches Chrome or another Qwen/OpenCode loop. The Actions job on a GitHub-hosted worker starts a SINGLE Chromium process with sequential, fresh desktop and phone-emulated contexts. No browsers run on the user's computer, phone, or self-hosted Databrick deployment runner. Delivery workflow concurrency serializes the entire sequence.

## Automatic operational checks

The script at scripts/verify-live-deployment.mjs:
1. Permits only the fixed public HTTPS Rustwake URL and a full expected SHA.
2. Fetches release-manifest.json from the served website. It requires source_sha to equal the immutable packaged main SHA, then refetches every public release file and checks its exact SHA256 and length, including the entry game assets. Stale/cached/missing files fail.
3. Navigates the actual public URL. It records landing/gate screenshots, enters via Begin if a legacy gate exists, and supports the future world-first interface without that gate.
4. Verifies a visible running 3D canvas, no document scrolling, no uncaught page errors or failed JS/CSS asset requests. It records live desktop and 390x844 phone-emulated world screenshots, and tries the Roads button if present.
5. Uploads report.json and screenshot artifacts named rustwake-live-<SHA> even on failure and annotates the Actions run. Verification failure turns the delivery workflow red AFTER deployment; this is detection, not automatic rollback.

GitHub-hosted public HTTPS reachability is not yet confirmed from this environment. If the workflow cannot access the site, mark the observation failed/unknown and investigate routing. Do not change the URL to an untrusted host or claim success because the LAN runner can reach it.

## Scope and limitations

A smoke PASS proves immutable live asset identity and minimal running UI/rendering, NOT the approved isometric style, default camera angle, camera orbit, complete UI redesign, gameplay quality, roads or physical vehicle routes. It cannot certify visual beauty from pixels or confirm a real phone's GPU/touch behavior. The old app does not currently expose externally observable yaw/elevation, so instrumentation and interaction tests belong to issue #245. The UI redesign is #246, road/vehicle/construction sandbox #247, and the sponsor visual milestone #244/#151. A vision-capable reviewer must inspect the captured actual game screenshots/motion; a text-only agent leaves PENDING-VISUAL. Physical-phone evidence is separately due in #232.

The verifier persona posts one short role-stamped PR/issue comment linking merged SHA, main CI run, delivery run, live artifact and honest status. If the page is broken, the wrong SHA is served, old UI dominates, the orbit is missing or roads/vehicles are absent, it files a precise defect and routes it to the coordinator/release engineer. No blind self-certification, no extra browser fleet.

## Failure triage

- Deploy failure: inspect the sanitized trusted host-adapter receipt and preserve rollback capability. Never execute repo scripts or launch browsers on the trusted self-hosted runner.
- Live SHA/hash mismatch: check release and CDN/cache identity, exact artifact and latest main SHA. Never substitute branch SHA for deployment.
- Browser failure: inspect report.json and screenshots; isolate runtime issues from HTTPS access or incorrect selectors. Revise a changed UI selector only via reviewed PR, never by weakening source identity checks.
- Design mismatch despite smoke PASS: keep G1 open and complete #244-#247. Operational test status and visual acceptance are separate.
- Only a single event-driven review is needed per deployed SHA, without repeated polling. The verifier role requires a Qwen/OpenCode agent-definition refresh or plugin update on the host after merge; do not interrupt active worker leases just for refresh.

Helper rules can be tested offline with: node --test scripts/verify-live-helpers.test.mjs.
