// CAM-05 (#341) DOM wiring-test stub for src/world.js (leased to ART-07).
// Records every public setView/applyCamera call and mirrors the synchronous
// canvas dataset stamp contract so tests can assert the APPLIED camera.
// No THREE, no WebGL: the real cameraInput.js still owns the canvas listeners.
export class LivingWorld {
  constructor(host) {
    this.host = host;
    this.view = { yaw: 45, elevation: 35.264, zoom: 1, x: 0, z: 0 };
    this.views = [];
    this.applied = [];
    this.tapCell = { x: 13, z: 9 }; // Freight Depot site (starter id 2)
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
  dispose() {}
}