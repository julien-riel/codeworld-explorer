/**
 * Géométrie PURE d'une salle : murs, offsets de portail et orientations
 * (layout-engine-v0 §4, §8.5). Aucune dépendance à three ni à React : ces fonctions
 * sont testables en isolation et partagées par les composants de scène.
 *
 * Repère LOCAL au centre-sol de la salle (contrat §2.1) : `x ∈ [−w/2, +w/2]`,
 * `z ∈ [−d/2, +d/2]`, `y` du sol (0) au plafond (`dimensions.y`). Tout est en mm.
 */

import type { Orientation, Wall } from "@codeworld/world-schema";

/** Rang de mur pour le tri canonique (layout-engine-v0 §4.1). */
export const WALL_RANK: Readonly<Record<Wall, number>> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

/**
 * Lacet (rotation autour de +y, radians) d'une orientation `0|1|2|3`.
 *
 * `0` fait face à `−z` (« nord ») ; chaque incrément est un quart de tour HORAIRE
 * vu du dessus (contrat §2.1). Dans three, une rotation `rotation.y = θ` envoie la
 * direction avant `(0,0,−1)` sur `(−sinθ, 0, −cosθ)` ; résoudre pour chaque
 * orientation donne `θ = −o·π/2`.
 */
export function orientationToYaw(orientation: Orientation): number {
  return (-orientation * Math.PI) / 2;
}

/** `cos(yaw)` exact pour une orientation entière (évite le bruit flottant). */
const COS: readonly number[] = [1, 0, -1, 0];
/** `sin(yaw)` exact (`yaw = −o·π/2`) pour une orientation entière. */
const SIN: readonly number[] = [0, -1, 0, 1];

/**
 * Applique la rotation d'une orientation `0|1|2|3` à un point `(x, z)` du plan
 * (rotation autour de +y). Exacte pour les multiples de 90° : aucun résidu flottant.
 */
export function rotateByOrientation(
  x: number,
  z: number,
  orientation: Orientation,
): { x: number; z: number } {
  const c = COS[orientation] ?? 1;
  const s = SIN[orientation] ?? 0;
  // x' = x·cos + z·sin ; z' = −x·sin + z·cos  (rotation three autour de +y)
  return { x: x * c + z * s, z: -x * s + z * c };
}

/**
 * Point (mm, repère local) sur le mur à la distance `offset` du coin de référence
 * (layout-engine-v0 §4.3, `thresholdPoint`). `w = dimensions.x`, `d = dimensions.z`.
 * C'est le centre de l'ouverture d'un portail sur ce mur.
 */
export function thresholdPoint(
  wall: Wall,
  offset: number,
  w: number,
  d: number,
): { x: number; z: number } {
  switch (wall) {
    case "north":
      return { x: -w / 2 + offset, z: -d / 2 };
    case "east":
      return { x: +w / 2, z: -d / 2 + offset };
    case "south":
      return { x: +w / 2 - offset, z: +d / 2 };
    case "west":
      return { x: -w / 2, z: +d / 2 - offset };
  }
}

/** Longueur du mur (mm) : `w` pour nord/sud, `d` pour est/ouest. */
export function wallLength(wall: Wall, w: number, d: number): number {
  return wall === "north" || wall === "south" ? w : d;
}

/** Axe le long duquel s'étend un mur : `x` pour nord/sud, `z` pour est/ouest. */
export function wallAxis(wall: Wall): "x" | "z" {
  return wall === "north" || wall === "south" ? "x" : "z";
}

/** Ouverture d'un portail projetée sur l'axe 1D du mur (mm). */
export interface WallOpening {
  /** Distance du centre depuis le coin de référence (= `Portal.offset`). */
  u: number;
  /** Largeur de l'ouverture le long du mur. */
  width: number;
  /** Hauteur de l'ouverture depuis le sol. */
  height: number;
}

/** Panneau plein d'un mur (segment ou linteau), en coordonnées 1D le long du mur. */
export interface WallPanel {
  /** Centre du panneau le long du mur (mm depuis le coin de référence). */
  u: number;
  /** Étendue du panneau le long du mur (mm). */
  length: number;
  /** Bas du panneau (mm depuis le sol). */
  base: number;
  /** Hauteur du panneau (mm). */
  height: number;
}

/**
 * Découpe un mur en panneaux pleins autour de ses ouvertures de portail
 * (layout-engine-v0 §4). Un mur devient : des segments pleine hauteur entre les
 * portes, plus un linteau au-dessus de chaque porte. Fonction PURE et testable.
 */
export function wallPanels(
  length: number,
  height: number,
  openings: readonly WallOpening[],
): WallPanel[] {
  // Ouvertures bornées au mur et triées par position croissante.
  const sorted = openings
    .map((o) => {
      const half = o.width / 2;
      return {
        start: Math.max(0, o.u - half),
        end: Math.min(length, o.u + half),
        height: Math.min(height, o.height),
      };
    })
    .filter((o) => o.end > o.start)
    .sort((a, b) => a.start - b.start);

  const panels: WallPanel[] = [];
  let cursor = 0;
  for (const opening of sorted) {
    // Segment pleine hauteur avant l'ouverture.
    if (opening.start > cursor) {
      panels.push({
        u: (cursor + opening.start) / 2,
        length: opening.start - cursor,
        base: 0,
        height,
      });
    }
    // Linteau au-dessus de l'ouverture.
    if (opening.height < height) {
      panels.push({
        u: (opening.start + opening.end) / 2,
        length: opening.end - opening.start,
        base: opening.height,
        height: height - opening.height,
      });
    }
    cursor = Math.max(cursor, opening.end);
  }
  // Segment pleine hauteur final.
  if (cursor < length) {
    panels.push({
      u: (cursor + length) / 2,
      length: length - cursor,
      base: 0,
      height,
    });
  }
  return panels;
}
