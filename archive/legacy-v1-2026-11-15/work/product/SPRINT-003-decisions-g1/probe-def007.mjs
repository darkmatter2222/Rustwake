// Scratch probe for DECISIONS.md D-1 (DEF-007). Run:
//   cd <belt001 worktree> && npx tsx ..\..\..\..\..\source\repos\Rustwake\work\product\SPRINT-003-decisions-g1\probe-def007.mjs
// Reads the priced-route refund path after a save round-trip at rw/belt001-g1.
const W = "C:/Users/ryans/AppData/Local/Temp/opencode/belt001-dev/src/game";
const { createInitialState } = await import(`file://${W}/simulation/types.ts`);
const { applyCommand, beltCost, refundOf } = await import(`file://${W}/simulation/commands.ts`);
const { encodeSave, decodeSave } = await import(`file://${W}/persistence/save.ts`);

const s = createInitialState();
s.tutorial = 9;
s.store["scrap"] = 300;
s.store["ferrous"] = 40;
s.store["nonferrous"] = 40;
s.storeUnits = 380;
const send = (state, body) => applyCommand(state, { ...body, id: `p${Math.random()}` });
send(s, { type: "machine.build", blueprint: "sorter", tile: 0 });
send(s, { type: "machine.build", blueprint: "furnace", tile: 8 });
send(s, { type: "route.connect", from: 0, to: 1, filter: "scrap" });
const priced = s.routes[0];
const paid = 300 - s.store["scrap"];
console.log("AFTER_CONNECT", JSON.stringify({ run: priced.run, latency: priced.latency, scrap: s.store["scrap"], paid }));

const raw = encodeSave(s, 1_700_000_000_000, { textScale: 2, soundOn: true, reducedMotion: false });
const back = decodeSave(raw);
if (!back.ok) throw new Error("decode refused: " + JSON.stringify(back));
const loaded = back.payload.sim;
const r = loaded.routes[0];
console.log("AFTER_LOAD", JSON.stringify({ run: r.run, runType: typeof r.run, latency: r.latency, scrap: loaded.store["scrap"] }));

const beforeRemove = loaded.store["scrap"];
const res = send(loaded, { type: "route.remove", routeId: r.id });
console.log("AFTER_REMOVE", JSON.stringify({ ok: res.ok, refund: loaded.store["scrap"] - beforeRemove, expected: refundOf(beltCost(r.run?.length ?? 0)) }));
console.log("PRICED_ROUTE_RUN_PRESENT", r.run !== undefined, "REFUND_NONZERO", loaded.store["scrap"] - beforeRemove > 0);
