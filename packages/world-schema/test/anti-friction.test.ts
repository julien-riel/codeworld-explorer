/**
 * Suite 6 — RÈGLES ANTI-FRICTION (PRD §9.4), vérifiées sur le graphe spatial de
 * chaque fixture, en re-dérivant la géométrie sur l'artefact (défense en profondeur,
 * indépendante de la garde interne de `computeLayout`) :
 *
 *   (a) depuis le centre de chaque salle, le segment vers le seuil de chaque portail
 *       n'intersecte l'emprise ORIENTÉE d'aucun objet (visibilité des portes) ;
 *   (b) `dimensions.x`/`z ≤ 2·maxRoomHalfExtent` : le trajet centre→porte tient sous
 *       le budget de 8 s à `normalSpeed` (règle des 15 s) ;
 *   (c) un parcours en largeur du graphe des portails depuis le `hall` atteint TOUTES
 *       les salles (connexité).
 */

import { describe, it, expect } from "vitest";
import { div } from "../src/index";
import type { FileObject, SpatialNode, WorldLayout } from "../src/index";
import { thresholdPoint, segmentIntersectsAABB } from "../src/layout/geometry";
import type { Aabb2, Point2 } from "../src/layout/types";
import { FIXTURES, layoutOf } from "./fixtures";

const CENTER: Point2 = { x: 0, z: 0 };

/**
 * AABB au sol PHYSIQUE d'un objet, coordonnées LOCALES au centre de la salle,
 * ORIENTATION appliquée : un quart de tour est/ouest (orientation 1 ou 3) transpose
 * l'emprise (layout-engine-v0 §11 I2). Re-dérivée ici, indépendamment de la
 * production, pour tester la géométrie réellement rendue.
 */
function orientedFootprint(o: FileObject): Aabb2 {
  const turned = o.orientation === 1 || o.orientation === 3;
  const ex = turned ? o.footprint.z : o.footprint.x;
  const ez = turned ? o.footprint.x : o.footprint.z;
  const hx = div(ex, 2);
  const hz = div(ez, 2);
  return {
    xMin: o.position.x - hx,
    xMax: o.position.x + hx,
    zMin: o.position.z - hz,
    zMax: o.position.z + hz,
  };
}

/** (a) Aucun objet n'occulte une porte depuis le centre de sa salle. */
function assertPortalsVisible(layout: WorldLayout): void {
  for (const room of layout.spatialNodes) {
    const boxes = room.objects.map((o) => ({ o, box: orientedFootprint(o) }));
    for (const p of room.portals) {
      const seuil = thresholdPoint(p.wall, p.offset, room.dimensions.x, room.dimensions.z);
      for (const { o, box } of boxes) {
        const occluded = segmentIntersectsAABB(CENTER, seuil, box);
        expect(
          occluded,
          `salle ${room.id} : l'objet ${o.sourceNodeId} occulte le portail ${p.id}`,
        ).toBe(false);
      }
    }
  }
}

/** (b) Extent borné : le trajet centre→porte reste sous le budget des 8 s. */
function assertExtentBudget(layout: WorldLayout): void {
  const L = 2 * layout.maxRoomHalfExtent;
  for (const room of layout.spatialNodes) {
    expect(room.dimensions.x, `salle ${room.id} : dimensions.x`).toBeLessThanOrEqual(L);
    expect(room.dimensions.z, `salle ${room.id} : dimensions.z`).toBeLessThanOrEqual(L);
  }
}

/** (c) BFS du graphe des portails depuis le `hall` atteint toutes les salles. */
function assertReachableFromHall(layout: WorldLayout): void {
  const nodes = layout.spatialNodes;
  const byId = new Map<string, SpatialNode>(nodes.map((n) => [n.id, n] as const));
  const halls = nodes.filter((n) => n.role === "hall");
  expect(halls.length, "exactement une salle hall").toBe(1);
  const start = halls[0];
  if (start === undefined) throw new Error("hall absent");

  const seen = new Set<string>();
  const queue: string[] = [start.id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node === undefined) continue;
    for (const p of node.portals) queue.push(p.toSpatialNodeId);
  }
  expect(seen.size, "salles atteintes depuis le hall").toBe(nodes.length);
}

describe("Anti-friction (PRD §9.4) sur le graphe spatial des six fixtures", () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} : portes visibles, extent borné, graphe connexe`, () => {
      const layout = layoutOf(fx);
      assertPortalsVisible(layout);
      assertExtentBudget(layout);
      assertReachableFromHall(layout);
    });
  }
});
