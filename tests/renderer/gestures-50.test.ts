import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  TAP_THRESHOLD_PX,
  applyGesture,
  idleGesture,
  type GestureInput,
  type GestureOutput,
  type GestureState,
} from "../../src/game/renderer/gestures";
import { panCamera, zoomAtPoint } from "../../src/game/renderer/camera";
import { screenToWorld, worldToScreen, type Camera, type ViewState } from "../../src/game/renderer/projection";
import { CELL, WORLD_H, WORLD_W, tileToWorld, worldToTile } from "../../src/game/renderer/grid";
import { castPick, syncOrthoCamera } from "../../src/game/renderer/three/cameraRig";

/**
 * UI-RESET-50 (G2 wave 2): the gesture machine contract.
 *
 * Only a cleared tap may select / salvage / place. A drag that ends where it
 * began is still a drag; a pinch is never a tap on either lift; a cancelled
 * pointer spoils the whole gesture until every pointer is up and a new one
 * starts. The reducer is pure — the input state is never mutated.
 */

function run(state: GestureState, ...inputs: GestureInput[]): GestureOutput[] {
  const outputs: GestureOutput[] = [];
  let current = state;
  for (const input of inputs) {
    const out = applyGesture(current, input);
    outputs.push(out);
    current = out.state;
  }
  return outputs;
}

const down = (id: number, x: number, y: number): GestureInput => ({ type: "down", id, x, y });
const move = (id: number, x: number, y: number): GestureInput => ({ type: "move", id, x, y });
const up = (id: number, x: number, y: number): GestureInput => ({ type: "up", id, x, y });
const cancel = (id: number): GestureInput => ({ type: "cancel", id });

describe("tap", () => {
  it("a press and release without travel is one tap at the release point", () => {
    const [press, release] = run(idleGesture(), down(1, 100, 120), up(1, 100, 120));
    expect(press.tap).toBeNull();
    expect(press.state.phase).toBe("pending");
    expect(release.tap).toEqual({ x: 100, y: 120 });
    expect(release.state.phase).toBe("idle");
    expect(release.state.pointers.size).toBe(0);
  });

  it("travel up to the threshold still taps; one pixel past it never does", () => {
    expect(TAP_THRESHOLD_PX).toBe(8);
    const at = run(
      idleGesture(),
      down(1, 50, 50),
      move(1, 54, 53), // Manhattan 7
      up(1, 54, 53)
    );
    expect(at[2].tap).toEqual({ x: 54, y: 53 });
    const past = run(
      idleGesture(),
      down(1, 50, 50),
      move(1, 55, 54), // Manhattan 9
      up(1, 55, 54)
    );
    expect(past[1].state.phase).toBe("pan");
    expect(past[2].tap).toBeNull();
  });

  it("a drag that returns to its start is still a drag, never a tap", () => {
    const outputs = run(
      idleGesture(),
      down(1, 80, 80),
      move(1, 140, 80),
      move(1, 80, 80),
      up(1, 80, 80)
    );
    expect(outputs[1].pan).toEqual({ dx: 60, dy: 0 });
    expect(outputs[2].pan).toEqual({ dx: -60, dy: 0 });
    expect(outputs[3].tap).toBeNull();
    expect(outputs[3].state.phase).toBe("idle");
  });

  it("small moves below the threshold emit ghost but no pan yet", () => {
    const [press, small] = run(idleGesture(), down(1, 10, 10), move(1, 12, 11));
    expect(press.ghost).toBeNull();
    expect(small.pan).toBeNull();
    expect(small.ghost).toEqual({ x: 12, y: 11 });
    expect(small.state.phase).toBe("pending");
  });
});

describe("pinch", () => {
  it("a second pointer turns the gesture into a pinch with a span baseline", () => {
    const [first, second] = run(idleGesture(), down(1, 100, 100), down(2, 140, 100));
    expect(first.state.phase).toBe("pending");
    expect(second.state.phase).toBe("pinch");
    expect(second.state.pinchSpan).toBe(40);
    expect(second.state.pinchX).toBe(120);
    expect(second.state.pinchY).toBe(100);
    expect(second.tap).toBeNull();
  });

  it("spreading zooms in at the midpoint and carries the midpoint pan", () => {
    const outputs = run(
      idleGesture(),
      down(1, 100, 100),
      down(2, 140, 100),
      move(2, 180, 100) // span 40 -> 80, midpoint 120 -> 140
    );
    const spread = outputs[2];
    expect(spread.pinch).toEqual({ factor: 2, x: 140, y: 100 });
    expect(spread.pan).toEqual({ dx: 20, dy: 0 });
    expect(spread.tap).toBeNull();
    expect(spread.ghost).toBeNull(); // a pinch never steers the build ghost
  });

  it("closing zooms out; neither lift afterwards is a tap", () => {
    const outputs = run(
      idleGesture(),
      down(1, 100, 100),
      down(2, 180, 100),
      move(2, 140, 100), // span 80 -> 40
      up(2, 140, 100),
      up(1, 100, 100)
    );
    expect(outputs[2].pinch?.factor).toBe(0.5);
    expect(outputs[3].tap).toBeNull();
    expect(outputs[3].state.phase).toBe("pan"); // 2 -> 1 leaves a drag
    expect(outputs[4].tap).toBeNull();
    expect(outputs[4].state.phase).toBe("idle");
  });

  it("a span too small to measure emits carry but no zoom ratio", () => {
    const outputs = run(
      idleGesture(),
      down(1, 100, 100),
      down(2, 102, 100), // span 2
      move(2, 103, 100) // span 3, still under the floor
    );
    expect(outputs[2].pinch).toBeNull();
    expect(outputs[2].pan).toEqual({ dx: 0.5, dy: 0 });
  });

  it("the remaining pointer after a pinch lift pans from its own position", () => {
    const outputs = run(
      idleGesture(),
      down(1, 100, 100),
      down(2, 140, 100),
      up(2, 140, 100),
      move(1, 130, 100)
    );
    expect(outputs[2].state.phase).toBe("pan");
    expect(outputs[3].pan).toEqual({ dx: 30, dy: 0 });
    expect(outputs[3].tap).toBeNull();
  });
});

describe("cancel", () => {
  it("a cancelled single pointer can never tap, even without travel", () => {
    const outputs = run(idleGesture(), down(1, 60, 60), cancel(1), up(1, 60, 60));
    expect(outputs[1].tap).toBeNull();
    expect(outputs[1].state.phase).toBe("idle");
    expect(outputs[2].tap).toBeNull(); // the late lift is an unknown pointer
    expect(outputs[2].state.phase).toBe("idle");
  });

  it("a cancel mid-pinch spoils the remaining pointer's lift too", () => {
    const outputs = run(
      idleGesture(),
      down(1, 100, 100),
      down(2, 140, 100),
      cancel(1),
      move(2, 150, 100),
      up(2, 150, 100)
    );
    expect(outputs[2].state.spoiled).toBe(true);
    expect(outputs[2].state.phase).toBe("pan");
    expect(outputs[3].pan).toEqual({ dx: 10, dy: 0 });
    expect(outputs[3].tap).toBeNull();
    expect(outputs[4].tap).toBeNull();
    expect(outputs[4].state.phase).toBe("idle");
  });

  it("the spoil dies with the gesture: a fresh press taps again", () => {
    const outputs = run(
      idleGesture(),
      down(1, 100, 100),
      down(2, 140, 100),
      cancel(1),
      up(2, 140, 100),
      down(3, 20, 20),
      up(3, 20, 20)
    );
    expect(outputs[4].state.spoiled).toBe(false);
    expect(outputs[5].tap).toEqual({ x: 20, y: 20 });
  });

  it("a cancelled pointer leaves the pinch baseline rebased, not stale", () => {
    const outputs = run(
      idleGesture(),
      down(1, 100, 100),
      down(2, 140, 100),
      down(3, 180, 100),
      cancel(1), // pointers 2+3 remain, span 40, midpoint 160
      move(3, 220, 100) // span 80, midpoint 180
    );
    expect(outputs[3].state.pinchSpan).toBe(40);
    expect(outputs[3].state.pinchX).toBe(160);
    expect(outputs[4].pinch).toEqual({ factor: 2, x: 180, y: 100 });
    expect(outputs[4].pan).toEqual({ dx: 20, dy: 0 });
  });
});

describe("purity and unknown pointers", () => {
  it("never mutates the state it was handed", () => {
    const start = idleGesture();
    const frozen = JSON.stringify({ ...start, pointers: [...start.pointers.entries()] });
    run(
      start,
      down(1, 10, 10),
      down(2, 50, 10),
      move(2, 90, 10),
      cancel(1),
      up(2, 90, 10)
    );
    expect(JSON.stringify({ ...start, pointers: [...start.pointers.entries()] })).toBe(frozen);
  });

  it("ignores moves, lifts and cancels of pointers it never saw", () => {
    const start = idleGesture();
    for (const input of [move(9, 1, 1), up(9, 1, 1), cancel(9)]) {
      const out = applyGesture(start, input);
      expect(out.state).toBe(start);
      expect(out.tap).toBeNull();
      expect(out.pan).toBeNull();
      expect(out.pinch).toBeNull();
      expect(out.ghost).toBeNull();
    }
  });

  it("each output owns its pointer map, so applied deltas cannot alias", () => {
    const first = applyGesture(idleGesture(), down(1, 5, 5));
    const second = applyGesture(first.state, down(2, 25, 5));
    expect(first.state.pointers).not.toBe(second.state.pointers);
    expect(first.state.pointers.size).toBe(1);
    expect(second.state.pointers.size).toBe(2);
  });
});

/**
 * RW3D T07 (#134) retarget: the SAME reducer now steers the 3D view. The contract
 * the issue pins is unchanged — only a cleared tap may select / salvage / place —
 * but the outputs are applied through the orbit-aware camera and the tap is
 * resolved through the production ground inverse + raycast pick path. A drag or
 * a cancel must produce ZERO commit intents under any orbit.
 */
describe("RW3D T07 retarget: gestures steer the 3D view", () => {
  const view: ViewState = { width: 960, height: 640 };
  const fitted: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 1.4 };
  const orbit: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 3, yaw: 45, elev: 35 };
  // Zoomed-in phone region: both axes stay inside the pan clamp, so applied pans
  // and pinch anchors move the camera instead of hitting the pin-to-fit rule.
  const closeView: ViewState = { width: 320, height: 240 };
  const closeOrbit: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 5, yaw: 45, elev: 35 };

  /** The only output that may select / salvage / place is a cleared tap. */
  const commits = (outputs: GestureOutput[]): number =>
    outputs.filter((o) => o.tap !== null).length;

  function pickRig(): { camera3: THREE.OrthographicCamera; raycaster: THREE.Raycaster; machines: THREE.InstancedMesh } {
    const camera3 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4096);
    syncOrthoCamera(camera3, orbit, view);
    const machines = new THREE.InstancedMesh(
      new THREE.BoxGeometry(CELL * 0.8, 16, CELL * 0.8),
      new THREE.MeshBasicMaterial(),
      1
    );
    machines.userData.kind = "machine";
    machines.userData.ids = [9];
    const t = tileToWorld(9);
    machines.setMatrixAt(0, new THREE.Matrix4().makeTranslation(t.x, 8, t.y));
    machines.instanceMatrix.needsUpdate = true;
    machines.updateMatrixWorld();
    return { camera3, raycaster: new THREE.Raycaster(), machines };
  }

  it("a cleared tap under orbit selects the tile and body under the pointer", () => {
    const t = tileToWorld(9);
    const px = worldToScreen(orbit, view, t.x, t.y);
    const outputs = run(idleGesture(), down(1, px.x, px.y), up(1, px.x, px.y));
    expect(commits(outputs)).toBe(1);
    const tap = outputs[1].tap!;
    const ground = screenToWorld(orbit, view, tap.x, tap.y);
    expect(worldToTile(ground.x, ground.y)).toBe(9);
    const { camera3, raycaster, machines } = pickRig();
    const hit = castPick(raycaster, camera3, view, tap.x, tap.y, [machines]);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe(9);
  });

  it("a drag that ends where it began commits nothing and pans the orbit camera", () => {
    const outputs = run(
      idleGesture(),
      down(1, 160, 120),
      move(1, 220, 160),
      move(1, 160, 120),
      up(1, 160, 120)
    );
    expect(commits(outputs)).toBe(0);
    const pans = outputs.filter((o) => o.pan !== null);
    expect(pans.length).toBeGreaterThan(0);
    let camera = closeOrbit;
    const trail: Camera[] = [];
    for (const o of pans) {
      camera = panCamera(camera, closeView, o.pan!.dx, o.pan!.dy, fitted);
      trail.push(camera);
    }
    // The world followed the finger mid-drag...
    expect(trail[0].x !== closeOrbit.x || trail[0].y !== closeOrbit.y).toBe(true);
    // ...and the round trip returned home without ever committing a tap.
    expect(camera.x).toBeCloseTo(closeOrbit.x, 6);
    expect(camera.y).toBeCloseTo(closeOrbit.y, 6);
    expect(camera.yaw).toBe(45);
    expect(camera.elev).toBe(35);
  });

  it("a cancelled pointer spoils every remaining lift — zero purchase/salvage commits", () => {
    const spoiled = run(
      idleGesture(),
      down(1, 100, 100),
      down(2, 200, 100),
      cancel(1),
      up(2, 200, 100)
    );
    expect(commits(spoiled)).toBe(0);
    // A fresh gesture after every pointer is up may tap again.
    const fresh = run(spoiled[spoiled.length - 1].state, down(3, 150, 150), up(3, 150, 150));
    expect(commits(fresh)).toBe(1);
  });

  it("a single-pointer cancel spoils the lift too", () => {
    const outputs = run(idleGesture(), down(1, 100, 100), cancel(1), down(1, 100, 100), up(1, 100, 100));
    // The cancel emptied the gesture; the new down/up is a fresh gesture and may tap.
    expect(outputs[1].tap).toBeNull();
    expect(commits(outputs)).toBe(1);
    const spoiledMid = run(idleGesture(), down(1, 100, 100), down(2, 300, 100), cancel(2), up(1, 100, 100));
    expect(commits(spoiledMid)).toBe(0);
  });

  it("pinch zooms through the orbit anchor and neither lift is a tap", () => {
    const outputs = run(
      idleGesture(),
      down(1, 120, 120),
      down(2, 160, 120),
      move(2, 200, 120),
      up(1, 120, 120),
      up(2, 200, 120)
    );
    expect(commits(outputs)).toBe(0);
    const pinch = outputs[2].pinch!;
    expect(pinch.factor).toBe(2);
    const anchor = screenToWorld(closeOrbit, closeView, pinch.x, pinch.y);
    const zoomed = zoomAtPoint(closeOrbit, closeView, pinch.factor, pinch.x, pinch.y, fitted);
    const after = screenToWorld(zoomed, closeView, pinch.x, pinch.y);
    expect(after.x).toBeCloseTo(anchor.x, 6);
    expect(after.y).toBeCloseTo(anchor.y, 6);
  });

  it("travel within the tap threshold still commits exactly once under orbit", () => {
    const outputs = run(
      idleGesture(),
      down(1, 300, 200),
      move(1, 300 + TAP_THRESHOLD_PX, 200),
      up(1, 300 + TAP_THRESHOLD_PX, 200)
    );
    expect(commits(outputs)).toBe(1);
    const over = run(
      idleGesture(),
      down(1, 300, 200),
      move(1, 300 + TAP_THRESHOLD_PX + 1, 200),
      up(1, 300 + TAP_THRESHOLD_PX + 1, 200)
    );
    expect(commits(over)).toBe(0);
  });
});
