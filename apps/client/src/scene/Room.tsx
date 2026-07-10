/**
 * Une salle : sol + murs bâtis à partir de `dimensions`, avec une ouverture par
 * portail au bon endroit du mur (layout-engine-v0 §4). Rendu en repère LOCAL
 * (centre-sol) ; c'est `Scene` qui place le groupe à la position monde de la salle.
 *
 * Composant de SCÈNE : uniquement du three, aucun DOM (contrainte PRD §11.3).
 */

import { useMemo, type ReactElement } from "react";
import type { SpatialNode, Wall } from "@codeworld/world-schema";
import { mmToSceneUnits } from "../state/store";
import { PALETTE, themeAccentName } from "../palette";
import { thresholdPoint, wallLength, wallAxis, wallPanels } from "./roomGeometry";

/** Épaisseur des murs (mm). */
const WALL_THICKNESS = 300;

const WALLS: readonly Wall[] = ["north", "east", "south", "west"];

/** Boîte de mur prête à monter, en unités de scène. */
interface WallBox {
  key: string;
  position: [number, number, number];
  args: [number, number, number];
}

/** Calcule les boîtes de tous les murs (segments + linteaux) en unités de scène. */
function buildWallBoxes(room: SpatialNode): WallBox[] {
  const w = room.dimensions.x;
  const d = room.dimensions.z;
  const h = room.dimensions.y;
  const t = mmToSceneUnits(WALL_THICKNESS);
  const boxes: WallBox[] = [];

  for (const wall of WALLS) {
    const length = wallLength(wall, w, d);
    const openings = room.portals
      .filter((p) => p.wall === wall)
      .map((p) => ({ u: p.offset, width: p.width, height: p.height }));
    const panels = wallPanels(length, h, openings);
    const axis = wallAxis(wall);

    panels.forEach((panel, i) => {
      const mid = thresholdPoint(wall, panel.u, w, d);
      const along = mmToSceneUnits(panel.length);
      const height = mmToSceneUnits(panel.height);
      const yCenter = mmToSceneUnits(panel.base + panel.height / 2);
      boxes.push({
        key: `${wall}-${String(i)}`,
        position: [mmToSceneUnits(mid.x), yCenter, mmToSceneUnits(mid.z)],
        // Nord/sud s'étendent sur x ; est/ouest sur z.
        args: axis === "x" ? [along, height, t] : [t, height, along],
      });
    });
  }
  return boxes;
}

/** Props de `Room`. */
export interface RoomProps {
  room: SpatialNode;
  /** Salle où se trouve le joueur : mise en valeur discrète (repère « vous êtes ici »). */
  isCurrent: boolean;
}

/** Rendu d'une salle en repère local (centre-sol). */
export function Room({ room, isCurrent }: RoomProps): ReactElement {
  const walls = useMemo(() => buildWallBoxes(room), [room]);
  const w = mmToSceneUnits(room.dimensions.x);
  const d = mmToSceneUnits(room.dimensions.z);
  // Teinte de sol dérivée du thème : la salle courante est légèrement éclairée.
  const accent = PALETTE[themeAccentName(room.theme)];

  return (
    <group>
      {/* Sol : plan horizontal au niveau y=0 (centre-sol de la salle). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={isCurrent ? PALETTE.surfaceRaised : PALETTE.surface}
          emissive={accent}
          emissiveIntensity={isCurrent ? 0.06 : 0.02}
        />
      </mesh>

      {/* Murs : segments pleins + linteaux, troués aux portails. */}
      {walls.map((box) => (
        <mesh key={box.key} position={box.position}>
          <boxGeometry args={box.args} />
          <meshStandardMaterial color={PALETTE.border} />
        </mesh>
      ))}
    </group>
  );
}
