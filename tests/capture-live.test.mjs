/**
 * OPS-09 (#333): deterministic offline tests for scripts/capture-live.mjs.
 * No live network and no real browser: fetchImpl / launchImpl / probeViewImpl
 * are injected. Includes deliberate FAILURE/negative cases proving a failed
 * smoke yields FAIL + nonzero exit (release stays UNVERIFIED even when the
 * deployment receipt succeeded), plus manifest parsing and report shaping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve, join} from "node:path";
import {
  runLiveSmoke, shapeReport, viewFailures, parseManifest, statusExitCode,
  DEFAULT_LIVE_URL, VIEW_SPECS,
} from "../scripts/capture-live.mjs";

const SHA_A = "b363fd077400f61fbbce6b397b3a1c6e46e6dda1";
const SHA_B = "258fce59755c4c07aabed0c6925a0757f0e4cc24";
const manifestText = sha => JSON.stringify({version: 1, source_sha: sha, files: []});

const goodView = name => ({
  name,
  viewport: name === "desktop" ? {width: 1440, height: 900} : {width: 390, height: 844},
  world3d: "ready", firstFrameRendered: true, framesAdvancing: true, shell: "v2",
  yaw: 45, elevation: 35.264, canvasCssWidth: 100, canvasCssHeight: 100,
  documentScroll: false, buttons: ["Zoom in", "Recenter"], stampMatchesApplied: true,
  pageErrors: [], failedRequests: [], webglContextCount: 1,
  screenshot: name + "-live.png",
});

/** Fake probe: writes a real screenshot file, records order, returns a record. */
function fakeProbe({broken = null, calls = []} = {}) {
  return async ({view, outDir}) => {
    calls.push(view.name);
    const rec = broken && broken.name === view.name ? {...goodView(view.name), ...broken.patch} : goodView(view.name);
    if (rec.screenshot) await writeFile(resolve(outDir, rec.screenshot), "fixture-png-bytes");
    return rec;
  };
}

function fakeBrowser(log = []) {
  return {close: async () => { log.push("close"); }};
}

const okFetch = sha => async () => ({status: 200, buffer: Buffer.from(manifestText(sha))});

async function withOutDir(fn) {
  const outDir = await mkdtemp(join(tmpdir(), "rw-live-smoke-test-"));
  try {
    return await fn(outDir);
  } finally {
    await rm(outDir, {recursive: true, force: true});
  }
}

test("parseManifest: valid manifest yields 40-hex source_sha", () => {
  const r = parseManifest(manifestText(SHA_A));
  assert.equal(r.ok, true);
  assert.equal(r.sourceSha, SHA_A);
  assert.equal(r.error, null);
});

test("NEGATIVE: parseManifest rejects invalid JSON and malformed source_sha", () => {
  assert.equal(parseManifest("{not json").ok, false);
  assert.equal(parseManifest(JSON.stringify({files: []})).ok, false);
  assert.equal(parseManifest(JSON.stringify({source_sha: "b363fd0"})).ok, false);
  assert.equal(parseManifest("null").ok, false);
});

test("statusExitCode: PASS=0, FAIL/UNKNOWN=nonzero", () => {
  assert.equal(statusExitCode("PASS"), 0);
  assert.equal(statusExitCode("FAIL"), 1);
  assert.equal(statusExitCode("UNKNOWN"), 1);
});

test("viewFailures: a fully proven view has zero failures", () => {
  assert.deepEqual(viewFailures(goodView("desktop")), []);
  assert.deepEqual(viewFailures(goodView("phone")), []);
});

test("NEGATIVE: viewFailures flags blank canvas, errors, extra WebGL context, stamp desync, missing shot", () => {
  const bad = {
    ...goodView("desktop"),
    world3d: "initializing", firstFrameRendered: false, framesAdvancing: false,
    pageErrors: ["TypeError: boom"], failedRequests: ["https://home.darkmatter2222.com/rustwake/assets/x.js"],
    webglContextCount: 2, stampMatchesApplied: false, screenshot: null, documentScroll: true,
  };
  const f = viewFailures(bad);
  assert.ok(f.length >= 8);
  assert.ok(f.some(x => x.includes("world3d")));
  assert.ok(f.some(x => x.includes("webglContextCount")));
  assert.ok(f.some(x => x.includes("stampMatchesApplied")));
  assert.ok(f.some(x => x.includes("screenshot")));
  assert.ok(viewFailures({probeError: "goto timeout"}).some(x => x.includes("probe error")));
});

test("shapeReport: PASS requires manifest sha, BOTH views and zero failures/errors", () => {
  const base = {liveUrl: DEFAULT_LIVE_URL, expectedSha: SHA_A, sourceSha: SHA_A,
    views: [goodView("desktop"), goodView("phone")], errors: [],
    started: "2026-01-01T00:00:00.000Z", completed: "2026-01-01T00:01:00.000Z"};
  assert.equal(shapeReport(base).status, "PASS");
  assert.equal(shapeReport({...base, views: [goodView("desktop")]}).status, "FAIL");
  assert.equal(shapeReport({...base, sourceSha: null}).status, "FAIL");
  assert.equal(shapeReport({...base, errors: ["network down"]}).status, "FAIL");
  assert.equal(shapeReport({...base, views: [goodView("desktop"), {...goodView("phone"), world3d: "initializing"}]}).status, "FAIL");
});

test("PASS: live manifest matches expected SHA, both fresh views prove out; report+screenshots written; exit 0", async () => {
  await withOutDir(async outDir => {
    const calls = [], log = [];
    let launches = 0;
    const report = await runLiveSmoke({
      expectedSha: SHA_A, outDir,
      fetchImpl: okFetch(SHA_A),
      launchImpl: async () => { launches++; return fakeBrowser(log); },
      probeViewImpl: fakeProbe({calls}),
      now: () => "2026-01-01T00:00:00.000Z",
    });
    assert.equal(report.status, "PASS");
    assert.equal(statusExitCode(report.status), 0);
    assert.equal(report.source_sha, SHA_A);
    assert.equal(report.expected_source_sha, SHA_A);
    assert.equal(launches, 1, "exactly ONE browser instance per SHA");
    assert.deepEqual(calls, ["desktop", "phone"], "sequential desktop then phone contexts");
    assert.deepEqual(log, ["close"], "browser closed exactly once");
    assert.equal(report.views.length, 2);
    for (const v of report.views) assert.deepEqual(v.failures, []);
    const onDisk = JSON.parse(await readFile(resolve(outDir, "report.json"), "utf8"));
    assert.equal(onDisk.status, "PASS");
    assert.equal(onDisk.source_sha, SHA_A);
    for (const name of ["desktop-live.png", "phone-live.png"]) {
      assert.equal(await readFile(resolve(outDir, name), "utf8"), "fixture-png-bytes");
    }
    assert.ok(report.limitations.length >= 2);
  });
});

test("PASS without expected SHA still records the live manifest source_sha", async () => {
  await withOutDir(async outDir => {
    const report = await runLiveSmoke({
      outDir, fetchImpl: okFetch(SHA_A),
      launchImpl: async () => fakeBrowser(), probeViewImpl: fakeProbe(),
    });
    assert.equal(report.status, "PASS");
    assert.equal(report.source_sha, SHA_A);
    assert.equal(report.expected_source_sha, null);
  });
});

test("NEGATIVE: live manifest source_sha != expected deployed SHA => FAIL exit 1, NO browser launched", async () => {
  await withOutDir(async outDir => {
    let launches = 0;
    const report = await runLiveSmoke({
      expectedSha: SHA_A, outDir,
      fetchImpl: okFetch(SHA_B),
      launchImpl: async () => { launches++; return fakeBrowser(); },
      probeViewImpl: fakeProbe(),
    });
    assert.equal(report.status, "FAIL");
    assert.equal(statusExitCode(report.status), 1);
    assert.equal(launches, 0, "must not smoke the wrong build");
    assert.ok(report.errors.some(e => e.includes("refusing to smoke the wrong build")));
    const onDisk = JSON.parse(await readFile(resolve(outDir, "report.json"), "utf8"));
    assert.equal(onDisk.status, "FAIL");
  });
});

test("NEGATIVE: deliberate failed smoke (blank canvas + page error on phone) => FAIL exit 1 even though manifest/deploy succeeded", async () => {
  await withOutDir(async outDir => {
    const report = await runLiveSmoke({
      expectedSha: SHA_A, outDir,
      fetchImpl: okFetch(SHA_A),
      launchImpl: async () => fakeBrowser(),
      probeViewImpl: fakeProbe({broken: {name: "phone", patch: {
        world3d: "initializing", firstFrameRendered: false, framesAdvancing: false,
        pageErrors: ["TypeError: Cannot read properties of undefined"], screenshot: null,
      }}}),
    });
    assert.equal(report.status, "FAIL", "a failed smoke must leave the release UNVERIFIED");
    assert.equal(statusExitCode(report.status), 1);
    assert.equal(report.source_sha, SHA_A, "deploy receipt/manifest was fine — the smoke itself failed");
    const phone = report.views.find(v => v.name === "phone");
    assert.ok(phone.failures.length > 0);
    assert.deepEqual(report.views.find(v => v.name === "desktop").failures, []);
    const onDisk = JSON.parse(await readFile(resolve(outDir, "report.json"), "utf8"));
    assert.equal(onDisk.status, "FAIL");
  });
});

test("NEGATIVE: manifest unreachable (network throw / HTTP 404 / bad JSON) => FAIL exit 1, no browser", async () => {
  await withOutDir(async outDir => {
    const cases = [
      async () => { throw new Error("simulated TLS/network failure"); },
      async () => ({status: 404, buffer: Buffer.from("not found")}),
      async () => ({status: 200, buffer: Buffer.from("{not json")}),
    ];
    for (const fetchImpl of cases) {
      let launches = 0;
      const report = await runLiveSmoke({
        expectedSha: SHA_A, outDir, fetchImpl,
        launchImpl: async () => { launches++; return fakeBrowser(); },
        probeViewImpl: fakeProbe(),
      });
      assert.equal(report.status, "FAIL");
      assert.equal(statusExitCode(report.status), 1);
      assert.equal(launches, 0);
      assert.ok(report.errors.length > 0);
    }
  });
});

test("NEGATIVE: invalid live URL or invalid expected SHA => FAIL exit 1 before any fetch/browser", async () => {
  await withOutDir(async outDir => {
    let fetches = 0, launches = 0;
    const spyFetch = async () => { fetches++; return {status: 200, buffer: Buffer.from(manifestText(SHA_A))}; };
    const spyLaunch = async () => { launches++; return fakeBrowser(); };
    const badUrl = await runLiveSmoke({baseUrl: "not a url", outDir, fetchImpl: spyFetch, launchImpl: spyLaunch, probeViewImpl: fakeProbe()});
    assert.equal(badUrl.status, "FAIL");
    const badSha = await runLiveSmoke({expectedSha: "b363fd0", outDir, fetchImpl: spyFetch, launchImpl: spyLaunch, probeViewImpl: fakeProbe()});
    assert.equal(badSha.status, "FAIL");
    assert.equal(fetches, 0);
    assert.equal(launches, 0);
    assert.equal(statusExitCode(badUrl.status), 1);
    assert.equal(statusExitCode(badSha.status), 1);
  });
});

test("NEGATIVE: probe runner crash => FAIL exit 1, browser still closed, report written", async () => {
  await withOutDir(async outDir => {
    const log = [];
    const report = await runLiveSmoke({
      expectedSha: SHA_A, outDir,
      fetchImpl: okFetch(SHA_A),
      launchImpl: async () => fakeBrowser(log),
      probeViewImpl: async () => { throw new Error("simulated browser crash"); },
    });
    assert.equal(report.status, "FAIL");
    assert.equal(statusExitCode(report.status), 1);
    assert.deepEqual(log, ["close"]);
    assert.ok(report.errors.some(e => e.includes("simulated browser crash")));
    const onDisk = JSON.parse(await readFile(resolve(outDir, "report.json"), "utf8"));
    assert.equal(onDisk.status, "FAIL");
  });
});

test("VIEW_SPECS: exactly desktop 1440x900 then phone-sized 390x844 fresh contexts", () => {
  assert.equal(VIEW_SPECS.length, 2);
  assert.deepEqual(VIEW_SPECS.map(v => v.name), ["desktop", "phone"]);
  assert.deepEqual(VIEW_SPECS[0].viewport, {width: 1440, height: 900});
  assert.deepEqual(VIEW_SPECS[1].viewport, {width: 390, height: 844});
  assert.equal(VIEW_SPECS[1].isMobile, true);
  assert.equal(VIEW_SPECS[1].touch, true);
});
