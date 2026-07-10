/**
 * Projection PURE des salles d'un monde sur un plan 2D à l'échelle (mini-carte,
 * PRD §9.3, §14.3, FR-010). Aucune dépendance à React, au store ni à three : ces
 * fonctions sont testables en isolation et servent à la fois au rendu et au
 * point-and-click cartographique.
 *
 * Repère MONDE en millimètres (contrat §2.1) ; repère CARTE en pixels avec l'origine
 * en haut-à-gauche. La projection est « nord en haut » : l'axe monde +x va vers la
 * DROITE, l'axe monde +z (« sud ») va vers le BAS, donc −z (« nord ») pointe vers le
 * HAUT. La projection est UNIFORME (même échelle en x et z) pour ne pas déformer les
 * salles, et centrée dans le cadre.
 */

import type { Orientation, SpatialNode } from "@codeworld/world-schema";

/** Salle réduite à ce que la mini-carte projette : centre et demi-étendues MONDE (mm). */
export interface MinimapRoom {
  id: string;
  /** Centre de la salle en repère monde (mm). */
  center: { x: number; z: number };
  /** Demi-étendues au sol en repère monde (mm), orientation déjà résolue. */
  half: { x: number; z: number };
}

/** `true` si l'orientation échange largeur et profondeur (quart de tour impair). */
function swapsExtents(orientation: Orientation): boolean {
  return orientation === 1 || orientation === 3;
}

/**
 * Réduit un `SpatialNode` à une `MinimapRoom` : demi-étendues au sol en repère MONDE.
 * Une orientation impaire (1/3) échange largeur et profondeur ; comme l'orientation
 * est un multiple de 90°, l'empreinte reste alignée sur les axes monde.
 */
export function toMinimapRoom(spatial: SpatialNode): MinimapRoom {
  const swap = swapsExtents(spatial.orientation);
  return {
    id: spatial.id,
    center: { x: spatial.position.x, z: spatial.position.z },
    half: {
      x: (swap ? spatial.dimensions.z : spatial.dimensions.x) / 2,
      z: (swap ? spatial.dimensions.x : spatial.dimensions.z) / 2,
    },
  };
}

/** Bornes MONDE (mm) englobant l'EMPRISE de toutes les salles (centre ± demi-étendue). */
export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Bornes monde des empreintes de salles, ou `null` si la liste est vide. */
export function computeBounds(rooms: readonly MinimapRoom[]): WorldBounds | null {
  if (rooms.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const room of rooms) {
    minX = Math.min(minX, room.center.x - room.half.x);
    maxX = Math.max(maxX, room.center.x + room.half.x);
    minZ = Math.min(minZ, room.center.z - room.half.z);
    maxZ = Math.max(maxZ, room.center.z + room.half.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Cadre pixel de la mini-carte : dimensions et marge intérieure. */
export interface Viewport {
  width: number;
  height: number;
  padding: number;
}

/** Projection affine mm→pixel : `px = mm·scale + offset`. Immuable, déterministe. */
export interface MinimapProjection {
  /** Facteur d'échelle (pixels par millimètre), identique en x et z. */
  scale: number;
  /** Décalage pixel de l'axe x (monde +x → droite). */
  offsetX: number;
  /** Décalage pixel de l'axe z (monde +z → bas). */
  offsetZ: number;
  viewport: Viewport;
}

/**
 * Échelle de repli quand toutes les salles sont confondues (une seule salle, ou centres
 * identiques) : la largeur monde est nulle, aucun ratio ne la contraint. ~4 px par mètre.
 */
const DEGENERATE_SCALE = 0.004;

/**
 * Construit la projection qui INSCRIT toutes les salles dans le cadre, marge comprise,
 * à échelle uniforme et centrée. Déterministe : mêmes salles + même cadre → même
 * projection (propriété de stabilité testée).
 */
export function buildProjection(rooms: readonly MinimapRoom[], viewport: Viewport): MinimapProjection {
  const innerW = viewport.width - 2 * viewport.padding;
  const innerH = viewport.height - 2 * viewport.padding;
  const bounds = computeBounds(rooms);
  if (bounds === null) {
    return { scale: DEGENERATE_SCALE, offsetX: viewport.width / 2, offsetZ: viewport.height / 2, viewport };
  }
  const worldW = bounds.maxX - bounds.minX;
  const worldD = bounds.maxZ - bounds.minZ;
  const scaleX = worldW > 0 ? innerW / worldW : Infinity;
  const scaleZ = worldD > 0 ? innerH / worldD : Infinity;
  let scale = Math.min(scaleX, scaleZ);
  if (!Number.isFinite(scale) || scale <= 0) scale = DEGENERATE_SCALE;
  // Centre le contenu dessiné dans la zone utile, puis ancre `bounds.min*` à ce coin.
  const offsetX = viewport.padding + (innerW - worldW * scale) / 2 - bounds.minX * scale;
  const offsetZ = viewport.padding + (innerH - worldD * scale) / 2 - bounds.minZ * scale;
  return { scale, offsetX, offsetZ, viewport };
}

/** Point CARTE (pixels) d'un point MONDE (mm). Cœur de la projection mm→2D. */
export function projectPoint(proj: MinimapProjection, x: number, z: number): { x: number; y: number } {
  return { x: x * proj.scale + proj.offsetX, y: z * proj.scale + proj.offsetZ };
}

/** Rectangle CARTE (pixels) d'une salle : coin haut-gauche, taille et centre. */
export interface ProjectedRoom {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

/** Projette l'empreinte d'une salle en un rectangle pixel (centré sur sa position). */
export function projectRoom(proj: MinimapProjection, room: MinimapRoom): ProjectedRoom {
  const c = projectPoint(proj, room.center.x, room.center.z);
  const width = room.half.x * 2 * proj.scale;
  const height = room.half.z * 2 * proj.scale;
  return { id: room.id, left: c.x - width / 2, top: c.y - height / 2, width, height, cx: c.x, cy: c.y };
}

/** Projette toutes les salles (couverture 1:1 : un rectangle cliquable par salle). */
export function projectRooms(
  proj: MinimapProjection,
  rooms: readonly MinimapRoom[],
): ProjectedRoom[] {
  return rooms.map((room) => projectRoom(proj, room));
}

/**
 * Résout le clic cartographique en `id` de salle : la salle dont le rectangle contient
 * le point `(px, py)`. En cas de recouvrement (salles de niveaux différents projetées
 * au même endroit), on retient la salle dont le CENTRE est le plus proche du clic, les
 * égalités étant tranchées par `id` pour rester déterministe. `null` hors de toute salle.
 */
export function roomAtPoint(
  proj: MinimapProjection,
  rooms: readonly MinimapRoom[],
  px: number,
  py: number,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const room of rooms) {
    const r = projectRoom(proj, room);
    if (px < r.left || px > r.left + r.width || py < r.top || py > r.top + r.height) continue;
    const dx = px - r.cx;
    const dy = py - r.cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist || (dist === bestDist && (best === null || room.id < best))) {
      bestDist = dist;
      best = room.id;
    }
  }
  return best;
}
