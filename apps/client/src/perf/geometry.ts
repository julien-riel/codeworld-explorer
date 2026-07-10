/**
 * Comptage de triangles d'une géométrie three, PUR et sans GL (PRD §9.5, §16.1).
 *
 * Une `BufferGeometry` porte ses sommets côté CPU : construire une géométrie
 * (BoxGeometry, CylinderGeometry…) et lire son index n'exige AUCUN contexte WebGL.
 * Le harnais de mesure hors-ligne s'en sert pour compter les triangles par zone sans
 * monter un vrai canvas.
 */

import type { BufferGeometry } from "three";

/**
 * Nombre de triangles d'une géométrie : `index.count / 3` si elle est indexée, sinon
 * `position.count / 3`. Reflète exactement ce que le GPU dessinerait.
 */
export function geometryTriangleCount(geometry: BufferGeometry): number {
  if (geometry.index !== null) {
    return Math.floor(geometry.index.count / 3);
  }
  const position = geometry.getAttribute("position");
  return position === undefined ? 0 : Math.floor(position.count / 3);
}
