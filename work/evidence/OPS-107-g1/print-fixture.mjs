// OPS-107-g1: independent read of the pinned save identity, so the evidence does not
// rely only on the vitest assertion in tests/simulation/fork.test.ts.
// Run from the worktree root:  npx tsx work/evidence/OPS-107-g1/print-fixture.mjs
import { readFileSync } from "node:fs";
import { checksum, decodeSave, encodeSave } from "../../../src/game/persistence/save";

const raw = readFileSync("docs/evidence/yard-mature.json", "utf8");
const envelope = JSON.parse(raw);
const decoded = decodeSave(raw);
if (!decoded.ok) {
  console.log("decode FAILED:", decoded.reason);
  process.exit(1);
}
const payload = decoded.payload;
const reEncoded = encodeSave(payload.sim, payload.lastSeenMs, payload.settings);
console.log("fixture bytes (utf8):", Buffer.byteLength(raw));
console.log("envelope.schemaVersion (sim):", payload.sim.schemaVersion);
console.log("envelope.checksum:", envelope.checksum);
console.log("checksum(JSON.stringify(payload)):", checksum(JSON.stringify(payload)));
console.log("round trip byte-identical:", reEncoded === raw);
