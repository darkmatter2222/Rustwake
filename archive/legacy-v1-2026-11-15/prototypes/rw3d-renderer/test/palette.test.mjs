import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTE } from "../src/palette.js";

// Guard: spike tokens must equal ART_AND_MOTION.md "Exact starting palette".
const SPEC = {
  sand: "#BA8054", sandLight: "#D3A16D", oxide: "#A34F32", oxideLight: "#C47746",
  cream: "#D6C7A3", charcoal: "#292C29", steel: "#7C8078", olive: "#777746",
  yellow: "#C99A35", amber: "#FFB348", rubber: "#33332F", text: "#F4EBD8",
  muted: "#C0B69F", danger: "#CB4D40", success: "#88A66B",
};

test("palette matches the art contract exactly", () => {
  assert.deepEqual(PALETTE, SPEC);
});
