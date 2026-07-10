import { describe, expect, it } from "vitest";
import type { SpatialNode } from "@codeworld/world-schema";
import {
  buildProjection,
  computeBounds,
  projectPoint,
  projectRoom,
  projectRooms,
  roomAtPoint,
  toMinimapRoom,
  type MinimapRoom,
  type Viewport,
} from "./projection";

/** Salle-carte minimale (mm) pour les tests de projection. */
function mkRoom(id: string, cx: number, cz: number, hx = 10000, hz = 10000): MinimapRoom {
  return { id, center: { x: cx, z: cz }, half: { x: hx, z: hz } };
}

/** `SpatialNode` minimal, ne renseignant que ce que `toMinimapRoom` lit. */
function mkSpatial(id: string, orientation: SpatialNode["orientation"]): SpatialNode {
  return {
    id,
    sourceNodeId: "n_x",
    role: "primary",
    page: 0,
    pageCount: 1,
    spaceType: "room",
    theme: "neutral",
    level: 0,
    depthFlattened: false,
    position: { x: 1000, y: 0, z: 2000 },
    orientation,
    // Largeur ≠ profondeur pour révéler l'échange d'axes selon l'orientation.
    dimensions: { x: 30000, y: 4000, z: 10000 },
    portals: [],
    objects: [],
  };
}

const VIEWPORT: Viewport = { width: 200, height: 200, padding: 20 };

describe("toMinimapRoom", () => {
  it("garde largeur/profondeur pour une orientation paire (0/2)", () => {
    const r0 = toMinimapRoom(mkSpatial("s_a", 0));
    expect(r0.center).toEqual({ x: 1000, z: 2000 });
    expect(r0.half).toEqual({ x: 15000, z: 5000 });
    expect(toMinimapRoom(mkSpatial("s_a", 2)).half).toEqual({ x: 15000, z: 5000 });
  });

  it("échange largeur/profondeur pour une orientation impaire (1/3)", () => {
    expect(toMinimapRoom(mkSpatial("s_a", 1)).half).toEqual({ x: 5000, z: 15000 });
    expect(toMinimapRoom(mkSpatial("s_a", 3)).half).toEqual({ x: 5000, z: 15000 });
  });
});

describe("computeBounds", () => {
  it("englobe l'emprise (centre ± demi-étendue), pas seulement les centres", () => {
    const bounds = computeBounds([mkRoom("s_a", 0, 0, 10000, 5000), mkRoom("s_b", 40000, 20000, 10000, 5000)]);
    expect(bounds).toEqual({ minX: -10000, maxX: 50000, minZ: -5000, maxZ: 25000 });
  });

  it("rend null sans salle", () => {
    expect(computeBounds([])).toBeNull();
  });
});

describe("buildProjection / projectPoint", () => {
  it("inscrit les salles dans le cadre à échelle uniforme et centrée", () => {
    // Emprise monde 100 000 mm × 50 000 mm ; zone utile 160 px × 160 px.
    // scale = min(160/100000, 160/50000) = 0.0016 px/mm (contrainte par l'axe x).
    const rooms = [mkRoom("s_a", 0, 0, 10000, 5000), mkRoom("s_b", 80000, 40000, 10000, 5000)];
    const proj = buildProjection(rooms, VIEWPORT);
    expect(proj.scale).toBeCloseTo(0.0016, 12);

    // Le coin (minX, minZ) = (−10000, −5000) tombe sur le bord de la marge en x
    // (contrainte par l'axe x) et sur le haut du contenu centré verticalement en z :
    // x = 20 (padding gauche) ; y = 20 + (160 − 50000·0.0016)/2 = 20 + 40 = 60.
    const nw = projectPoint(proj, -10000, -5000);
    expect(nw.x).toBeCloseTo(20, 9);
    expect(nw.y).toBeCloseTo(60, 9);

    // Coin opposé (maxX, maxZ) = (90000, 45000) : bord droit de la marge, bas du contenu.
    const se = projectPoint(proj, 90000, 45000);
    expect(se.x).toBeCloseTo(180, 9);
    expect(se.y).toBeCloseTo(140, 9);
  });

  it("est stable : mêmes entrées → projection identique", () => {
    const rooms = [mkRoom("s_a", 0, 0), mkRoom("s_b", 30000, 10000)];
    const a = buildProjection(rooms, VIEWPORT);
    const b = buildProjection(rooms, VIEWPORT);
    expect(a).toEqual(b);
    expect(projectPoint(a, 12345, -6789)).toEqual(projectPoint(b, 12345, -6789));
  });

  it("projette « nord en haut » : −z est au-dessus de +z", () => {
    const proj = buildProjection([mkRoom("s_a", 0, 0), mkRoom("s_b", 0, 40000)], VIEWPORT);
    const north = projectPoint(proj, 0, -10000);
    const south = projectPoint(proj, 0, 10000);
    expect(north.y).toBeLessThan(south.y);
  });

  it("centre une salle unique sans la déformer (échelle de repli)", () => {
    const proj = buildProjection([mkRoom("s_solo", 5000, 5000)], VIEWPORT);
    const c = projectPoint(proj, 5000, 5000);
    expect(c.x).toBeCloseTo(VIEWPORT.width / 2, 9);
    expect(c.y).toBeCloseTo(VIEWPORT.height / 2, 9);
  });
});

describe("projectRoom", () => {
  it("centre le rectangle sur la position et l'échelonne", () => {
    const proj = buildProjection([mkRoom("s_a", 0, 0, 10000, 5000), mkRoom("s_b", 80000, 40000, 10000, 5000)], VIEWPORT);
    const r = projectRoom(proj, mkRoom("s_a", 0, 0, 10000, 5000));
    const c = projectPoint(proj, 0, 0);
    expect(r.cx).toBeCloseTo(c.x, 9);
    expect(r.cy).toBeCloseTo(c.y, 9);
    expect(r.width).toBeCloseTo(20000 * proj.scale, 9);
    expect(r.height).toBeCloseTo(10000 * proj.scale, 9);
    expect(r.left).toBeCloseTo(c.x - r.width / 2, 9);
    expect(r.top).toBeCloseTo(c.y - r.height / 2, 9);
  });
});

describe("roomAtPoint", () => {
  const rooms = [mkRoom("s_a", 0, 0, 10000, 10000), mkRoom("s_b", 60000, 40000, 10000, 10000)];
  const proj = buildProjection(rooms, VIEWPORT);

  it("résout la salle dont le rectangle contient le clic", () => {
    const a = projectRoom(proj, rooms[0]!);
    expect(roomAtPoint(proj, rooms, a.cx, a.cy)).toBe("s_a");
    const b = projectRoom(proj, rooms[1]!);
    expect(roomAtPoint(proj, rooms, b.cx, b.cy)).toBe("s_b");
  });

  it("rend null hors de toute salle", () => {
    expect(roomAtPoint(proj, rooms, -100, -100)).toBeNull();
  });

  it("en cas de recouvrement, retient le centre le plus proche (déterministe)", () => {
    // Deux salles superposées : une large centrée en 0, une petite décalée en +x.
    const overlap = [mkRoom("wide", 0, 0, 20000, 20000), mkRoom("small", 8000, 0, 4000, 4000)];
    const p = buildProjection(overlap, VIEWPORT);
    const smallCenter = projectRoom(p, overlap[1]!);
    // Au centre de la petite salle, elle gagne (son centre est à distance nulle).
    expect(roomAtPoint(p, overlap, smallCenter.cx, smallCenter.cy)).toBe("small");
  });
});

describe("couverture / atteignabilité (§23.1)", () => {
  it("chaque salle est un rectangle cliquable, et son centre la résout (aller-retour)", () => {
    const rooms = [
      mkRoom("s_hall", 0, 0),
      mkRoom("s_1", 40000, 0),
      mkRoom("s_2", -40000, 30000),
      mkRoom("s_3", 20000, -50000),
    ];
    const proj = buildProjection(rooms, { width: 300, height: 260, padding: 16 });
    const projected = projectRooms(proj, rooms);
    // Couverture 1:1 : un rectangle par salle, aucun oublié.
    expect(projected.map((r) => r.id).sort()).toEqual(rooms.map((r) => r.id).sort());
    // Toute salle est atteignable : cliquer son centre la résout (téléportation, pas de marche).
    for (const room of rooms) {
      const r = projectRoom(proj, room);
      expect(roomAtPoint(proj, rooms, r.cx, r.cy)).toBe(room.id);
    }
  });
});
