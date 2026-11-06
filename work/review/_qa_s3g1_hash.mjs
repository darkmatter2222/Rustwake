// QA STRAT-003 g1: hash harness stdout bytes exactly as the process wrote them.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const cwd = "C:/Users/ryans/.local/share/opencode/worktree/fe4e05/merged-c2842e1-qa";
const tsxCli = cwd + "/node_modules/tsx/dist/cli.mjs";
const out = execFileSync(process.execPath, [tsxCli, "work/feedback/strat002-harness.mjs"], { cwd, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
const h = createHash("sha256").update(out).digest("hex").toUpperCase();
process.stdout.write("STDOUT_SHA256=" + h + " bytes=" + out.length + "\n");
const j = readFileSync(cwd + "/work/feedback/strat002-harness.json");
process.stdout.write("JSON_SHA256=" + createHash("sha256").update(j).digest("hex").toUpperCase() + " bytes=" + j.length + "\n");
