// QA STRAT-003 g1: save compatibility. (1) pre-fork yard-mature save, (2) a three-branch
// save ["speed","buffer","draw"], decode/re-encode byte-identity, validateSim, checksum,
// schemaVersion, and the absence of lastReject in the serialized SimState.
import { readFileSync } from "node:fs";
import { encodeSave, decodeSave, validateSim, checksum } from "file:///C:/Users/ryans/.local/share/opencode/worktree/fe4e05/merged-c2842e1-qa/src/game/persistence/save.ts";
import { createInitialState } from "file:///C:/Users/ryans/.local/share/opencode/worktree/fe4e05/merged-c2842e1-qa/src/game/simulation/types.ts";
import { applyCommand } from "file:///C:/Users/ryans/.local/share/opencode/worktree/fe4e05/merged-c2842e1-qa/src/game/simulation/commands.ts";
const ROOT = "C:/Users/ryans/.local/share/opencode/worktree/fe4e05/merged-c2842e1-qa";
const out = {};

// (1) pre-fork save from docs/evidence
const raw = readFileSync(ROOT + "/docs/evidence/yard-mature.json", "utf8").trim();
const env = JSON.parse(raw);
const dec = decodeSave(raw);
out.prefork = dec.ok
  ? {
      ok: true,
      checksumExpected: env.checksum,
      checksumComputed: checksum(JSON.stringify(env.payload)),
      schemaVersion: dec.payload.schemaVersion,
      validateSim: validateSim(dec.payload.sim),
      reEncodeByteIdentical: encodeSave(dec.payload.sim, dec.payload.lastSeenMs, dec.payload.settings) === raw,
      machine1Branch: dec.payload.sim.machines[0].branch ?? null,
      lastRejectInString: JSON.stringify(dec.payload.sim).includes("lastReject"),
    }
  : { ok: false, reason: dec.reason, detail: dec.detail };

// (2) three-branch save: engine-built, then ["speed","buffer","draw"] forced on one machine
const st = createInitialState();
let seq = 0;
const send = (body) => applyCommand(st, { id: "q" + (seq += 1), ...body });
st.store = { ...st.store, scrap: 60, ferrous: 20 };
st.storeUnits = Object.values(st.store).reduce((a, b) => a + b, 0);
st.credits = 200;
send({ type: "machine.build", blueprint: "sorter", tile: 0 });
send({ type: "machine.upgrade", machineId: 1, branch: "speed" });
send({ type: "machine.upgrade", machineId: 1, branch: "draw" });
send({ type: "machine.upgrade", machineId: 1, branch: "buffer" });
const enc1 = encodeSave(st, 1700000000000, { muted: true, reducedMotion: false, textScale: 1 });
const dec2 = decodeSave(enc1);
const enc2 = dec2.ok ? encodeSave(dec2.payload.sim, dec2.payload.lastSeenMs, dec2.payload.settings) : null;
out.threeBranch = {
  decodeOk: dec2.ok,
  decodeReason: dec2.ok ? null : dec2.reason,
  decodeDetail: dec2.ok ? null : dec2.detail,
  branch: dec2.ok ? dec2.payload.sim.machines[0].branch ?? null : null,
  reEncodeByteIdentical: enc2 !== null && enc2 === enc1,
  validateSim: validateSim(dec2.ok ? dec2.payload.sim : null),
  checksumOfPayload: checksum(JSON.stringify(JSON.parse(enc1).payload)),
  envelopeChecksum: JSON.parse(enc1).checksum,
  schemaVersion: JSON.parse(enc1).payload.schemaVersion ?? JSON.parse(enc1).schemaVersion,
  lastRejectInString: enc1.includes("lastReject"),
  credits: dec2.ok ? dec2.payload.sim.credits : null,
};
// (3) pre-fork save decoded then forked: named upgrade charges the plain ladder + premium
const st3 = dec.ok ? dec.payload.sim : null; void st3;
console.log(JSON.stringify(out, null, 1));
