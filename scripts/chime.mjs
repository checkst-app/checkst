// Generates the Android "task checked off" sound: two soft bell notes (C6, then G6), quick
// attack, exponential decay, no clicks. Writes complete.wav into the current folder:
//
//   node scripts/chime.mjs
//   ffmpeg -i complete.wav -c:a libvorbis -q:a 5 src-tauri/gen/android/app/src/main/res/raw/complete.ogg
import { writeFileSync } from "node:fs";
const rate = 44100, dur = 0.6, n = Math.round(rate * dur);
const notes = [
  { f: 1046.5, t0: 0, tau: 0.11, gain: 0.8 },
  { f: 1568.0, t0: 0.075, tau: 0.16, gain: 1.0 },
];
// Partials: fundamental, octave, and a faint inharmonic "bell" partial that fades faster.
const partials = [[1, 1, 1], [2, 0.18, 0.7], [2.76, 0.07, 0.45]];
const out = new Float64Array(n);
for (const { f, t0, tau, gain } of notes) {
  for (let i = Math.round(t0 * rate); i < n; i++) {
    const t = i / rate - t0;
    const attack = Math.min(1, t / 0.004);
    for (const [m, a, decay] of partials) out[i] += gain * a * attack * Math.exp(-t / (tau * decay)) * Math.sin(2 * Math.PI * f * m * t);
  }
}
const fade = Math.round(0.05 * rate);
for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
const peak = Math.max(...out.map(Math.abs));
const pcm = Buffer.alloc(44 + n * 2);
pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write("WAVE", 8); pcm.write("fmt ", 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(rate, 24);
pcm.writeUInt32LE(rate * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round((out[i] / peak) * 0.45 * 32767), 44 + i * 2);
writeFileSync("complete.wav", pcm);
console.log("peak", peak.toFixed(3), "samples", n);
