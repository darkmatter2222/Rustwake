# Sponsor intake decision — SPONSOR-20261111131443053-3b51aa2a

Role: product-owner. Bounded sponsor intake under docs/SPONSOR_INBOX.md (two-phase). This is the product phase; the release-engineer acknowledgement (inbox removal) happens later in a separate session and is NOT performed here.

## Receipt

- ID: `SPONSOR-20261111131443053-3b51aa2a`
- Path: `work/sponsor/intake/SPONSOR-20261111131443053-3b51aa2a.json`
- Status at product phase: `pending` (snapshot only; no inbox text changed).
- request sha256: `ce4977e43f6f8b47057b2a7f7128fdd0cea8a6576a2d4fc3f25fe24f47a2c7bc`
- inbox sha256 at capture: `291e9dda511f238bb05df68d4d26f360d3d4c726f06f0780838a0eadc0538dad`

Captured request (verbatim, below the `SPONSOR_INBOX.md` marker):

> please add a "reset game" button under the menu. and please from a UI UX perspective, elts reinvent all UI elements.  High Prio

## Interpretation of each clause

1. **"please add a 'reset game' button under the menu" (High Prio).** A player-facing reset / new-game entry under the main menu/settings. This is a destructive action (it destroys the current save), so it requires an explicit confirmation dialog with a save-destruction warning and a safe Cancel. Incorporated into **#62** (UI-RESET/HOME: entry screen + settings/menu rebuild, G3), which already owns the reset/new-game flow. No duplicate ticket created.
2. **"from a UI UX perspective, elts reinvent all UI elements" (High Prio).** "elts" is interpreted as "let's" (typo); this is a reversible interpretation recorded per the intake protocol. The clause is the existing executive mandate **#43** — a full mobile AND desktop UI restart replacing every player-facing surface, milestone 1, gates G0–G4. No new ticket created; incorporated into #43 and its native sub-issues #44–#69.

Both clauses are actionable and accounted for; nothing is rejected.

## Linked tickets (every incorporated ticket references the receipt)

- **#43** — https://github.com/darkmatter2222/Rustwake/issues/43 — executive mandate; carries clause 2. Receipt linked via role-stamped product comment https://github.com/darkmatter2222/Rustwake/issues/43#issuecomment-6796821923 (names receipt ID and path).
- **#62** — https://github.com/darkmatter2222/Rustwake/issues/62 — entry screen + settings/menu rebuild (G3); carries clause 1. Receipt linked via role-stamped product comment https://github.com/darkmatter2222/Rustwake/issues/62#issuecomment-6796822367 (names receipt ID and path) which also records the acceptance addition below.

Tracking issue for this intake transaction: see the linked draft PR (created in step 5/6 of the intake; URL recorded on the PR and tracking issue).

### Acceptance addition recorded on #62 (clause 1)

- An explicit "Reset game" (reset / new-game) entry reachable under the main menu / settings on BOTH mobile and desktop.
- Selecting it opens an explicit confirmation dialog that (a) warns the current save/progress is permanently destroyed, (b) requires a deliberate confirm, and (c) offers a clear Cancel that leaves the save untouched.
- Destructive action: no accidental reset, no reset without confirmation; cancel/back/close are safe and preserve the save unless the player confirms.
- Reset clears the persisted save (`SAVE_KEY = "rustwake.save.v1"`) and returns to a fresh initial state / title screen; keep coherent with #63 (Yard record + save import/export management, depends on #62).

## Existing source capability (for the implementer)

There is **no existing reset/new-game/clear-save capability** in `src/`. Grep of `src/` for `reset|newGame|clearSave|new game|wipe|start over` (case-insensitive) returns only an unrelated comment in `src/game/persistence/save.ts:257` ("...rather than the run being reset") and a CSS comment. `src/game/persistence/save.ts` exposes `SAVE_KEY = "rustwake.save.v1"`, `encodeSave`, `decodeSave`, `migrate`, `validateSim`, `checksum`, `DEFAULT_SETTINGS` — but **no clear/reset/delete routine**. The reset flow, the confirmation dialog, and a save-clearing routine (remove the persisted save and re-initialize via `createInitialState()`) must be built. This is net-new work inside #62's menu rebuild, not a wiring-up of an existing function.

## Priority

Sponsor marked the request **High Prio**. Product mapping:
- Clause 2 rides the existing **#43 P0** mandate (>=90% planned capacity); priority unchanged.
- Clause 1 rides **#62 P1** (G3). The sponsor's "High Prio" is recorded as urgency within the active UI restart; it does not create a separate P0 track or displace the G0–G2 dependency order. #62 remains `priority:P1`, `gate:G3`, `status:blocked` (depends on #57). If the coordinator later judges the reset entry can land earlier than the full G3 menu rebuild, product will re-scope explicitly; no such judgment is made now.

## Sequencing

- UI reinvention (clause 2) is the active **#43** release, proceeding through gates G0→G4 (#44–#69). Current live work: #44 cutover (ready), #48 tokens (doing), #81 nav follow-up (doing); G2/G3/G4 children blocked on dependencies.
- The reset-game button (clause 1) **ships with the G3 menu rebuild #62** (depends on #57, the accepted playable slice), and stays coherent with #63 save management. It is not pulled forward ahead of the shared shell/components and the G2 slice.

## What existing agenda remains

Nothing is discarded. The full #43 sub-issue plan (#44–#69), milestone 1, Project 1, the G0–G4 gate order, and the >=90% capacity directive all remain in force. Legacy issues #35/#24/#16/#15/#14/#8/#5/#4/#2/#1 stay `priority:P3`, `status:deferred`, `legacy-pre-ui-reset` and excluded from normal dispatch. This intake adds an acceptance sharpening to #62 and links the receipt to #43/#62; it re-opens, re-estimates or renumbers no ticket.

## Rejected / unresolved parts

None rejected. The only ambiguity ("elts") is resolved as "let's" and recorded above. Both clauses are incorporated into existing GitHub work.

## Acknowledgement mechanics — required pre-ack reconciliation (release engineer)

The acknowledgement command is:

```sh
node scripts/sponsor-inbox.mjs ack work/sponsor/intake/SPONSOR-20261111131443053-3b51aa2a.json work/product/SPONSOR-20261111131443053-3b51aa2a/DECISION.md 43 62
```

**Mechanical constraint that must be reconciled before ack succeeds:** `scripts/sponsor-inbox.mjs` `acknowledge()` validates each supplied ticket ID against the **archived `work/backlog.json`** (`board.tickets.find(t => t.id === id)`), requiring the ticket to exist there, to carry `sponsor_requests` including this receipt ID or `evidence` including the receipt path, and to not be `rejected`/`deferred`. The incorporated tickets here are **GitHub-native #43 and #62**, which are **not** rows in the archived `work/backlog.json` (its IDs are legacy strings such as `OPS-103`, `UI-004`). As written, `ack ... 43 62` will throw `Missing backlog ticket 43`.

This is a legacy-script vs GitHub-native-policy gap, not a product decision gap: the receipt is genuinely linked to #43/#62 via the role-stamped comments above, and this decision names both IDs. Before running ack, the release engineer must reconcile the script's ticket validation with the GitHub-native tickets — either (a) land a script update so `acknowledge()` validates incorporated tickets against GitHub Issues (receipt reference in the issue/comments) instead of the archived backlog, or (b) record an explicit, policy-approved reconciliation that supplies the script's required receipt-linked rows. Per AGENTS.md / docs/GITHUB_WORKFLOW.md the archived backlog must not become a competing work ledger; GitHub Issues remain authoritative. The release engineer records which path was taken in the tracking issue/PR before ack. This intake does not modify `work/backlog.json` and does not run ack.

The inbox removal and the finalized receipt must land in the **same PR** as this decision; ack must run in the **primary checkout** where the uncommitted sponsor text lives (the worktree's committed inbox does not contain it).