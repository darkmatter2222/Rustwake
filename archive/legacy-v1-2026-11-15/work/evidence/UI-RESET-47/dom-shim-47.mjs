// UI-RESET/NAV (#47, #81 P0-1): prove the single prototype entry point paints, under node with a DOM shim.
// Usage, from anywhere:  node work/evidence/UI-RESET-47/dom-shim-47.mjs
// Loads prototype-nav.html, executes its inline script against a minimal DOM (no browser), and reports
// the painted root length plus the painted body length of every destination. Exits 1 if anything is empty.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "prototype-nav.html"), "utf8");
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const bodyHtml = /<body>([\s\S]*?)<script>/.exec(html)[1];

// --- minimal DOM -------------------------------------------------------------------------
const VOID = new Set(); // the prototype emits no void elements
class TextNode {
  constructor(t) { this.data = t; this.tagName = "#text"; }
  get textContent() { return this.data; }
  serialize() { return this.data; }
}
class Elem {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.parent = null;
    this.style = { setProperty() {} }; this.listeners = {}; this.value = ""; this.hidden = false;
    this.disabled = false; this._text = "";
  }
  get id() { return this.attrs.id ?? ""; }
  get className() { return this.attrs.class ?? ""; }
  set innerHTML(h) { this.children = []; this._text = ""; parseInto(String(h), this); if (this.tagName === "TEXTAREA") this.value = this.textContent; }
  get innerHTML() { return this.children.map((c) => c.serialize()).join(""); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.children = []; this._text = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  getBoundingClientRect() {
    const b = BOXES[this.id] ?? { x: 0, y: 0, width: 120, height: 44 };
    return { x: b.x, y: b.y, width: b.width, height: b.height, top: b.y, left: b.x, right: b.x + b.width, bottom: b.y + b.height };
  }
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
  focus() { doc.activeElement = this; }
  getContext() { return ctx2d; }
  serialize() {
    const a = Object.entries(this.attrs).map(([k, v]) => (v === "" ? " " + k : ` ${k}="${v}"`)).join("");
    return `<${this.tagName.toLowerCase()}${a}>` + this._text + this.children.map((c) => c.serialize()).join("") + `</${this.tagName.toLowerCase()}>`;
  }
}
// Fixed boxes: only the world box matters to the script (renderWorld/pick); the rest just need to exist.
const BOXES = { world: { x: 8, y: 139, width: 374, height: 595 }, cv: { x: 8, y: 139, width: 374, height: 595 }, shell: { x: 0, y: 0, width: 390, height: 844 } };
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });

function parseAttrs(s, node) {
  const re = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(s))) {
    const v = m[2] ?? m[3] ?? "";
    node.attrs[m[1]] = v;
    if (m[1] === "disabled") node.disabled = true;
  }
}
function parseInto(htmlText, root) {
  const stack = [root];
  const re = /<(\/?)([a-zA-Z0-9]+)((?:\s+[^<>]*?)?)\s*>|([^<]+)/g;
  let m;
  while ((m = re.exec(htmlText))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { top.children.push(new TextNode(m[4])); continue; }
    if (m[1] === "/") {
      for (let i = stack.length - 1; i > 0; i -= 1) { if (stack[i].tagName === m[2].toUpperCase()) { stack.length = i; break; } }
      continue;
    }
    const n = new Elem(m[2]);
    if (m[3]) parseAttrs(m[3], n);
    n.parent = top; top.children.push(n);
    if (!VOID.has(n.tagName)) stack.push(n);
  }
}
function walk(n, fn) { fn(n); for (const c of n.children ?? []) if (c instanceof Elem) walk(c, fn); }
function byId(root, id) { let hit = null; walk(root, (n) => { if (!hit && n.attrs && n.attrs.id === id) hit = n; }); return hit; }

const doc = {
  documentElement: new Elem("html"),
  body: new Elem("body"),
  activeElement: null,
  getElementById(id) { return byId(this.body, id); },
  querySelectorAll(sel) {
    const parts = sel.split(",").map((s) => s.trim());
    const out = [];
    walk(this.body, (n) => {
      if (!(n instanceof Elem)) return;
      for (const p of parts) {
        if (p.startsWith("[")) { const k = p.slice(1, -1); if (k in n.attrs) { out.push(n); return; } }
        else if (n.tagName === p.toUpperCase()) { out.push(n); return; }
      }
    });
    return out;
  },
};
doc.activeElement = doc.body;
parseInto(bodyHtml, doc.body);

function makeWindow(seedName) {
  const win = {
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    addEventListener() {}, getComputedStyle: () => ({ opacity: "1" }),
    location: { search: "?seed=" + seedName },
    history: { pushState() {}, back() {} },
  };
  win.window = win;
  return win;
}
function run(seedName) {
  // fresh DOM per run so the two seeds do not share state
  doc.body = new Elem("body"); parseInto(bodyHtml, doc.body); doc.activeElement = doc.body;
  const win = makeWindow(seedName);
  const sandbox = { window: win, document: doc, location: win.location, history: win.history, getComputedStyle: win.getComputedStyle, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: "prototype-nav.html" });
  return win.RW47;
}

// --- the proof ---------------------------------------------------------------------------
const report = { file: "prototype-nav.html", tool: "node " + process.version + " vm + minimal DOM shim (no browser)", seeds: {} };
let fail = false;
for (const seedName of ["fresh", "mature"]) {
  const RW = run(seedName);
  const root = doc.getElementById("shell");
  const paintedRootLength = root.innerHTML.length;
  const bodies = {};
  const inspLen = () => (doc.getElementById("insp-body")?.textContent ?? "").length;
  if (seedName === "fresh") {
    bodies.yard = inspLen(); // empty-yard line is a painted body state
    RW.tap("gate-begin"); // no-op on a started seed, but exercises the face id
  } else {
    for (const [dest, id] of [["yard", "nav-yard"], ["build", "nav-build"], ["store", "nav-store"], ["research", "nav-research"], ["menu", "nav-menu"]]) {
      RW.tap(id); bodies[dest] = inspLen();
    }
    RW.tap("nav-yard"); RW.tap("row-machine-1"); bodies.machine = inspLen();
  }
  const geom = RW.geom();
  const empty = paintedRootLength === 0 || Object.values(bodies).some((v) => v === 0);
  if (empty) fail = true;
  report.seeds[seedName] = { paintedRootLength, destinationBodyLengths: bodies, facesPainted: geom.faces.length, facesUnder44: geom.faces.filter((f) => f.w < 44 || f.h < 44).length, pressed: RW.pressed(), nonEmpty: !empty };
  console.log(seedName + ": paintedRootLength=" + paintedRootLength + " bodies=" + JSON.stringify(bodies) + " faces=" + geom.faces.length + " under44=" + report.seeds[seedName].facesUnder44);
}
console.log(JSON.stringify(report, null, 2));
if (fail) { console.error("FAIL: a painted root or destination body is empty"); process.exit(1); }
console.log("PASS: the single entry point paints a non-empty root and every destination body");
