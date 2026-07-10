import { describe, it, expect } from "vitest";
import {
  WALLS,
  WALL_ORDER,
  wallRank,
  referenceCorner,
  thresholdPoint,
  slotList,
  slotWallOffset,
  segmentIntersectsAABB,
  computeFreeCells,
  localCellCenter,
  cellToIndex,
  indexToCell,
} from "./geometry.js";
import type { Aabb2, WallOffset } from "./types.js";

// Constantes de layout (§10) utilisées par les tests géométriques.
const CELL = 4000;
const CLEARANCE = 1000;
const OPTS = { cellSize: CELL, clearance: CLEARANCE };
const TIERS = [3, 5, 7, 9, 11];

describe("WALLS — les quatre murs (§4.1)", () => {
  it("normales, coins de référence et sens d'offset conformes à la table", () => {
    // normale sortante
    expect(WALLS.north.normal).toEqual({ x: 0, z: -1 });
    expect(WALLS.east.normal).toEqual({ x: 1, z: 0 });
    expect(WALLS.south.normal).toEqual({ x: 0, z: 1 });
    expect(WALLS.west.normal).toEqual({ x: -1, z: 0 });
    // sens de l'offset croissant (horaire vu du dessus)
    expect(WALLS.north.offsetDir).toEqual({ x: 1, z: 0 });
    expect(WALLS.east.offsetDir).toEqual({ x: 0, z: 1 });
    expect(WALLS.south.offsetDir).toEqual({ x: -1, z: 0 });
    expect(WALLS.west.offsetDir).toEqual({ x: 0, z: -1 });
  });

  it("wallRank : north=0, east=1, south=2, west=3", () => {
    expect(WALL_ORDER.map(wallRank)).toEqual([0, 1, 2, 3]);
  });

  it("coin de référence = signe · demi-extent, pour une salle 20000×20000", () => {
    expect(referenceCorner("north", 20000, 20000)).toEqual({ x: -10000, z: -10000 });
    expect(referenceCorner("east", 20000, 20000)).toEqual({ x: 10000, z: -10000 });
    expect(referenceCorner("south", 20000, 20000)).toEqual({ x: 10000, z: 10000 });
    expect(referenceCorner("west", 20000, 20000)).toEqual({ x: -10000, z: 10000 });
  });
});

describe("thresholdPoint (§4.3)", () => {
  it("les quatre murs, salle 20000×20000, offset 6000", () => {
    expect(thresholdPoint("north", 6000, 20000, 20000)).toEqual({ x: -4000, z: -10000 });
    expect(thresholdPoint("east", 6000, 20000, 20000)).toEqual({ x: 10000, z: -4000 });
    expect(thresholdPoint("south", 6000, 20000, 20000)).toEqual({ x: 4000, z: 10000 });
    expect(thresholdPoint("west", 6000, 20000, 20000)).toEqual({ x: -10000, z: 4000 });
  });

  it("north : x du seuil = abscisse du centre de la cellule (col−mid)·W (§4.3)", () => {
    const S = 5;
    const side = S * CELL; // 20000
    const mid = (S - 1) / 2;
    slotList(S).forEach((slot, idx) => {
      if (slot.wall !== "north") return;
      const wo = slotWallOffset(idx, S, CELL);
      const t = thresholdPoint("north", wo.offset, side, side);
      expect(t.x).toBe((slot.col - mid) * CELL);
      expect(t.z).toBe(-side / 2);
    });
  });
});

describe("slotList / slotWallOffset — bijection, 4·(S−2) créneaux (§4.2, §9.9)", () => {
  it("compte exactement 4·(S−2) créneaux par palier", () => {
    for (const S of TIERS) {
      expect(slotList(S).length).toBe(4 * (S - 2));
    }
  });

  it("ordre canonique : murs par rang croissant, offset croissant dans chaque mur", () => {
    for (const S of TIERS) {
      const slots = slotList(S);
      // rangs non décroissants (north puis east puis south puis west)
      let prevRank = -1;
      for (const s of slots) {
        const r = wallRank(s.wall);
        expect(r).toBeGreaterThanOrEqual(prevRank);
        prevRank = r;
      }
      // offset strictement croissant à l'intérieur de chaque mur
      for (const wall of WALL_ORDER) {
        let started = false;
        let prevOffset = 0;
        slots.forEach((s, idx) => {
          if (s.wall !== wall) return;
          const off = slotWallOffset(idx, S, CELL).offset;
          if (started) expect(off).toBeGreaterThan(prevOffset);
          prevOffset = off;
          started = true;
        });
      }
    }
  });

  it("(wall, offset) injectif sur tous les indices → 4·(S−2) positions distinctes", () => {
    for (const S of TIERS) {
      const keys = new Set<string>();
      slotList(S).forEach((_slot, idx) => {
        const wo = slotWallOffset(idx, S, CELL);
        keys.add(`${wo.wall}:${wo.offset}`);
      });
      expect(keys.size).toBe(4 * (S - 2));
    }
  });

  it("offsets non-coin ∈ [1.5·W, (S−1.5)·W] (invariant I12 : porte dans le mur)", () => {
    for (const S of TIERS) {
      slotList(S).forEach((_slot, idx) => {
        const { offset } = slotWallOffset(idx, S, CELL);
        expect(offset).toBeGreaterThanOrEqual((3 * CELL) / 2);
        expect(offset).toBeLessThanOrEqual((2 * S - 3) * (CELL / 2));
      });
    }
  });

  it("slotWallOffset lève hors de [0, 4·(S−2))", () => {
    expect(() => slotWallOffset(-1, 5, CELL)).toThrow(RangeError);
    expect(() => slotWallOffset(12, 5, CELL)).toThrow(RangeError); // 4·(5−2)=12
  });
});

/** Boîte AABB depuis quatre bornes, pour la lisibilité des cas construits à la main. */
function box(xMin: number, xMax: number, zMin: number, zMax: number): Aabb2 {
  return { xMin, xMax, zMin, zMax };
}
const O = { x: 0, z: 0 };

describe("segmentIntersectsAABB — batterie construite à la main (§6.4)", () => {
  it("cas nominaux : traversée franche vs manque franc", () => {
    // segment le long de +x, boîte sur son chemin
    expect(segmentIntersectsAABB(O, { x: 10, z: 0 }, box(4, 6, -1, 1))).toBe(true);
    // même segment, boîte décalée en z hors de portée → axe 2 sépare
    expect(segmentIntersectsAABB(O, { x: 100, z: 0 }, box(40, 60, 50, 60))).toBe(false);
    // diagonale traversant la boîte de coin à coin
    expect(segmentIntersectsAABB(O, { x: 30, z: 30 }, box(10, 20, 10, 20))).toBe(true);
  });

  it("SAT — bornes qui se chevauchent mais la DROITE support sépare (axe 3)", () => {
    // segment (0,0)→(30,10) : au niveau x∈[10,20] la droite est en z≈3.3..6.7 < 10
    // → les 4 coins sont du même côté, l'axe 3 rejette bien qu'axes 1/2 se chevauchent.
    expect(segmentIntersectsAABB(O, { x: 30, z: 10 }, box(10, 20, 10, 20))).toBe(false);
    // segment non issu de l'origine : même logique de séparation par la droite
    expect(segmentIntersectsAABB({ x: 5, z: 0 }, { x: 35, z: 10 }, box(10, 20, 15, 25))).toBe(false);
  });

  it("segment de longueur nulle = test point ∈ boîte fermée", () => {
    expect(segmentIntersectsAABB({ x: 5, z: 5 }, { x: 5, z: 5 }, box(0, 10, 0, 10))).toBe(true);
    expect(segmentIntersectsAABB({ x: 15, z: 5 }, { x: 15, z: 5 }, box(0, 10, 0, 10))).toBe(false);
    // point exactement sur un coin de la boîte → inclus (bord fermé)
    expect(segmentIntersectsAABB({ x: 10, z: 10 }, { x: 10, z: 10 }, box(0, 10, 0, 10))).toBe(true);
  });

  it("segment axial (dx==0 / dz==0)", () => {
    // vertical x=5 traversant la bande z de la boîte
    expect(segmentIntersectsAABB({ x: 5, z: -10 }, { x: 5, z: 10 }, box(0, 10, 0, 4))).toBe(true);
    // horizontal trop court pour atteindre la boîte → axe 1 rejette
    expect(segmentIntersectsAABB(O, { x: 5, z: 0 }, box(10, 20, -1, 1))).toBe(false);
    // vertical dont la droite manque la boîte en x
    expect(segmentIntersectsAABB({ x: 20, z: 20 }, { x: 20, z: -20 }, box(0, 10, -5, 5))).toBe(false);
  });

  it("cas limites CONSERVATEURS : seuil sur un coin, AABB tangente → intersection", () => {
    // b exactement au coin (10,10) de la boîte → true (un coin sur la droite n'empêche pas)
    expect(segmentIntersectsAABB(O, { x: 10, z: 10 }, box(10, 20, 10, 20))).toBe(true);
    // segment effleurant le bord xMin de la boîte (tangence) → true
    expect(segmentIntersectsAABB(O, { x: 10, z: 0 }, box(10, 20, -5, 5))).toBe(true);
    // segment colinéaire avec un bord de la boîte (le long de z=0, bord zMax=0) → true
    expect(segmentIntersectsAABB(O, { x: 20, z: 0 }, box(5, 15, -10, 0))).toBe(true);
  });

  it("réduit EXACTEMENT au test origine du §6.4 pour a=(0,0)", () => {
    // Réimplémentation littérale du pseudo-code §6.4 (segment depuis P=(0,0)).
    const specOrigin = (
      tx: number,
      tz: number,
      xmin: number,
      xmax: number,
      zmin: number,
      zmax: number,
    ): boolean => {
      if (Math.max(0, tx) < xmin) return false;
      if (Math.min(0, tx) > xmax) return false;
      if (Math.max(0, tz) < zmin) return false;
      if (Math.min(0, tz) > zmax) return false;
      const s1 = tx * zmin - tz * xmin;
      const s2 = tx * zmin - tz * xmax;
      const s3 = tx * zmax - tz * xmin;
      const s4 = tx * zmax - tz * xmax;
      if (s1 > 0 && s2 > 0 && s3 > 0 && s4 > 0) return false;
      if (s1 < 0 && s2 < 0 && s3 < 0 && s4 < 0) return false;
      return true;
    };
    for (let tx = -12; tx <= 12; tx += 3) {
      for (let tz = -12; tz <= 12; tz += 3) {
        for (const b of [box(-2, 2, -2, 2), box(3, 9, -1, 7), box(-9, -3, 1, 8), box(-1, 1, -8, -2)]) {
          const mine = segmentIntersectsAABB(O, { x: tx, z: tz }, b);
          const spec = specOrigin(tx, tz, b.xMin, b.xMax, b.zMin, b.zMax);
          expect(mine).toBe(spec);
        }
      }
    }
  });
});

describe("computeFreeCells (§6.3)", () => {
  it("sans portail : toutes les cellules sauf la centrale, en ordre row-major", () => {
    const free = computeFreeCells(3, [], OPTS);
    expect(free).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 0, row: 1 },
      { col: 2, row: 1 }, // (1,1) centrale exclue
      { col: 0, row: 2 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
    ]);
  });

  it("la cellule centrale est TOUJOURS exclue", () => {
    for (const S of TIERS) {
      const mid = (S - 1) / 2;
      const free = computeFreeCells(S, [], OPTS);
      expect(free.some((c) => c.col === mid && c.row === mid)).toBe(false);
      expect(free.length).toBe(S * S - 1);
    }
  });

  it("la cellule qui porte un portail est toujours bloquée (§6.5)", () => {
    for (const S of [3, 5, 7]) {
      slotList(S).forEach((slot, idx) => {
        const wo = slotWallOffset(idx, S, CELL);
        const free = computeFreeCells(S, [wo], OPTS);
        // le créneau de porte lui-même n'est jamais une cellule de fichier libre
        expect(free.some((c) => c.col === slot.col && c.row === slot.row)).toBe(false);
      });
    }
  });

  it("bloque les cellules traversées, laisse les cellules opposées libres", () => {
    // S=5, un portail nord au créneau col=1 (seuil en haut à gauche)
    const S = 5;
    const wo: WallOffset = slotWallOffset(0, S, CELL); // index 0 = north col=1
    const free = computeFreeCells(S, [wo], OPTS);
    // la cellule du seuil (1,0) est bloquée
    expect(free.some((c) => c.col === 1 && c.row === 0)).toBe(false);
    // la cellule opposée en bas à droite (4,4) reste libre
    expect(free.some((c) => c.col === 4 && c.row === 4)).toBe(true);
  });

  it("monotone : ajouter des portails ne peut que retirer des cellules libres", () => {
    const S = 7;
    const p0 = slotWallOffset(0, S, CELL);
    const p1 = slotWallOffset(5, S, CELL);
    const p2 = slotWallOffset(11, S, CELL);
    const f0 = computeFreeCells(S, [], OPTS);
    const f1 = computeFreeCells(S, [p0, p1, p2], OPTS);
    const key = (c: { col: number; row: number }): string => `${c.col},${c.row}`;
    const set0 = new Set(f0.map(key));
    for (const c of f1) expect(set0.has(key(c))).toBe(true); // f1 ⊆ f0
    expect(f1.length).toBeLessThanOrEqual(f0.length);
  });

  it("résultat en ordre canonique row-major (row asc, puis col asc)", () => {
    const free = computeFreeCells(5, [slotWallOffset(3, 5, CELL)], OPTS);
    let started = false;
    let prev = -1;
    for (const c of free) {
      const idx = cellToIndex(c, 5);
      if (started) expect(idx).toBeGreaterThan(prev);
      prev = idx;
      started = true;
    }
  });
});

describe("localCellCenter et conversions cellule ↔ index (§9.11)", () => {
  it("centre local d'une cellule, y=0", () => {
    expect(localCellCenter({ col: 2, row: 2 }, 5, CELL)).toEqual({ x: 0, y: 0, z: 0 });
    expect(localCellCenter({ col: 0, row: 0 }, 5, CELL)).toEqual({ x: -8000, y: 0, z: -8000 });
    expect(localCellCenter({ col: 4, row: 4 }, 5, CELL)).toEqual({ x: 8000, y: 0, z: 8000 });
  });

  it("cellToIndex / indexToCell sont réciproques (row-major)", () => {
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const idx = cellToIndex({ col, row }, 5);
        expect(idx).toBe(row * 5 + col);
        expect(indexToCell(idx, 5)).toEqual({ col, row });
      }
    }
  });
});
