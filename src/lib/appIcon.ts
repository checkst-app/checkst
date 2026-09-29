import { backend } from "./backend";
import { ACCENTS, type AccentName } from "./settings";

type Rgb = [number, number, number];

const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** Tile gradient and check color per accent. Green keeps the exact values of the designed app icon. */
function palette(accent: AccentName) {
  if (accent === "green") return { top: "#23866A", bottom: "#1A6B4F", check: "#BFEBD6" };
  const base = hex(ACCENTS[accent].light[0]);
  return { top: css(mix(base, WHITE, 0.08)), bottom: css(mix(base, BLACK, 0.12)), check: css(mix(base, WHITE, 0.72)) };
}

/** Renders the "Offenes c" app icon (same geometry as src-tauri/icons/app-icon.svg) as PNG. */
export function renderAppIcon(accent: AccentName, size: number): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const { top, bottom, check } = palette(accent);
  ctx.scale(size / 1024, size / 1024);

  const bg = ctx.createLinearGradient(0, 0, 0, 1024);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, 1024, 1024, 236);
  ctx.fill();

  ctx.translate(205, 205);
  ctx.scale(6.14, 6.14);
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#FFFFFF";
  ctx.stroke(new Path2D("M70 15.36 A40 40 0 1 0 70 84.64"));
  ctx.strokeStyle = check;
  ctx.stroke(new Path2D("M32 50 l16 16 42 -40"));

  const url = canvas.toDataURL("image/png");
  return Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
}

/** Packs square PNGs into an .ico file (Windows reads PNG entries since Vista). */
export function packIco(images: { size: number; png: Uint8Array }[]): Uint8Array {
  const header = 6 + 16 * images.length;
  const out = new Uint8Array(header + images.reduce((n, i) => n + i.png.length, 0));
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);
  let offset = header;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    view.setUint8(entry, size % 256); // 0 means 256
    view.setUint8(entry + 1, size % 256);
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 256];

export async function applyAppIcon(accent: AccentName) {
  const windowSize = 128;
  const traySize = 32;
  const ico = packIco(ICO_SIZES.map((size) => ({ size, png: renderAppIcon(accent, size) })));
  await backend.setAppIcon(Array.from(renderAppIcon(accent, windowSize)), Array.from(renderAppIcon(accent, traySize)), Array.from(ico));
}
