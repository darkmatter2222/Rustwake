> Current planning authority: [GitHub Project and release operations](GITHUB_PROJECT.md). All historical local-board scheduling/publication directions below are retired. Use GitHub Issues/Project/PRs/milestones/Releases; five sessions total. Evidence files and runtime leases are not work boards. Do not run legacy team-scheduler or team-checkpoint for assignments.

# Executive sponsor intake

Write free-form requests in the root `SPONSOR_INBOX.md` below its marker. Save locally in the canonical coordinator checkout, or edit/commit it on GitHub. The coordinator fetches remote updates and reconciles local uncommitted sponsor edits without reset/overwrite. Local edits are visible to the local team; remote edits are visible after fetch/reconciliation.

A removed request means **the product owner incorporated it into existing strategy and backlog**, not that implementation is finished. The original text, product decision and ticket links remain in `work/sponsor/intake/`. No priority or strategy gets replaced merely because a new request arrived. Product reconciles it with ongoing work, links existing tickets where appropriate, and records conflicts and sequencing.

## Two-phase intake

1. PM checks the inbox on every scheduler heartbeat and after each fetch. A nonempty inbox dispatches a bounded product-owner intake at the next available slot. Intake must not wait for the current developer to finish if a slot is free.
2. Run `node scripts/sponsor-inbox.mjs snapshot`. This creates a unique pending receipt containing the exact request text and SHA-256. It changes no inbox text or product priorities.
3. Product owner reads the receipt and existing strategy/backlog. Add or update appropriate tickets without discarding prior agenda. Each ticket must link the receipt path in `evidence` or its ID in `sponsor_requests`. Write a `work/product/` decision naming the receipt ID, every linked ticket ID, interpretation, priority, sequencing, what existing agenda remains, and any rejected or unresolved part. Update strategy where warranted.
4. Release engineer validates the proposed product decision/backlog, then runs:

   ```sh
   node scripts/sponsor-inbox.mjs ack work/sponsor/intake/SPONSOR-ID.json work/product/DECISION.md TICKET-ID
   ```

   List all incorporated ticket IDs after the decision path. The command verifies they exist and link the receipt; deferred/rejected tickets cannot trigger consumption. Mixed requests must have every actionable clause accounted for before acknowledging the snapshot. The script verifies references, not semantic completeness; product owner and PM must inspect the actual decision.
5. The script writes a durable prepared receipt first, removes only the exact captured prefix, preserves appended new requests, then marks the receipt incorporated. Commit the receipt, decision, backlog, generated board and inbox removal **together**. On GitHub, disappearance is the public acknowledgement. A failed push leaves a local incorporation only: reconcile remote sponsor edits without force, then publish the complete transaction. Do not separately push an empty inbox without its traceability.
6. PM links the acknowledgement on the board. Implementation/review/publication/deployment follow normal gates. Never equate acknowledgement with shipping or use a placeholder task with no interpreted outcome just to empty the inbox.

## Concurrent edits and recovery

Commands share `.rustwake-runtime/sponsor-intake.lock`; cooperating agents must use it. Exact-prefix matching preserves new text appended after a snapshot and refuses changed/reordered captured text. An editor does not obey the filesystem lock: do not run acknowledgement while the sponsor file is actively being saved. The command rechecks the full file immediately before replacement, but no portable rename protocol can guarantee compare-and-swap against arbitrary external editor writes. Preserve Git/local history and reconcile any detected conflict; never force-replace it.

An interrupted operation leaves `status: prepared`, original request and before/after hashes in the receipt. A retry **refuses to delete again**. Release engineer compares current inbox and Git history with the recorded hashes/remaining text, restores any missing sponsor text if uncertain, and records a recovery decision before finalizing the receipt. Never steal a live lock based on age alone. A completed acknowledgement is idempotent and cannot consume a newly repeated request. New repeated requests get a new snapshot ID.

Do not include secrets in the inbox: its contents and acknowledgement history are repository content. If a request is ambiguous, use the existing objective to make a reversible interpretation, record it and continue; only genuinely unresolved portions remain pending. Do not repeatedly ask Ryan for routine prioritization.

