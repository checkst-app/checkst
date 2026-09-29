import { describe, expect, it } from "vitest";
import { packIco } from "./appIcon";

describe("packIco", () => {
  it("writes the icon directory and the PNGs behind it", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const ico = packIco([
      { size: 16, png: a },
      { size: 256, png: b },
    ]);
    const view = new DataView(ico.buffer);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 2]);
    // 16 px entry
    expect([ico[6], ico[7], view.getUint16(12, true), view.getUint32(14, true), view.getUint32(18, true)]).toEqual([16, 16, 32, 3, 38]);
    // 256 px is stored as 0
    expect([ico[22], ico[23], view.getUint32(30, true), view.getUint32(34, true)]).toEqual([0, 0, 2, 41]);
    expect(Array.from(ico.slice(38))).toEqual([1, 2, 3, 4, 5]);
  });
});
