// CAM-05 (#341) DOM wiring-test stub for src/world.js (leased to ART-07).
// Records every public setView/applyCamera call and mirrors the synchronous
// canvas dataset stamp contract so tests can assert the APPLIED camera.
// No THREE, no WebGL: the real cameraInput.js still owns the canvas listeners.
//
// #545 residual-flake proof switch (test-only, default 0 = contract untouched):
// CAM05_SLOW_STAMP_MS=<ms> defers the INITIAL camera dataset stamp by <ms>
// after the first applyCamera() call, while the canvas element is already
// mounted. This deterministically reproduces the loaded-runner race behind
// CI runs 44067561867 / 44067793813 (`pose().yaw` undefined !== "45"):
// `.world-canvas` exists before `data-camera-*` lands. Once the first stamp
// lands, every later stamp is synchronous again, preserving the production
// stamp-before-probe ordering (App.jsx setView/applyCamera THEN panelProbe)
// that the reset/escape/sheet waits rely on. Re-run proof:
//   CAM05_SLOW_STAMP_MS=2000 node --test tests/cam05Wiring.test.mjs
export class LivingWorld {
  constructor(host) {
    this.host = host;
    this.view = { yaw: 45, elevation: 35.264, zoom: 1, x: 0, z: 0 };
    this.views = [];
    this.applied = [];
    this.tapCell = { x: 13, z: 9 }; // Freight Depot site (starter id 2)
    this._slowStampMs = Number(process.env.CAM05_SLOW_STAMP_MS || 0);
    this._stampLanded = !(this._slowStampMs > 0);
    this._stampTimer = null;
    const c = host.ownerDocument.createElement("canvas");
    c.className = "world-canvas";
    c.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900, x: 0, y: 0 });
    host.appendChild(c);
    this.renderer = { domElement: c };
    this.width = 1440; this.height = 900;
  }
  setView(view) {
    this.view = { ...this.view, ...view };
    this.views.push({ ...this.view });
  }
  applyCamera() {
    this.applied.push({ ...this.view });
    if (this._stampLanded) { this._stamp(); return; }
    // Slow-stamp proof mode: the initial pose publication lags the mounted
    // canvas by _slowStampMs. A single timer coalesces every pre-landing
    // applyCamera/update call; it writes the CURRENT view when it fires.
    if (this._stampTimer === null) {
      this._stampTimer = setTimeout(() => {
        this._stampTimer = null;
        this._stampLanded = true;
        this._stamp();
      }, this._slowStampMs);
    }
  }
  _stamp() {
    const d = this.renderer.domElement.dataset;
    d.cameraYaw = String(this.view.yaw);
    d.cameraElevation = String(this.view.elevation);
    d.cameraZoom = String(this.view.zoom);
    d.cameraX = String(this.view.x);
    d.cameraZ = String(this.view.z);
  }
  resize() {} // real world.resize never refits (#341 contract)
  update() { this.applyCamera(); } // real world.update re-applies + stamps every frame
  drawGhost() {}
  screenToCell() { return this.tapCell ? { ...this.tapCell } : null; }
  dispose() {
    // App.jsx unmount cleanup calls dispose(): never leave a pending stamp
    // timer keeping the event loop alive after teardown (#545 contract).
    if (this._stampTimer !== null) { clearTimeout(this._stampTimer); this._stampTimer = null; }
  }
}