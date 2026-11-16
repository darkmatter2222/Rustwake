<!-- rustwake: role=developer; issue=202; branch=rw/202-recovery-notice -->
# G1-fix-ui: save-recovery notice and actions (#202)

Date: 2026-11-14
Issue: [#202](https://github.com/darkmatter2222/Rustwake/issues/202) — [RW3D][P1][G1-fix-ui] Render save-recovery notice and actions from SaveRecoveryApi
Branch: `rw/202-recovery-notice` (base HEAD `3be257d`, fix(203) #205)

## What was implemented

- `src/ui/shell/RecoveryNotice.tsx` (new): player-visible banner consuming the real
  `SaveRecoveryApi` (`getSaveRecovery` / `retrySaveRecovery` / `exportSaveRecovery` /
  `discardSaveRecovery`). Retry, byte-exact export via the existing download helper,
  confirmed-only discard with honest outcome check, and session-local dismiss that
  never touches the store. A store double without the API renders nothing.
- `slotClearFailed` (#203/#205) consumed in player-visible messaging: a decodable
  residual slot raises no store notice, so the banner derives the residual surface
  from `no notice + retained text` (survives remounts, appears on follower tabs)
  and pairs it with the "recovered and saved" acknowledgement driven by the flag.
- `src/ui/App.tsx`: additive integration. Store prop widened to
  `GameStore & Partial<SaveRecoveryApi>` (plain GameStore doubles stay assignable);
  `<RecoveryNotice/>` is the first child of `.game` in both gate and play branches
  (one reconciliation slot, so dismissal/confirmation survive Begin). Outside
  `.hud` and the panel stack: zero census nodes, no Escape layer, no focus trap.
- `src/ui/shell/shell.css`: notice styles (+100/-1).
- `src/app/store.ts`, `src/game/persistence/recovery.ts`: COMMENT WORDING ONLY
  (JSDoc clarified: the flag, not a re-raised notice, is the residual surface).
  Verified diff contains no logic changes.
- `tests/ui/recovery-202.test.tsx` (new): 14 tests over a real store + memory
  storage (createRoot/act harness mirroring shell-wiring-135): corrupt boot notice,
  healthy/empty boot, missing-API double, Begin survival + Escape chain, retry
  success/failure, slotClearFailed residual + healed retry, export byte-exactness
  and honest download fallback, confirmed-only discard, residual discard no-op,
  dismiss/re-surface semantics, reader-tab read-only refusals, quota-held boot,
  follower-tab residual derivation.

## Gates (run once on the delivery worktree, 2026-11-14)

- `npx tsc --noEmit`: pass
- `npx tsx scripts/validate-content.mjs`: pass — 0 content violations, 0 behaviour
  violations (firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18
  drones=4 batches=1838 credits=157 nodes=3)
- `npx vitest run`: **76 files / 1005 tests passed** (baseline 75/991; +1 file,
  +14 tests from tests/ui/recovery-202.test.tsx)
- `npx tsc --noEmit && npx vite build`: pass (built in 1.29s; pre-existing
  >500 kB chunk-size warning only)

## Confinement

Writes limited to `src/ui/**`, `tests/ui/**`, `docs/evidence/**`; comment-only
wording in `src/app/store.ts` and `src/game/persistence/recovery.ts`. No renderer,
economy, audio, world, simulation, package.json or lockfile changes. No CRLF
phantom files committed (all four modified files carry real diffs).

## Limitations

- Non-vision developer: visual fidelity of the banner is not self-certified;
  running-build visual evidence and product verdict belong to independent QA.
- jsdom lacks `createObjectURL`; tests exercise the real helper's honest
  "copy the text instead" fallback rather than a browser download.
- Discard on a decodable residual slot is an honest no-op report: the store's
  discard is notice-gated (#203 behavior). Changing that is store-side work
  outside this issue's authorized scope.
- Dismissal is session-local by design; the notice re-surfaces on next boot or a
  new corruption signature.
