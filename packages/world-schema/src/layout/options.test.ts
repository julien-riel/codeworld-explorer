import { describe, it, expect } from "vitest";
import {
  DEFAULT_LAYOUT_OPTIONS,
  assertLayoutOptionsCoherent,
  type LayoutOptions,
} from "./options.js";

/** Clone des défauts avec un champ surchargé, pour isoler UN invariant à la fois. */
function withOverride(over: Partial<LayoutOptions>): LayoutOptions {
  return { ...DEFAULT_LAYOUT_OPTIONS, ...over };
}

describe("DEFAULT_LAYOUT_OPTIONS — valeurs entières exactes du §10.2", () => {
  it("porte les constantes attendues", () => {
    expect(DEFAULT_LAYOUT_OPTIONS).toStrictEqual({
      cellSize: 4000,
      margin: 8000,
      clearance: 1000,
      roomHeight: 4000,
      floorHeight: 6000,
      doorWidth: 2000,
      doorHeight: 3000,
      normalSpeed: 6000,
      doorReachBudgetSeconds: 8,
      hopBudgetSeconds: 3,
      maxRoomHalfExtent: 48000,
      roomSideTiers: [3, 5, 7, 9, 11],
      plazaThreshold: 8,
      galleryThreshold: 12,
      reservedSlotCount: 3,
      maxRenderDepth: 20,
    });
  });

  it("toutes les valeurs numériques sont des entiers", () => {
    for (const [, v] of Object.entries(DEFAULT_LAYOUT_OPTIONS)) {
      if (typeof v === "number") expect(Number.isInteger(v)).toBe(true);
      else for (const s of v) expect(Number.isInteger(s)).toBe(true);
    }
  });
});

describe("assertLayoutOptionsCoherent — cohérence du §10.1", () => {
  it("passe sur les valeurs par défaut", () => {
    expect(() => assertLayoutOptionsCoherent(DEFAULT_LAYOUT_OPTIONS)).not.toThrow();
  });

  it("échoue si maxRoomHalfExtent ≠ normalSpeed·doorReachBudgetSeconds", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ maxRoomHalfExtent: 47000 }))).toThrow(/half-extent/);
  });

  it("échoue si margin > normalSpeed·hopBudgetSeconds", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ margin: 20000 }))).toThrow(/hop-budget/);
  });

  it("échoue si un palier est pair", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ roomSideTiers: [3, 4, 7, 9, 11] }))).toThrow(/tiers-odd/);
  });

  it("échoue si les paliers ne sont pas strictement croissants", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ roomSideTiers: [3, 5, 5, 9, 11] }))).toThrow(/tiers-increasing/);
  });

  it("échoue si roomSideTiers est vide", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ roomSideTiers: [] }))).toThrow(/tiers-nonempty/);
  });

  it("échoue si le plus grand palier dépasse le plafond d'extent", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ roomSideTiers: [3, 5, 7, 9, 49] }))).toThrow(/extent-ceiling/);
  });

  it("échoue si cellSize est impair", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ cellSize: 4001 }))).toThrow(/cellSize-even/);
  });

  it("échoue si margin est impair", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ margin: 8001 }))).toThrow(/margin-even/);
  });

  it("échoue si max(footprint)+clearance > cellSize", () => {
    // clearance = 2000 ⇒ readme-stand : max(3000,1500)+2000 = 5000 > 4000
    expect(() => assertLayoutOptionsCoherent(withOverride({ clearance: 2000 }))).toThrow(/footprint-clearance/);
  });

  it("échoue si doorWidth > cellSize", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ doorWidth: 5000 }))).toThrow(/door-width/);
  });

  it("échoue si reservedSlotCount ≠ 3", () => {
    expect(() => assertLayoutOptionsCoherent(withOverride({ reservedSlotCount: 4 }))).toThrow(/reserved-count/);
  });

  it("échoue si doorCapacity(S) ≤ 0 pour un palier", () => {
    // S=1 ⇒ doorCapacity = 4·(1−2) − 3 = −7 ≤ 0 (reservedSlotCount reste 3)
    expect(() => assertLayoutOptionsCoherent(withOverride({ roomSideTiers: [1, 3, 5, 7, 9] }))).toThrow(/door-capacity/);
  });
});
