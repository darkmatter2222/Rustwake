// B-12: the content and behaviour gate that CI runs (spec 23.2, 23.5). One implementation
// in `src/game/content/validate.ts`, so `npm test` and the pipeline cannot drift apart.
// Run: `npx tsx scripts/validate-content.mjs`. Exits 1 when any invariant is violated.
import { BLUEPRINTS, RECIPES, RESOURCES } from "../src/game/content/defs";
import { RESEARCH } from "../src/game/content/research";
import { validateContent, validateBehaviour } from "../src/game/content/validate";

const started = Date.now();
const content = validateContent();
const contentMs = Date.now() - started;
const behaviour = validateBehaviour(1800);
const total = content.length + behaviour.violations.length;

const tally = ["firstDrone", "firstResearch", "tick", "machines", "links", "drones", "batches", "credits", "nodes"];
console.log(
  `tables: ${RESOURCES.length} resources, ${Object.keys(BLUEPRINTS).length} blueprints, ` +
    `${Object.keys(RECIPES).length} recipes, ${Object.keys(RESEARCH).length} research nodes`
);
console.log(`content: ${content.length} violation(s) in ${contentMs} ms`);
for (const line of content) console.log(`  - ${line}`);
console.log(
  `behaviour: ${tally.map((key) => `${key}=${behaviour.marks[key]}`).join(" ")} | ` +
    `${behaviour.violations.length} violation(s)`
);
for (const line of behaviour.violations) console.log(`  - ${line}`);
console.log(total === 0 ? "validated: no violations" : `failed: ${total} violation(s)`);
process.exitCode = total === 0 ? 0 : 1;
