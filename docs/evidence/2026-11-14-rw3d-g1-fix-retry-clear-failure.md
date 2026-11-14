# RW3D G1-fix-retry: honest slot-clear failure in retrySaveRecovery (#203)

Date: 2026-11-14 · Role: developer (non-vision, numeric checks only) · Issue: #203 · Parent: #122 · Master: #121
Base: `origin/main` `c6e187dce951b53731cd6dfe2443abf720d2ff71` · Worktree: `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-203` · Branch: `rw/203-retry-clear-failure`
Code head (gates run at this SHA): `ee22f5045c66ba31aaf9cbf774d0c4add180882c` (evidence commit follows it).

## Defect

`src/app/store.ts` `retrySaveRecovery` performed the transactional write-before-clear correctly (recovered yard durably written to `SAVE_KEY` first), then:

```ts
if (slotRaw !== null) clearRecoverySlot(storage);
```

`clearRecoverySlot` returns `false` when storage refuses the clear (it never throws), but the result was discarded and the call returned `ok: true` — a silent full success with a stale decodable slot left behind. Reviewer-verified in PR #201 ACCEPT comment 6874397153: no data loss, but the residual slot forces held mode on a later corruption, and the caller could not distinguish full success from partial success.

## Fix design (minimal, additive)

1. `src/game/persistence/recovery.ts`: the `RecoveryResult` success variant gains `slotClearFailed?: boolean`, documented as "yard landed durably in SAVE_KEY but storage refused the slot clear; the write-once slot is kept and the notice re-surfaces; retry/discard stay available."
2. `src/app/store.ts`: `const slotClearFailed = slotRaw !== null && !clearRecoverySlot(storage);` — the flag is set on the otherwise-unchanged success result. `refreshRecovery()` and `notify()` run exactly as before, so recovery state re-derives from storage content (stateless, cannot drift).

Why `ok: true` + explicit flag instead of `ok: false`: the recovered yard **is** persisted and adopted before the clear attempt. The pinned `ok: false` contract is "a failure changes nothing," and `reason: "storage"` means the yard could not be durably written. Returning `ok: false` here would falsely claim the live yard was untouched. The flag reports partial success truthfully — never a silent full success — and is additive: no existing consumer breaks (no `src/ui` consumer exists yet; wiring is owed via #202, which can surface the flag).

Semantics preserved, unchanged: write-once slot (`preserveCorruptSave`), stateless notice/held re-derivation (`refreshRecovery`), quota holds suppressing `SAVE_KEY` writes, write-before-clear transaction order, export returns exact raw text, confirmed-only discard, reset/fresh yard never touches the slot. A decodable residual slot raises no notice (pinned invariant: a healthy slot never raises a false alarm) — the result flag is the honest surface for that case.

## Baseline discipline and delta

Full suite at base `c6e187d` BEFORE any edit (worktree fresh from `origin/main`, `npm ci` exit 0):

- Baseline: **69 files / 899 tests passed**, exit 0 (`rw-203-baseline-test.log`).
- Candidate (code head `ee22f50`): **69 files / 903 tests passed**, exit 0.
- Delta: **+0 files, +4 tests**, all in `tests/persistence/recovery.test.ts` (19 -> 23). No existing test modified or replaced; no characterization pin touched. `tests/legacy/migration.test.ts` and the sha256 fixture manifest are unmodified and green.
- Note: PR #201's reviewer recorded 72/974 at pre-merge PR head `5da71cf`, which was based on older main still carrying the Canvas2D renderer tests removed by #198; the merged base `c6e187d` legitimately counts 69/899.

## Gates (real exit codes, at code head ee22f50)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| typecheck | `npm run typecheck` | 0 | `tsc --noEmit` clean |
| validate | `npm run validate` | 0 | content 0 violations; behaviour 0 violations |
| test | `npm test` | 0 | 69 files / 903 tests passed |
| build | `npm run build` | 0 | `tsc --noEmit && vite build`, built in 1.28s |

Logs: `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-203-{typecheck,validate,test,build}.log` (outside the worktree; no tracked file affected).

## Adversarial results (4 new tests, all pass)

Storage double `clearRefusalStorage`: refusal toggles at runtime and targets only `RECOVERY_KEY`; `SAVE_KEY` writes/clears stay healthy.

1. **removeItem throws** — retry returns `ok: true` + `slotClearFailed: true`; `SAVE_KEY` decodes to the recovered yard (tick/machines match); slot bytes verbatim; `exportSaveRecovery()` byte-exact; no false notice for the decodable slot. After healing, a second retry returns the exact full-success shape (`toEqual`, no flag), slot cleared, notice null; reopened store keeps the recovered tick with no notice.
2. **Minimal double without removeItem** — the empty-write fallback throws; same flag surfaced; slot intact; after healing the fallback writes `""`, which reads as absent (`exportSaveRecovery()` null, notice null).
3. **Repeated refused retries** — live yard stays writable (`step`/`dispatch` checkpoints land; no held suppression); three consecutive retries each report the flag, slot never degrades, export stays byte-exact.
4. **Residual slot + later external corruption** — occupied slot never overwritten (write-once); newer corruption held in `SAVE_KEY` with `preserved: false` notice; retry refused with `{ ok: false, reason: "storage", detail: "save-key-corrupt" }`; confirmed discard erases only the held payload, slot survives; healed retry then resolves the slot fully.

Existing 19 recovery tests (preservation, idempotent corrupt boots, quota holds, transactional write-before-clear refusal, export/repair/import/discard journey, multi-tab, occupied-slot sequential resolution, no size cap) all stay green unmodified.

## Confinement

`git diff --stat origin/main..HEAD` (code head): `src/app/store.ts` (+14/-2 incl. doc), `src/game/persistence/recovery.ts` (+6/-1), `tests/persistence/recovery.test.ts` (+159). Plus this evidence doc. No `src/ui/**`, no `src/game/renderer/**`, no root `pnpm-lock.yaml`, no other paths. Working tree clean (no CRLF phantom commits).

## Limitations

- Non-vision developer: numeric/code-level verification only. No visual evidence; no notice UI exists yet (owed via #202).
- The flag is a store-level surface. Player-visible messaging for a refused clear lands with #202's notice wiring; this PR deliberately does not touch `src/ui`.
- A pathological storage double whose `removeItem` silently no-ops without throwing is outside `clearRecoverySlot`'s documented contract ("returns false when storage refused; never throws") and is not separately detected; real localStorage either removes or throws.
- Independent QA/product verdict on the immutable head, release merge, and main CI remain owed — no self-acceptance here.
