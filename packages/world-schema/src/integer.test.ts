import { describe, it, expect } from "vitest";
import { min, max, abs, div, mod, ceilDiv, isqrtFloor, isqrtCeil } from "./integer.js";

describe("min/max/abs", () => {
  it("compare et absolut", () => {
    expect(min(3, 7)).toBe(3);
    expect(min(-2, -5)).toBe(-5);
    expect(max(3, 7)).toBe(7);
    expect(max(-2, -5)).toBe(-2);
    expect(abs(-9)).toBe(9);
    expect(abs(0)).toBe(0);
    expect(abs(4)).toBe(4);
  });
});

describe("div", () => {
  it("tronque vers zéro pour a≥0, b>0", () => {
    expect(div(0, 1)).toBe(0);
    expect(div(7, 2)).toBe(3);
    expect(div(8, 2)).toBe(4);
    expect(div(9, 3)).toBe(3);
    expect(div(1, 4)).toBe(0);
  });

  it("reste exact sur de grands entiers sûrs", () => {
    expect(div(9007199254740990, 3)).toBe(3002399751580330);
    expect(div(4294967295, 65537)).toBe(65535);
  });
});

describe("mod", () => {
  it("rend un reste dans [0, n)", () => {
    expect(mod(0, 5)).toBe(0);
    expect(mod(7, 5)).toBe(2);
    expect(mod(10, 5)).toBe(0);
    expect(mod(-1, 5)).toBe(4);
    expect(mod(-7, 5)).toBe(3);
  });
});

describe("ceilDiv", () => {
  it("bords 0 et 1", () => {
    expect(ceilDiv(0, 1)).toBe(0);
    expect(ceilDiv(0, 7)).toBe(0);
    expect(ceilDiv(1, 1)).toBe(1);
    expect(ceilDiv(1, 2)).toBe(1);
  });

  it("plafonne correctement", () => {
    expect(ceilDiv(6, 3)).toBe(2);
    expect(ceilDiv(7, 3)).toBe(3);
    expect(ceilDiv(9, 3)).toBe(3);
    expect(ceilDiv(10, 3)).toBe(4);
  });
});

describe("isqrtFloor", () => {
  it("bords et carrés parfaits", () => {
    expect(isqrtFloor(0)).toBe(0);
    expect(isqrtFloor(1)).toBe(1);
    expect(isqrtFloor(2)).toBe(1);
    expect(isqrtFloor(3)).toBe(1);
    expect(isqrtFloor(4)).toBe(2);
    expect(isqrtFloor(8)).toBe(2);
    expect(isqrtFloor(9)).toBe(3);
    expect(isqrtFloor(15)).toBe(3);
    expect(isqrtFloor(16)).toBe(4);
  });

  it("grands carrés parfaits ± 1", () => {
    expect(isqrtFloor(1000000 * 1000000)).toBe(1000000);
    expect(isqrtFloor(1000000 * 1000000 - 1)).toBe(999999);
    expect(isqrtFloor(1000000 * 1000000 + 1)).toBe(1000000);
  });
});

describe("isqrtCeil", () => {
  it("bords : 0, 1", () => {
    expect(isqrtCeil(0)).toBe(0);
    expect(isqrtCeil(1)).toBe(1);
  });

  it("carrés parfaits rendent la racine exacte", () => {
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(isqrtCeil(k * k)).toBe(k);
    }
  });

  it("carré parfait − 1 monte d'un cran", () => {
    expect(isqrtCeil(4 - 1)).toBe(2); // 3 → 2 (2²=4 ≥ 3)
    expect(isqrtCeil(9 - 1)).toBe(3); // 8 → 3
    expect(isqrtCeil(16 - 1)).toBe(4);
    expect(isqrtCeil(100 - 1)).toBe(10);
  });

  it("carré parfait + 1 monte d'un cran", () => {
    expect(isqrtCeil(4 + 1)).toBe(3); // 5 → 3 (2²=4 < 5, 3²=9 ≥ 5)
    expect(isqrtCeil(9 + 1)).toBe(4); // 10 → 4
    expect(isqrtCeil(1)).toBe(1);
    expect(isqrtCeil(2)).toBe(2); // 1²=1<2, 2²=4≥2
  });

  it("cohérent avec la définition sur une plage", () => {
    for (let n = 0; n <= 200; n++) {
      const r = isqrtCeil(n);
      expect(r * r).toBeGreaterThanOrEqual(n);
      if (r > 0) expect((r - 1) * (r - 1)).toBeLessThan(n);
    }
  });
});
