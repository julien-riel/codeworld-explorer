import { describe, expect, it } from "vitest";
import {
  orientationToYaw,
  rotateByOrientation,
  thresholdPoint,
  wallAxis,
  wallLength,
  wallPanels,
} from "./roomGeometry";

describe("orientationToYaw", () => {
  it("mappe chaque orientation sur un quart de tour horaire (−o·π/2)", () => {
    expect(orientationToYaw(0)).toBeCloseTo(0);
    expect(orientationToYaw(1)).toBeCloseTo(-Math.PI / 2);
    expect(orientationToYaw(2)).toBeCloseTo(-Math.PI);
    expect(orientationToYaw(3)).toBeCloseTo((-3 * Math.PI) / 2);
  });
});

describe("rotateByOrientation", () => {
  it("est l'identité pour l'orientation 0", () => {
    expect(rotateByOrientation(2000, -3000, 0)).toEqual({ x: 2000, z: -3000 });
  });
  it("tourne +x vers +z d'un quart de tour horaire (orientation 1)", () => {
    // Vu du dessus, un quart de tour horaire envoie l'est (+x) vers le sud (+z).
    expect(rotateByOrientation(1, 0, 1)).toEqual({ x: 0, z: 1 });
  });
  it("est une demi-tour pour l'orientation 2", () => {
    expect(rotateByOrientation(5, 7, 2)).toEqual({ x: -5, z: -7 });
  });
  it("reste exacte (aucun résidu flottant) sur les multiples de 90°", () => {
    expect(rotateByOrientation(1, 0, 3)).toEqual({ x: 0, z: -1 });
  });
});

describe("thresholdPoint", () => {
  const w = 20000;
  const d = 20000;
  it("place une porte nord au bon endroit du mur", () => {
    // north : coin de référence à l'ouest, offset croissant vers +x, z = −d/2.
    expect(thresholdPoint("north", 6000, w, d)).toEqual({ x: -4000, z: -10000 });
  });
  it("place une porte est le long de +z", () => {
    expect(thresholdPoint("east", 6000, w, d)).toEqual({ x: 10000, z: -4000 });
  });
  it("place une porte sud en parcourant −x", () => {
    expect(thresholdPoint("south", 6000, w, d)).toEqual({ x: 4000, z: 10000 });
  });
  it("place une porte ouest en parcourant −z", () => {
    expect(thresholdPoint("west", 6000, w, d)).toEqual({ x: -10000, z: 4000 });
  });
  it("place le centre d'un mur à offset = moitié de la longueur", () => {
    expect(thresholdPoint("north", 10000, w, d)).toEqual({ x: 0, z: -10000 });
  });
});

describe("wallLength / wallAxis", () => {
  it("nord/sud portent sur x (largeur w), est/ouest sur z (profondeur d)", () => {
    expect(wallLength("north", 20000, 28000)).toBe(20000);
    expect(wallLength("east", 20000, 28000)).toBe(28000);
    expect(wallAxis("north")).toBe("x");
    expect(wallAxis("west")).toBe("z");
  });
});

describe("wallPanels", () => {
  it("rend un seul panneau pleine hauteur sans ouverture", () => {
    const panels = wallPanels(20000, 4000, []);
    expect(panels).toEqual([{ u: 10000, length: 20000, base: 0, height: 4000 }]);
  });

  it("découpe un mur en deux segments + un linteau autour d'une porte", () => {
    const panels = wallPanels(20000, 4000, [{ u: 6000, width: 2000, height: 3000 }]);
    // Ouverture sur [5000, 7000].
    expect(panels).toEqual([
      { u: 2500, length: 5000, base: 0, height: 4000 },
      { u: 6000, length: 2000, base: 3000, height: 1000 },
      { u: 13500, length: 13000, base: 0, height: 4000 },
    ]);
  });

  it("conserve toute la longueur pleine hauteur hors ouverture", () => {
    const panels = wallPanels(20000, 4000, [{ u: 6000, width: 2000, height: 3000 }]);
    const fullHeight = panels.filter((p) => p.height === 4000);
    const covered = fullHeight.reduce((sum, p) => sum + p.length, 0);
    expect(covered).toBe(18000);
  });

  it("gère deux portes sur le même mur", () => {
    const panels = wallPanels(28000, 4000, [
      { u: 14000, width: 2000, height: 3000 },
      { u: 22000, width: 2000, height: 3000 },
    ]);
    // Segments pleins + un linteau par porte.
    expect(panels.filter((p) => p.base === 3000)).toHaveLength(2);
    const covered = panels
      .filter((p) => p.height === 4000)
      .reduce((sum, p) => sum + p.length, 0);
    expect(covered).toBe(28000 - 2 * 2000);
  });
});
