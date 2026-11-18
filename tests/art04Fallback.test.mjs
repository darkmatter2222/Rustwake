// ART-04 (#350) WebGL-failure negative: the fallback must be LOUD and READABLE.
//
// Diagnosed product defect (dev-350d): THREE.WebGLRenderer throws when the
// browser cannot create a WebGL context; App.jsx constructs LivingWorld inside
// useEffect with no try/catch and main.jsx has no error boundary, so the whole
// React tree unmounted and the player saw a flat near-black page (art03
// evidence recorded bodyText "" and canvasCount 0; the art04 capture's per-PNG
// sanity floor caught it: 1 colour, luminanceSigma 0, mean 18).
//
// The fix lives in src/world.js (world lease): the constructor catches the
// renderer failure, appends a readable role=alert notice to document.body
// OUTSIDE #root (it survives the React unmount), and rethrows the original
// error verbatim so the failure stays loud. These tests drive the REAL
// LivingWorld constructor with a null-returning WebGL context.
//
// ROLLBACK CONTROL: on clean main (pre-ART-04) world.js has no
// webglFailureNotice export and no catch around the renderer — the constructor
// throws with NO notice, so every assertion below fails.
import test from "node:test";
import assert from "node:assert/strict";

const el = tag => ({
  tagName: tag, className: "", children: [], attrs: {}, style: {cssText: ""},
  textContent: "", parentNode: null, width: 0, height: 0,
  setAttribute(k, v) {this.attrs[k] = v;},
  appendChild(c) {c.parentNode = this; this.children.push(c); return c;},
  removeChild(c) {this.children = this.children.filter(x => x !== c); c.parentNode = null; return c;},
  addEventListener() {}, removeEventListener() {},
  // The forced-failure injection: every WebGL context request returns null,
  // exactly like the capture harness's HTMLCanvasElement.prototype patch.
  getContext(type) {return type === "webgl2" || type === "webgl" || type === "experimental-webgl" ? null : {};}
});
const body = el("body");
globalThis.document = {
  createElement: el,
  createElementNS: (_ns, tag) => el(tag),
  body,
  querySelector(sel) {
    if (sel !== ".webgl-failure-notice") return null;
    return body.children.find(c => c.className === "webgl-failure-notice") || null;
  }
};
const {LivingWorld, webglFailureNotice} = await import("../src/world.js");

const textOf = n => (n.textContent || "") + n.children.map(textOf).join("");
const tagsOf = n => [n.tagName, ...n.children.flatMap(tagsOf)];

test("WebGL failure: LivingWorld rethrows the ORIGINAL THREE error (loud, never silent)", () => {
  const host = el("div");
  let caught = null;
  try {new LivingWorld(host);} catch (e) {caught = e;}
  assert.ok(caught instanceof Error, "constructor must throw when WebGL is unavailable");
  assert.match(caught.message, /THREE\.WebGLRenderer: Error creating WebGL context/);
});

test("WebGL failure: a readable role=alert notice survives on document.body OUTSIDE the React host", () => {
  const host = el("div");
  assert.throws(() => new LivingWorld(host), /Error creating WebGL context/);
  // No canvas was ever appended to the scene host — never a fake 2D world.
  assert.equal(host.children.length, 0, "host must stay empty (worldCanvasCount 0)");
  const notices = body.children.filter(c => c.className === "webgl-failure-notice");
  assert.equal(notices.length, 1, "exactly one failure notice on body");
  const notice = notices[0];
  assert.equal(notice.parentNode, body, "notice lives on body, outside #root, so it survives the React unmount");
  assert.equal(notice.attrs.role, "alert");
  assert.ok(!tagsOf(notice).includes("canvas"), "notice is DOM text, not a canvas");
  const text = textOf(notice);
  assert.match(text, /3D renderer unavailable/);
  assert.match(text, /WebGL/);
  assert.match(text, /hardware acceleration/);
  assert.match(text, /Technical detail: THREE\.WebGLRenderer: Error creating WebGL context/);
  // Readable styled card (inline styles only — styles.css is under the UI lease).
  assert.match(notice.style.cssText, /position:fixed/);
  assert.ok(notice.children.length >= 1 && notice.children[0].style.cssText.length > 0);
});

test("WebGL failure notice is idempotent: a second failure never stacks notices", () => {
  assert.throws(() => new LivingWorld(el("div")), /Error creating WebGL context/);
  assert.throws(() => new LivingWorld(el("div")), /Error creating WebGL context/);
  assert.equal(body.children.filter(c => c.className === "webgl-failure-notice").length, 1);
});

test("webglFailureNotice is safe without a body (SSR/node) and tolerates a non-Error detail", () => {
  const saved = document.body;
  try {
    document.body = undefined;
    assert.equal(webglFailureNotice(new Error("x")), null);
  } finally {document.body = saved;}
  const n = webglFailureNotice("plain string failure");
  assert.match(textOf(n), /Technical detail: plain string failure/);
  n.parentNode.removeChild(n);
});
