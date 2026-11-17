/**
 * CAM-01 (#337): 360-degree camera + pointer-grip regression matrix.
 * Extends tests/camera.test.mjs (PR #307). Tests the APPROVED math in
 * src/camera.js unchanged — no production camera code is modified here.
 *
 * Tolerance contract (explicit): the ground point under the pointer must stay
 * within 1 CSS pixel after a drag/zoom. World-coordinate error is converted to
 * CSS px with the exact inverse of the ground projection:
 *   k = frustumHeight / (H * zoom)
 *   u = cos(yaw)*gx - sin(yaw)*gz
 *   v = -sin(elevation) * (sin(yaw)*gx + cos(yaw)*gz)
 *   errorCssPx = hypot(u, v) / k
 *
 * Pan envelope: camera target is clamped to +/-90 world units (CAMERA_LIMITS).
 * Matrix cases are constructed to stay strictly inside that envelope so they
 * measure GRIP, not clamping. The former boundary slip is now fixed by CAM-03
 * (#339): the "CAM-03 boundary" test pins the legacy 520.892780px slip as a
 * negative control and asserts the approved smooth zoom clamp has zero slip.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_LIMITS, normalizeCamera, groundAtScreen, panWithAnchor,
  zoomAtPixel, orbitAtPixel, transformGesture
} from "../src/camera.js";

const TOL_PX = 1;
const rad = d => d * Math.PI / 180;
const kOf = (vp, zoom) => CAMERA_LIMITS.frustumHeight / (vp.height * zoom);

/** Inverse projection: world ground -> CSS pixel (test-only helper). */
function screenAtGround(camera, ground, vp) {
  const c = normalizeCamera(camera), k = kOf(vp, c.zoom);
  const cs = Math.cos(rad(c.yaw)), sn = Math.sin(rad(c.yaw));
  const gx = ground.x - c.x, gz = ground.z - c.z;
  const u = cs * gx - sn * gz;
  const v = -Math.sin(rad(c.elevation)) * (sn * gx + cs * gz);
  return { x: vp.width / 2 + u / k, y: vp.height / 2 - v / k };
}
function errorCssPx(camera, expectedGround, pixel, vp) {
  const c = normalizeCamera(camera), a = groundAtScreen(c, pixel, vp);
  const gx = a.x - expectedGround.x, gz = a.z - expectedGround.z;
  const cs = Math.cos(rad(c.yaw)), sn = Math.sin(rad(c.yaw));
  const u = cs * gx - sn * gz;
  const v = -Math.sin(rad(c.elevation)) * (sn * gx + cs * gz);
  return Math.hypot(u, v) / kOf(vp, c.zoom);
}
/** NEGATIVE control: the documented legacy bug — screen-delta pan WITHOUT
 *  the 1/sin(elevation) correction. Must measurably violate the 1px contract. */
function legacyDeltaPan(camera, p0, p1, vp) {
  const c = normalizeCamera(camera), k = kOf(vp, c.zoom);
  const u = (p1.x - p0.x) * k, v = (p0.y - p1.y) * k;
  const cs = Math.cos(rad(c.yaw)), sn = Math.sin(rad(c.yaw));
  return normalizeCamera({ ...c, x: c.x - (cs * u - sn * v), z: c.z - (-sn * u - cs * v) });
}
/** NEGATIVE control: the documented legacy bug — wheel zoom pivoting about
 *  screen CENTER instead of the ground under the cursor. */
function legacyCenterZoom(camera, nextZoom) {
  return normalizeCamera({ ...normalizeCamera(camera), zoom: nextZoom });
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const YAWS = Array.from({ length: 24 }, (_, i) => i * 15); // every quadrant + boundaries
const PITCHES = [20, 35.264, 50, 65, 80];
const ZOOMS = [CAMERA_LIMITS.minZoom, 1.37, CAMERA_LIMITS.maxZoom];
const EDGES = [[.02, .5], [.98, .5], [.5, .02], [.5, .98], [.02, .02], [.98, .98]];
// Drag length keeps the required target shift inside the +/-90 pan envelope
// even at min zoom / min pitch (worst world-per-px ~3.0 on 844x390).
const dragFor = zoom => zoom <= .2 ? 12 : zoom >= 12 ? 120 : 60;
const insideEnvelope = c => Math.abs(c.x) < CAMERA_LIMITS.panExtent && Math.abs(c.z) < CAMERA_LIMITS.panExtent;

test("CAM-01 matrix: 360 yaw x pitch 20-80 x min/max zoom x near-edge drags keep grip <= 1 CSS px", () => {
  let cases = 0, maxErr = 0;
  for (const vp of VIEWPORTS) for (const yaw of YAWS) for (const elevation of PITCHES) for (const zoom of ZOOMS) {
    const camera = { x: 0, z: 0, yaw, elevation, zoom };
    const d = dragFor(zoom);
    for (const [fx, fy] of EDGES) {
      const start = { x: vp.width * fx, y: vp.height * fy };
      const end = { x: start.x + (start.x > vp.width / 2 ? -d : d), y: start.y + (start.y > vp.height / 2 ? -d : d) };
      const anchor = groundAtScreen(camera, start, vp);
      const moved = panWithAnchor(camera, anchor, end, vp);
      assert.ok(insideEnvelope(moved), `case must test grip, not pan clamp: yaw=${yaw} elev=${elevation} zoom=${zoom} vp=${vp.width}x${vp.height} edge=${fx},${fy} -> x=${moved.x} z=${moved.z}`);
      const err = errorCssPx(moved, anchor, end, vp);
      maxErr = Math.max(maxErr, err);
      assert.ok(err <= TOL_PX, `GRIP DRIFT ${err} CSS px > ${TOL_PX}: yaw=${yaw} elev=${elevation} zoom=${zoom} vp=${vp.width}x${vp.height} edge=${fx},${fy}`);
      const back = screenAtGround(moved, anchor, vp);
      assert.ok(Math.hypot(back.x - end.x, back.y - end.y) < 1e-6, "inverse projection round-trip");
      cases++;
    }
  }
  assert.equal(cases, 24 * 5 * 3 * 3 * 6);
  console.log(`CAM-01 pan matrix: ${cases} cases, max grip error ${maxErr.toExponential(3)} CSS px (tolerance ${TOL_PX})`);
});

test("CAM-01 matrix: offset camera target still grips across all quadrants at mid zoom", () => {
  let cases = 0, maxErr = 0;
  for (const vp of VIEWPORTS) for (const yaw of YAWS) for (const elevation of PITCHES) {
    const camera = { x: 9, z: -5, yaw, elevation, zoom: 1.37 };
    const start = { x: vp.width * .98, y: vp.height * .98 };
    const end = { x: start.x - 60, y: start.y - 60 };
    const anchor = groundAtScreen(camera, start, vp);
    const moved = panWithAnchor(camera, anchor, end, vp);
    assert.ok(insideEnvelope(moved));
    const err = errorCssPx(moved, anchor, end, vp);
    maxErr = Math.max(maxErr, err);
    assert.ok(err <= TOL_PX, `offset grip ${err}px yaw=${yaw} elev=${elevation}`);
    cases++;
  }
  console.log(`CAM-01 offset-target matrix: ${cases} cases, max grip error ${maxErr.toExponential(3)} CSS px`);
});

test("CAM-01 matrix: wheel ticks at near-edge pixels anchor across the full 1 -> 12 -> min sweep", () => {
  let ticks = 0, maxErr = 0;
  for (const vp of VIEWPORTS) for (const yaw of [0, 90, 180, 270]) for (const elevation of [20, 35.264, 80]) {
    for (const [fx, fy] of [[.98, .5], [.5, .90]]) {
      let cam = { x: 0, z: 0, yaw, elevation, zoom: 1 };
      const pixel = { x: vp.width * fx, y: vp.height * fy };
      const anchor = groundAtScreen(cam, pixel, vp);
      let reachedMax = false;
      for (let i = 0; i < 6; i++) { // 1.55^6 > 12 -> final tick clamps at maxZoom
        cam = zoomAtPixel(cam, cam.zoom * 1.55, pixel, vp);
        assert.ok(insideEnvelope(cam), `zoom-in envelope yaw=${yaw} elev=${elevation} vp=${vp.width} edge=${fx},${fy} x=${cam.x} z=${cam.z}`);
        const err = errorCssPx(cam, anchor, pixel, vp);
        maxErr = Math.max(maxErr, err);
        assert.ok(err <= TOL_PX, `zoom-in tick ${i} drift ${err}px`);
        if (cam.zoom === CAMERA_LIMITS.maxZoom) reachedMax = true;
        ticks++;
      }
      assert.ok(reachedMax, "sweep must reach maxZoom 12");
      for (let i = 0; i < 6; i++) {
        cam = zoomAtPixel(cam, cam.zoom / 1.55, pixel, vp);
        assert.ok(insideEnvelope(cam));
        const err = errorCssPx(cam, anchor, pixel, vp);
        maxErr = Math.max(maxErr, err);
        assert.ok(err <= TOL_PX, `zoom-out tick ${i} drift ${err}px`);
        ticks++;
      }
      // Reach minZoom exactly via a center-pixel wheel (zero target shift;
      // the center ground IS the camera target, so it must not move).
      const center = { x: vp.width / 2, y: vp.height / 2 };
      const centerGround = groundAtScreen(cam, center, vp);
      cam = zoomAtPixel(cam, .01, center, vp);
      assert.equal(cam.zoom, CAMERA_LIMITS.minZoom);
      assert.ok(errorCssPx(cam, centerGround, center, vp) <= TOL_PX, "center wheel at min clamp");
      ticks++;
      // One more near-edge wheel tick AT min zoom must still grip (<=1px).
      const minAnchor = groundAtScreen(cam, pixel, vp);
      cam = zoomAtPixel(cam, CAMERA_LIMITS.minZoom * 1.1, pixel, vp);
      assert.ok(insideEnvelope(cam), `min-zoom edge tick envelope x=${cam.x} z=${cam.z}`);
      const err = errorCssPx(cam, minAnchor, pixel, vp);
      maxErr = Math.max(maxErr, err);
      assert.ok(err <= TOL_PX, `min-zoom edge anchor drift ${err}px`);
      ticks++;
    }
  }
  console.log(`CAM-01 wheel sweep: ${ticks} ticks, max anchor error ${maxErr.toExponential(3)} CSS px`);
});

test("CAM-01 matrix: orbit/tilt about near-edge cursor preserves ground at max zoom and clamps pitch", () => {
  let cases = 0, maxErr = 0;
  for (const vp of VIEWPORTS) for (const yaw of [0, 90, 180, 270]) for (const elevation of [20, 80]) {
    for (const [fx, fy] of [[.98, .5], [.02, .98]]) {
      const cam = { x: 0, z: 0, yaw, elevation, zoom: 12 };
      const pixel = { x: vp.width * fx, y: vp.height * fy };
      const anchor = groundAtScreen(cam, pixel, vp);
      let moved = orbitAtPixel(cam, 90, 40, pixel, vp);
      moved = orbitAtPixel(moved, -180, -1000, pixel, vp);
      assert.equal(moved.elevation, CAMERA_LIMITS.minElevation);
      assert.ok(insideEnvelope(moved));
      const err = errorCssPx(moved, anchor, pixel, vp);
      maxErr = Math.max(maxErr, err);
      assert.ok(err <= TOL_PX, `orbit drift ${err}px yaw=${yaw} elev=${elevation}`);
      cases++;
    }
  }
  console.log(`CAM-01 orbit matrix: ${cases} cases, max anchor error ${maxErr.toExponential(3)} CSS px`);
});

test("CAM-01 matrix: two-finger twist+pinch near a phone edge shares one anchor", () => {
  const vp = VIEWPORTS[1];
  const centroid = { x: vp.width * .9, y: vp.height * .85 };
  let cam = { x: 0, z: 0, yaw: 45, elevation: 35.264, zoom: 1.37 };
  const anchor = groundAtScreen(cam, centroid, vp);
  const sequence = [[{ x: 360, y: 725 }, 1.15, 11], [{ x: 350, y: 730 }, 1.17, -18], [{ x: 340, y: 720 }, .85, 44], [{ x: 345, y: 715 }, .8, 29]];
  let maxErr = 0;
  for (const [point, ratio, turn] of sequence) {
    cam = transformGesture(cam, anchor, point, vp, ratio, turn);
    assert.ok(insideEnvelope(cam));
    const err = errorCssPx(cam, anchor, point, vp);
    maxErr = Math.max(maxErr, err);
    assert.ok(err <= TOL_PX, `gesture drift ${err}px`);
  }
  assert.notEqual(cam.yaw, 45);
  console.log(`CAM-01 gesture matrix: ${sequence.length} steps, max anchor error ${maxErr.toExponential(3)} CSS px`);
});

// Fixed-seed (337) screen-to-ground golden snapshots. Expected values were
// generated once from the approved PR #307 math and are embedded verbatim;
// any future change to projection/pan math must consciously regenerate them.
const GOLDEN = [{"yaw":114.30506564676762,"elevation":62.93674991466105,"zoom":0.2,"x":-5.1575224893167615,"z":-2.893308480270207,"W":1440,"H":900,"px":189.68634552955626,"py":71.26090604066849,"dx":12,"dy":12,"gx":-80.41863124662281,"gz":289.7133811770609,"camX":-8.42062816404625,"camZ":4.432403236081882},{"yaw":28.789207572117448,"elevation":70.84644071757793,"zoom":0.2,"x":0.2053467370569706,"z":2.65425406396389,"W":1440,"H":900,"px":1306.8855666518211,"py":366.4831194654107,"dx":-12,"dy":12,"gx":209.87966611517285,"gz":-157.39936659925968,"camX":2.160477627334757,"camZ":-4.86224793678312},{"yaw":177.2382511664182,"elevation":48.626017617061734,"zoom":12,"x":-1.3405054714530706,"z":9.596422277390957,"W":844,"H":390,"px":738.3711225649714,"py":338.6826815575361,"dx":-120,"dy":-120,"gx":-6.584573596161671,"gz":6.066623782604863,"camX":-3.257694822945159,"camZ":6.767216700819567},{"yaw":245.39946044795215,"elevation":29.56944379489869,"zoom":0.2,"x":6.210689120925963,"z":6.17576343473047,"W":844,"H":390,"px":298.9086073845625,"py":79.72153385952114,"dx":12,"dy":12,"gx":276.61267082394846,"gz":-8.872225322005718,"camX":34.01114379486293,"camZ":5.367764129225705},{"yaw":97.33656241558492,"elevation":38.75612844247371,"zoom":0.2,"x":-7.907410152256489,"z":-1.1304907780140638,"W":1440,"H":900,"px":1294.461552929878,"py":681.0899261981249,"dx":-12,"dy":-12,"gx":122.21244739866223,"gz":-275.30736607958954,"camX":-0.13860433228434488,"camZ":-7.508093980927072},{"yaw":303.66315870545805,"elevation":43.87393350247294,"zoom":12,"x":-1.9293142622336745,"z":0.2356113214045763,"W":390,"H":844,"px":47.19450617730618,"py":390.2618218243122,"dx":120,"dy":120,"gx":-2.2754096247863114,"gz":-0.9366144252377292,"camX":-1.3164345831263513,"camZ":-1.311397769295445},{"yaw":55.605462826788425,"elevation":20.382439643144608,"zoom":1.37,"x":2.1284062089398503,"z":5.396558786742389,"W":1440,"H":900,"px":1392.8897540330886,"py":682.6123699620366,"dx":-60,"dy":-60,"gx":62.5482085934926,"gz":-6.15050637600951,"camX":13.550771852655146,"camZ":8.498253238766978},{"yaw":281.58283120952547,"elevation":30.10834163520485,"zoom":0.2,"x":-8.27877823729068,"z":-7.923597311601043,"W":844,"H":390,"px":285.36938200622797,"py":232.73194412291048,"dx":12,"dy":-12,"gx":-111.99077114475416,"gz":-129.7140223399141,"camX":-34.78539721262332,"camZ":-15.054389866051494},{"yaw":146.06820398010314,"elevation":28.194545633159578,"zoom":1.37,"x":-4.140381421893835,"z":1.1651133373379707,"W":390,"H":844,"px":54.66787640377879,"py":509.850549300611,"dx":60,"dy":-60,"gx":11.096534221703523,"gz":-4.08903497193244,"camX":4.208488029480296,"camZ":-3.8076694588736775},{"yaw":169.7558655962348,"elevation":54.45200876798481,"zoom":0.2,"x":-9.620404206216335,"z":-9.086237740702927,"W":844,"H":390,"px":688.0312783056498,"py":53.58293452486395,"dx":-12,"dy":12,"gx":-309.8269266820784,"gz":117.81408869317514,"camX":-24.422111045963106,"camZ":3.6107009303858746},{"yaw":218.66337072104216,"elevation":77.77773638255894,"zoom":1.37,"x":-3.1744268955662847,"z":5.443921755068004,"W":390,"H":844,"px":201.19275949001312,"py":192.4949227428436,"dx":-60,"dy":60,"gx":6.641302357133007,"gz":18.397838300064535,"camX":-3.762231923694732,"camZ":11.353974892647622},{"yaw":54.443065943196416,"elevation":75.47937071416527,"zoom":1.37,"x":-7.514535733498633,"z":0.9358331421390176,"W":1440,"H":900,"px":1269.9296932339669,"py":105.66011475026608,"dx":-60,"dy":60,"gx":-5.54123717225232,"gz":-41.51241046882669,"camX":-8.522303707986982,"camZ":-4.569714739484013},{"yaw":67.40050387568772,"elevation":76.72643349505961,"zoom":0.2,"x":9.744525062851608,"z":8.662978801876307,"W":390,"H":844,"px":270.3807645365596,"py":804.1778265097738,"dx":-12,"dy":-12,"gx":195.28210350697367,"gz":47.19602955009578,"camX":17.324666414186026,"camZ":5.657983556856685},{"yaw":7.913540108129382,"elevation":61.60096020437777,"zoom":12,"x":3.415686832740903,"z":-1.8292746972292662,"W":844,"H":390,"px":758.7787403935195,"py":107.07283658087253,"dx":-120,"dy":120,"gx":8.882520058367195,"gz":-4.314259094343416,"camX":5.126379945944824,"camZ":-4.421397925429268},{"yaw":145.3036912623793,"elevation":53.88037782162428,"zoom":12,"x":6.431341860443354,"z":8.912858297117054,"W":390,"H":844,"px":111.68603908494116,"py":64.90541239082813,"dx":120,"dy":120,"gx":4.984771263443681,"gz":12.158368520604558,"camX":6.5427234342822675,"camZ":10.417165339220466},{"yaw":354.9842968862504,"elevation":27.152933245524764,"zoom":1.37,"x":0.3035543905571103,"z":-4.565092422999442,"W":844,"H":390,"px":336.2682231155038,"py":44.493003147840504,"dx":60,"dy":60,"gx":-8.16659887256812,"gz":-54.877836920945164,"camX":-6.924701785419094,"camZ":-24.960432698500647},{"yaw":8.078273423016071,"elevation":78.72350722551346,"zoom":1.37,"x":0.33060694579035044,"z":-3.821808286011219,"W":844,"H":390,"px":24.813731090724467,"py":15.23114682510495,"dx":60,"dy":60,"gx":-62.40634918522441,"gz":-22.6387626515789,"camX":-9.851260127968715,"camZ":-11.629026068224057},{"yaw":241.67872960679233,"elevation":33.21150645148009,"zoom":1.37,"x":-8.237589062191546,"z":-0.19524183124303818,"W":844,"H":390,"px":331.21167296588425,"py":29.80675877407193,"dx":60,"dy":60,"gx":37.96359995857318,"gz":9.261666300655664,"camX":10.462848338168534,"camZ":-0.3224121460700804},{"yaw":243.48087198100984,"elevation":53.597659789957106,"zoom":1.37,"x":6.918021100573242,"z":1.2119693541899323,"W":1440,"H":900,"px":33.97119834423065,"py":694.1375589072704,"dx":60,"dy":-60,"gx":9.182298630441132,"gz":-47.403269418596786,"camX":4.32836396105497,"camZ":-4.4309672916558185},{"yaw":297.8171050362289,"elevation":50.197297148406506,"zoom":12,"x":6.223789770156145,"z":-1.3248926540836692,"W":1440,"H":900,"px":55.62638275623322,"py":75.2268497273326,"dx":120,"dy":120,"gx":7.123214401031476,"gz":-7.363734086002753,"camX":6.83231097787686,"camZ":-2.6509899378030592},{"yaw":279.77251530624926,"elevation":45.46390572562814,"zoom":12,"x":-4.329161117784679,"z":-5.802057208493352,"W":390,"H":844,"px":220.61887081861494,"py":254.51379979521036,"dx":-120,"dy":120,"gx":-2.4657685710205435,"gz":-5.917660176635286,"camX":-2.8578049805745778,"camZ":-5.093653830625827},{"yaw":181.7818748485297,"elevation":37.892292477190495,"zoom":12,"x":2.106854459270835,"z":6.342480243183672,"W":1440,"H":900,"px":1128.047193288803,"py":411.78084902465343,"dx":-120,"dy":120,"gx":-0.8999227780678101,"gz":6.897191277865035,"camX":1.2633979365279835,"camZ":7.816699763463002},{"yaw":248.12915210612118,"elevation":49.11440553609282,"zoom":1.37,"x":9.239679928869009,"z":3.601696384139359,"W":390,"H":844,"px":184.66077897325158,"py":86.97988674968482,"dx":60,"dy":60,"gx":37.95900732039699,"gz":14.35899860190023,"camX":15.881810163427033,"camZ":1.7946927684144907},{"yaw":344.34987181797624,"elevation":53.714587381109595,"zoom":12,"x":7.2393721248954535,"z":-6.573379570618272,"W":844,"H":390,"px":400.64149009495975,"py":145.54058176875114,"dx":120,"dy":120,"gx":7.170746563374155,"gz":-7.681841474984529,"camX":5.950619464801545,"camZ":-9.57716160691777}];

test("CAM-01 fixed-seed 337 snapshots match embedded golden ground coordinates", () => {
  const rand = mulberry32(337);
  const vps = VIEWPORTS;
  let maxErr = 0;
  assert.equal(GOLDEN.length, 24);
  for (let i = 0; i < 24; i++) {
    const v = vps[Math.floor(rand() * 3)];
    const zoom = [.2, 1.37, 12][Math.floor(rand() * 3)];
    const cam = normalizeCamera({ x: (rand() - .5) * 20, z: (rand() - .5) * 20, yaw: rand() * 360, elevation: 20 + rand() * 60, zoom });
    const px = v.width * (.02 + .96 * rand()), py = v.height * (.02 + .96 * rand());
    const d = zoom <= .2 ? 12 : zoom >= 12 ? 120 : 60;
    const dx = px > v.width / 2 ? -d : d, dy = py > v.height / 2 ? -d : d;
    const row = GOLDEN[i];
    assert.ok(Math.abs(cam.yaw - row.yaw) < 1e-9 && Math.abs(cam.elevation - row.elevation) < 1e-9, "seeded pose determinism row " + i);
    assert.equal(cam.zoom, row.zoom); assert.equal(v.width, row.W); assert.equal(v.height, row.H);
    assert.ok(Math.abs(px - row.px) < 1e-9 && Math.abs(py - row.py) < 1e-9, "seeded pixel determinism row " + i);
    const start = { x: px, y: py }, end = { x: px + dx, y: py + dy };
    const g = groundAtScreen(cam, start, v);
    const moved = panWithAnchor(cam, g, end, v);
    assert.ok(Math.abs(g.x - row.gx) < 1e-7 && Math.abs(g.z - row.gz) < 1e-7, `golden ground row ${i}: ${g.x},${g.z} vs ${row.gx},${row.gz}`);
    assert.ok(Math.abs(moved.x - row.camX) < 1e-7 && Math.abs(moved.z - row.camZ) < 1e-7, `golden camera row ${i}`);
    const err = errorCssPx(moved, g, end, v);
    maxErr = Math.max(maxErr, err);
    assert.ok(err <= TOL_PX, `golden grip row ${i}: ${err}px`);
  }
  console.log(`CAM-01 golden snapshots: 24 rows, max grip error ${maxErr.toExponential(3)} CSS px`);
});

test("CAM-01 NEGATIVE: legacy delta-only pan violates the 1px contract by an exact known amount", () => {
  const vp = { width: 1440, height: 900 };
  const pose = { x: 0, z: 0, yaw: 115, elevation: 20, zoom: 1.37 };
  const p0 = { x: vp.width * .48, y: vp.height * .52 };
  const p1 = { x: p0.x + 75, y: p0.y + 38 };
  const anchor = groundAtScreen(pose, p0, vp);
  const legacy = legacyDeltaPan(pose, p0, p1, vp);
  const legacyErr = errorCssPx(legacy, anchor, p1, vp);
  // Exact expected measurement (generated from the documented legacy formula):
  assert.ok(Math.abs(legacyErr - 25.003234553624587) < 1e-6, `legacy delta-pan error expected ~25.003234553624587px, actual ${legacyErr}`);
  assert.ok(legacyErr > TOL_PX, "negative control MUST fail the grip contract, proving matrix sensitivity");
  assert.ok(Math.abs(legacy.x - -0.17799359460439623) < 1e-6 && Math.abs(legacy.z - 5.45223539165582) < 1e-6, "legacy camera target exact");
  const correct = panWithAnchor(pose, anchor, p1, vp);
  const correctErr = errorCssPx(correct, anchor, p1, vp);
  assert.ok(correctErr < 1e-6, `approved pan error ${correctErr}px`);
  console.log(`CAM-01 negative delta-pan: legacy ${legacyErr.toFixed(6)} CSS px (expected 25.003235, > ${TOL_PX}); approved ${correctErr.toExponential(3)} CSS px`);
});

test("CAM-01 NEGATIVE: legacy center-pivot wheel zoom violates the 1px contract by an exact known amount", () => {
  const vp = { width: 1440, height: 900 };
  const pose = { x: 0, z: 0, yaw: 115, elevation: 20, zoom: 1.37 };
  const cursor = { x: vp.width * .98, y: vp.height * .5 };
  const anchor = groundAtScreen(pose, cursor, vp);
  const nextZoom = pose.zoom * 1.55;
  const legacyErr = errorCssPx(legacyCenterZoom(pose, nextZoom), anchor, cursor, vp);
  assert.ok(Math.abs(legacyErr - 380.1600000000002) < 1e-6, `legacy center-zoom error expected ~380.16px, actual ${legacyErr}`);
  assert.ok(legacyErr > TOL_PX);
  const correctErr = errorCssPx(zoomAtPixel(pose, nextZoom, cursor, vp), anchor, cursor, vp);
  assert.ok(correctErr < 1e-9, `approved zoom error ${correctErr}px`);
  console.log(`CAM-01 negative center-zoom: legacy ${legacyErr.toFixed(6)} CSS px (expected 380.160000, > ${TOL_PX}); approved ${correctErr.toExponential(3)} CSS px`);
});

// CAM-03 (#339): the former "documented limit" corner zoom-out slip is now FIXED.
// The pre-fix behavior (pin at requested zoom, then normalizeCamera hard-clamps
// the target to +/-90) is preserved here as a deterministic NEGATIVE control with
// the exact historical constant; the approved zoomAtPixel must instead clamp the
// ZOOM smoothly so the anchored terrain never slides (zero slip, no target jump).
function legacyPinClampZoom(camera, nextZoom, pixel, vp) {
  const c = normalizeCamera(camera);
  const anchor = groundAtScreen(c, pixel, vp);
  const below = groundAtScreen({ ...c, zoom: nextZoom }, pixel, vp);
  return normalizeCamera({ ...c, zoom: nextZoom, x: c.x + (anchor.x - below.x), z: c.z + (anchor.z - below.z) });
}
test("CAM-03 boundary: corner zoom-out clamps zoom smoothly with ZERO anchor slip (legacy 520.892780px negative control)", () => {
  const vp = { width: 1440, height: 900 };
  const pose = { x: 0, z: 0, yaw: 115, elevation: 20, zoom: 1 };
  const corner = { x: vp.width * .98, y: vp.height * .98 };
  const anchor = groundAtScreen(pose, corner, vp);
  // NEGATIVE: pre-fix pin-then-clamp reproduces the exact historical boundary slip.
  const legacy = legacyPinClampZoom(pose, .2, corner, vp);
  assert.equal(legacy.x, -90); assert.equal(legacy.z, 90); assert.equal(legacy.zoom, .2);
  const legacySlip = errorCssPx(legacy, anchor, corner, vp);
  assert.ok(Math.abs(legacySlip - 520.8927797489522) < 1e-6, `legacy boundary slip expected ~520.892780px, actual ${legacySlip}`);
  assert.ok(legacySlip > TOL_PX, "negative control MUST fail the 1px contract, proving sensitivity");
  // POSITIVE: approved zoom clamps smoothly; anchor stays fixed (zero slip).
  const fixed = zoomAtPixel(pose, .2, corner, vp);
  const slip = errorCssPx(fixed, anchor, corner, vp);
  assert.ok(slip <= 1e-9, `CAM-03 boundary slip must be ~0, actual ${slip}`);
  assert.ok(Math.abs(fixed.zoom - 0.5339989951510876) < 1e-9, `smooth clamp zoom expected ~0.533999, actual ${fixed.zoom}`);
  assert.ok(Math.abs(fixed.x - -66.13842108175984) < 1e-6 && Math.abs(fixed.z - 90) < 1e-6, `target on envelope, actual (${fixed.x}, ${fixed.z})`);
  assert.ok(fixed.zoom > CAMERA_LIMITS.minZoom && fixed.zoom < pose.zoom, "zoom clamped between min and current, not teleported");
  // Smooth no-jump clamp: successive zoom-out ticks are monotone non-increasing,
  // converge to the same feasible zoom, and never move the anchor.
  let cam = pose, prevZoom = pose.zoom, maxTickSlip = 0;
  for (let i = 0; i < 12; i++) {
    cam = zoomAtPixel(cam, cam.zoom / 1.55, corner, vp);
    assert.ok(cam.zoom <= prevZoom + 1e-12, `zoom must not jump up: ${prevZoom} -> ${cam.zoom}`);
    maxTickSlip = Math.max(maxTickSlip, errorCssPx(cam, anchor, corner, vp));
    prevZoom = cam.zoom;
  }
  assert.ok(Math.abs(cam.zoom - fixed.zoom) < 1e-9, "ticks converge to the smooth clamp zoom");
  assert.ok(maxTickSlip <= 1e-9, `every clamped tick keeps anchor fixed, max slip ${maxTickSlip}`);
  console.log(`CAM-03 boundary: legacy ${legacySlip.toFixed(6)}px (> ${TOL_PX}); approved slip ${slip.toExponential(3)}px, smooth clamp zoom ${fixed.zoom.toFixed(6)}, target (${fixed.x.toFixed(4)}, ${fixed.z.toFixed(4)})`);
});
