/**
 * Repère de sélection : un anneau au sol autour de l'objet sélectionné. La sélection
 * n'est JAMAIS signalée par la seule couleur (PRD §23.2, palette.ts) — l'anneau est
 * une FORME dédiée, doublée d'une teinte `selection`.
 *
 * Composant de SCÈNE : uniquement du three. Rend `null` si l'objet sélectionné n'est
 * pas dans la zone montée.
 */

import { type ReactElement } from "react";
import { PALETTE } from "../palette";
import type { FileObjectGroup } from "./instancing";

/** Rayon de l'anneau (unités de scène) et section du tore. */
const RING_RADIUS = 1.5;
const RING_TUBE = 0.09;

/** Props de `SelectionHighlight`. */
export interface SelectionHighlightProps {
  groups: readonly FileObjectGroup[];
  selectedFileNodeId: string | null;
}

/** Anneau de sélection posé au sol autour de l'objet sélectionné. */
export function SelectionHighlight({
  groups,
  selectedFileNodeId,
}: SelectionHighlightProps): ReactElement | null {
  if (selectedFileNodeId === null) return null;
  for (const group of groups) {
    for (const inst of group.instances) {
      if (inst.sourceNodeId !== selectedFileNodeId) continue;
      return (
        <mesh
          position={[inst.position[0], inst.position[1] + 0.06, inst.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[RING_RADIUS, RING_TUBE, 8, 32]} />
          <meshStandardMaterial
            color={PALETTE.selection}
            emissive={PALETTE.selection}
            emissiveIntensity={0.6}
          />
        </mesh>
      );
    }
  }
  return null;
}
