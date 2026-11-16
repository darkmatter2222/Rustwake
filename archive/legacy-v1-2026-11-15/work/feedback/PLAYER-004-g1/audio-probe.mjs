// PLAYER-004 g1: audio evidence. Real OfflineAudioContext render of the shipped cue
// table (rendered and measured in-process, i.e. decoded, not played through a speaker),
// plus the served-bundle fact about whether any wav/pcm asset exists at all.
// Usage: node work/feedback/PLAYER-004-g1/audio-probe.mjs
import { BASE, openMobile } from "./lib.mjs";
import { writeFileSync } from "node:fs";

// --- 1. what does the served bundle actually contain for audio?
const chunks = ["index-C_K4oMJ5.js", "tables-BB2NPvQ2.js", "index-B1FOV2xO.css", "catchup.worker-G_Jyr7uh.js"];
const served = await Promise.all(
  chunks.map(async (n) => ({ n, t: await (await fetch(BASE + "assets/" + n, { cache: "no-store" })).text() })),
);
const all = served.map((s) => s.t).join("\n");
const facts = {
  chunkLengths: served.map((s) => ({ n: s.n, chars: s.t.length })),
  hasWavRef: /\.wav/.test(all),
  hasDecodeAudioData: /decodeAudioData/.test(all),
  hasPcmRef: /\.pcm/.test(all),
  createOscillator: /createOscillator/.test(all),
  createBuffer: /createBuffer/.test(all),
  oscillatorChunk: served.filter((s) => /createOscillator/.test(s.t)).map((s) => s.n),
};
// the cue table as the served bytes carry it: name:{bus,freq,to,duration,type,gain,attack}
const cueRe =
  /([a-z]+):\{bus:"(\w+)",freq:([\d.]+)(?:,to:([\d.]+))?,duration:([\d.]+),type:"(\w+)",gain:([\d.]+),attack:([\d.]+)(,tail:!?0)?\}/g;
const cues = [];
let m;
while ((m = cueRe.exec(all))) {
  cues.push({
    name: m[1],
    bus: m[2],
    freq: +m[3],
    to: m[4] === undefined ? null : +m[4],
    duration: +m[5],
    type: m[6],
    gain: +m[7],
    attack: +m[8],
    tail: !!m[9],
  });
}

// --- 2. render those exact cues in the page and measure the PCM
const { page } = await openMobile();
await page.goto(BASE, { waitUntil: "load" });
const rendered = await page.evaluate(async (cues) => {
  const measure = async (c) => {
    const rate = new AudioContext().sampleRate;
    const oc = new OfflineAudioContext(1, Math.ceil(c.duration * rate), rate);
    const osc = oc.createOscillator();
    osc.type = c.type;
    osc.frequency.setValueAtTime(c.freq, 0);
    if (c.to) osc.frequency.linearRampToValueAtTime(c.to, c.duration);
    const g = oc.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.linearRampToValueAtTime(c.gain, c.attack);
    g.gain.setTargetAtTime(0.0001, c.duration * 0.6, c.duration / 4);
    osc.connect(g).connect(oc.destination);
    osc.start(0);
    osc.stop(c.duration);
    const buf = await oc.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0,
      sum2 = 0,
      nonZero = 0;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum2 += d[i] * d[i];
      if (a > 1e-6) nonZero++;
    }
    return {
      name: c.name,
      sampleRate: buf.sampleRate,
      frames: d.length,
      seconds: +(d.length / buf.sampleRate).toFixed(5),
      peak: +peak.toFixed(4),
      rms: +Math.sqrt(sum2 / d.length).toFixed(4),
      nonZeroShare: +(nonZero / d.length).toFixed(3),
    };
  };
  const out = [];
  for (const c of cues) out.push(await measure(c));
  return { deviceRate: new AudioContext().sampleRate, out };
}, cues);

const result = { servedFacts: facts, cueTableFromServedBytes: cues, rendered: rendered };
writeFileSync("work/feedback/PLAYER-004-g1/audio.json", JSON.stringify(result, null, 1), "utf8");
console.log(JSON.stringify(facts));
console.log("cueCount", cues.length);
console.log(JSON.stringify(rendered.out, null, 0));
await page.context().browser().close();
