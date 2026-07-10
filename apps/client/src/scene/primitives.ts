/**
 * Fabrique de géométries three à partir d'un `PrimitiveDescriptor` (theme/ThemeKit).
 *
 * Le descripteur est en mm (repère modèle, pleine dimension). On convertit à
 * l'échelle de scène et on translate la géométrie pour que sa BASE touche le sol
 * (`y = 0`), sauf `yOffset` explicite (centre imposé). Une géométrie est construite
 * UNE fois par groupe `(theme, kind)` et partagée par toutes ses instances.
 */

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
} from "three";
import { mmToSceneUnits } from "../state/store";
import type { PrimitiveDescriptor } from "../theme/ThemeKit";

/** Nombre de segments radiaux par défaut : bas, pour un rendu low-poly (PRD §9.5). */
const DEFAULT_RADIAL_SEGMENTS = 8;

/**
 * Construit la géométrie d'un descripteur, à l'échelle de scène, base posée au sol.
 * L'appelant est responsable de `dispose()` au démontage.
 */
export function geometryFromDescriptor(desc: PrimitiveDescriptor): BufferGeometry {
  const x = mmToSceneUnits(desc.size.x);
  const y = mmToSceneUnits(desc.size.y);
  const z = mmToSceneUnits(desc.size.z);
  const radial = desc.radialSegments ?? DEFAULT_RADIAL_SEGMENTS;
  const radius = x / 2;

  switch (desc.shape) {
    case "box": {
      const g = new BoxGeometry(x, y, z);
      g.translate(0, centerHeight(desc, y / 2), 0);
      return g;
    }
    case "cylinder": {
      const g = new CylinderGeometry(radius, radius, y, radial);
      g.translate(0, centerHeight(desc, y / 2), 0);
      return g;
    }
    case "cone": {
      const g = new ConeGeometry(radius, y, radial);
      g.translate(0, centerHeight(desc, y / 2), 0);
      return g;
    }
    case "sphere": {
      const g = new SphereGeometry(radius, radial, radial);
      g.translate(0, centerHeight(desc, radius), 0);
      return g;
    }
    case "plane": {
      const g = new PlaneGeometry(x, z);
      // Le plan est vertical par défaut : le coucher à plat (normale vers +y).
      g.rotateX(-Math.PI / 2);
      g.translate(0, centerHeight(desc, 0), 0);
      return g;
    }
  }
}

/** Hauteur du centre (unités de scène) : `yOffset` explicite (mm) sinon défaut. */
function centerHeight(desc: PrimitiveDescriptor, fallback: number): number {
  return desc.yOffset === undefined ? fallback : mmToSceneUnits(desc.yOffset);
}
