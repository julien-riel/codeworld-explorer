/**
 * Cadres de porte visibles et CLIQUABLES (point-and-click, PRD §9.2). Cliquer un
 * portail demande le déplacement vers la salle voisine via le store
 * (`requestTeleport`) ; la caméra est animée par l'intégrateur.
 *
 * Rendu en repère LOCAL de la salle (inséré dans le groupe de `Scene`). Composant de
 * SCÈNE : uniquement du three, aucun DOM.
 */

import { useMemo, useState, type ReactElement } from "react";
import type { SpatialNode } from "@codeworld/world-schema";
import type { ThreeEvent } from "@react-three/fiber";
import { mmToSceneUnits, useWorldStore } from "../state/store";
import { PALETTE, themeAccentName } from "../palette";
import { thresholdPoint, wallAxis } from "./roomGeometry";

/** Épaisseur des montants et de la traverse (mm). */
const FRAME = 400;
/** Profondeur du cadre traversant le mur (mm), un peu > l'épaisseur du mur. */
const DEPTH = 500;

/** Triplet `x, y, z` en unités de scène (position ou dimensions de boîte). */
type Box3 = [number, number, number];

/** Une boîte prête à monter : centre + dimensions. */
interface Box {
  position: Box3;
  args: Box3;
}

/** Un cadre de portail prêt à monter, en unités de scène. */
interface PortalFrame {
  portalId: string;
  toSpatialNodeId: string;
  /** Boîte cliquable comblant l'ouverture. */
  target: Box;
  posts: (Box & { key: string })[];
  lintel: Box;
}

/** Construit les cadres de tous les portails d'une salle, en unités de scène. */
function buildFrames(room: SpatialNode): PortalFrame[] {
  const w = room.dimensions.x;
  const d = room.dimensions.z;
  const frameU = mmToSceneUnits(FRAME);
  const depthU = mmToSceneUnits(DEPTH);

  return room.portals.map((p) => {
    const axis = wallAxis(p.wall);
    const center = thresholdPoint(p.wall, p.offset, w, d);
    const left = thresholdPoint(p.wall, p.offset - p.width / 2, w, d);
    const right = thresholdPoint(p.wall, p.offset + p.width / 2, w, d);
    const widthU = mmToSceneUnits(p.width);
    const heightU = mmToSceneUnits(p.height);
    const cx = mmToSceneUnits(center.x);
    const cz = mmToSceneUnits(center.z);
    const yMid = heightU / 2;

    const post = (key: string, pt: { x: number; z: number }): Box & { key: string } => ({
      key,
      position: [mmToSceneUnits(pt.x), yMid, mmToSceneUnits(pt.z)],
      args: axis === "x" ? [frameU, heightU, depthU] : [depthU, heightU, frameU],
    });

    return {
      portalId: p.id,
      toSpatialNodeId: p.toSpatialNodeId,
      target: {
        position: [cx, yMid, cz],
        args: axis === "x" ? [widthU, heightU, depthU] : [depthU, heightU, widthU],
      },
      posts: [post(`${p.id}-l`, left), post(`${p.id}-r`, right)],
      lintel: {
        position: [cx, heightU, cz],
        args:
          axis === "x"
            ? [widthU + 2 * frameU, frameU, depthU]
            : [depthU, frameU, widthU + 2 * frameU],
      },
    };
  });
}

/** Props de `Portals`. */
export interface PortalsProps {
  room: SpatialNode;
}

/** Rendu des cadres de portail cliquables d'une salle. */
export function Portals({ room }: PortalsProps): ReactElement {
  const frames = useMemo(() => buildFrames(room), [room]);
  const requestTeleport = useWorldStore((s) => s.requestTeleport);
  const [hovered, setHovered] = useState<string | null>(null);
  const accent = PALETTE[themeAccentName(room.theme)];

  return (
    <group>
      {frames.map((frame) => {
        const isHot = hovered === frame.portalId;
        return (
          <group key={frame.portalId}>
            {/* Cible cliquable comblant l'ouverture : c'est elle qui capte le pointeur. */}
            <mesh
              position={frame.target.position}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                requestTeleport({ kind: "room", spatialNodeId: frame.toSpatialNodeId });
              }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                setHovered(frame.portalId);
              }}
              onPointerOut={() => {
                setHovered((h) => (h === frame.portalId ? null : h));
              }}
            >
              <boxGeometry args={frame.target.args} />
              <meshStandardMaterial
                color={accent}
                emissive={accent}
                emissiveIntensity={isHot ? 0.9 : 0.35}
                transparent
                opacity={isHot ? 0.4 : 0.18}
              />
            </mesh>

            {/* Montants + traverse : le cadre visible de la porte. */}
            {frame.posts.map((p) => (
              <mesh key={p.key} position={p.position}>
                <boxGeometry args={p.args} />
                <meshStandardMaterial color={PALETTE.surfaceRaised} emissive={accent} emissiveIntensity={0.15} />
              </mesh>
            ))}
            <mesh position={frame.lintel.position}>
              <boxGeometry args={frame.lintel.args} />
              <meshStandardMaterial color={PALETTE.surfaceRaised} emissive={accent} emissiveIntensity={0.15} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
