// BLD-08 (#377): regenerate tests/fixtures/save-v2-dismantle.json deterministically.
// The fixture is a REAL post-dismantle save produced entirely through the public
// simulation API (no hand-edited stock): build a crusher, complete assembly, run
// exactly three production cycles with freight frozen, then dismantle it with a
// command id. The resulting bank/ledger/commands are conserved and replayable.
// tests/dismantleAtomic.test.mjs replays this exact history and asserts equality,
// then loads the save and proves the recorded dismantle command pays nothing on
// replay. Run: node scripts/make-dismantle-fixture.mjs
import {writeFileSync,mkdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {
 createGame,buildAt,removeBuilding,advanceGame,checkSite,nearestRoad,snapshot
} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK,WORLD_SIZE} from "../src/content.js";

const ZERO_BANK=Object.fromEntries(Object.keys(INITIAL_BANK).map(k=>[k,0]));
// Mirror the test's producingGame: power ON (starter generator kept), freight OFF
// (no trucks) so processed outputs stay in the machine and the bank is exact.
function producingGame(){
 const g=createGame();
 g.vehicles=[];
 g.bank={...ZERO_BANK,credits:1000,scrap:200,stone:200};
 return g;
}
function legalSite(g,type,rot=0){
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++)
  if(checkSite(g,type,x,z,rot).ok&&nearestRoad(g,x,z))return {x,z};
 throw Error("no legal site for "+type);
}

const g=producingGame();
const site=legalSite(g,"crusher");
const r=buildAt(g,"crusher",site.x,site.z,0,"fixture-crusher-build");
if(!r.ok)throw Error("build failed: "+r.reason);
advanceGame(g,5);                       // assembly completes (power-independent)
r.building.inventory={scrap:30};        // seed feedstock for three cycles
advanceGame(g,12);                      // 3 x 4s cycles: 30 scrap -> 18 iron + 6 stone
const d=removeBuilding(g,r.building.id,"fixture-dismantle-1");
if(!d.ok)throw Error("dismantle failed: "+d.reason);

const state=snapshot(g);
// Normalize wall-clock fields so the fixture is byte-reproducible; the test
// overrides lastSavedAt at load time and never compares timestamps.
state.createdAt=0;
state.lastSavedAt=0;
state.notices=[];

const out=fileURLToPath(new URL("../tests/fixtures/save-v2-dismantle.json",import.meta.url));
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(state,null,2)+"\n","utf8");
console.log("wrote "+out);
console.log("bank",JSON.stringify(state.bank));
console.log("refund",JSON.stringify(d.refund));
console.log("buildings",state.buildings.length,"commands",state.commands.length,"ledger",state.ledger.length);
