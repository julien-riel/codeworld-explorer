/**
 * Hooks dérivés de l'interface 2D (PRD §11.3, §19.4).
 *
 * Ils s'abonnent au store par sélecteurs FINS (jamais à l'objet entier) et calculent
 * les données dérivées (salle courante, fil d'Ariane, fichier sélectionné) par
 * `useMemo` sur des ENTRÉES STABLES — jamais en renvoyant un nouveau tableau/objet
 * depuis le sélecteur, ce qui ferait boucler zustand v5. Aucun rendu three ici : c'est
 * l'arbre DOM, séparé de la scène, qui ne partage que le store.
 */

import { useMemo } from "react";
import type { SourceNode, SpatialNode, World } from "@codeworld/world-schema";
import {
  useCurrentSpatialNodeId,
  useSelectedFileNodeId,
  useWorldStore,
} from "../state/store";
import { ancestorChain, type WorldIndex } from "../state/selectors";

/** Le monde courant, ou `null` si aucun n'est chargé. Référence stable par monde. */
export function useWorld(): World | null {
  return useWorldStore((s) => s.world);
}

/** L'index dérivé du monde courant. Référence stable par monde. */
export function useWorldIndex(): WorldIndex | null {
  return useWorldStore((s) => s.worldIndex);
}

/** Chemin du `world.json` courant (sert à composer les URLs de contenu). */
export function useWorldPath(): string | null {
  return useWorldStore((s) => s.worldPath);
}

/** La salle (SpatialNode) où se trouve l'utilisateur, ou `null`. */
export function useCurrentRoom(): SpatialNode | null {
  const index = useWorldIndex();
  const currentId = useCurrentSpatialNodeId();
  return useMemo(() => {
    if (index === null || currentId === null) return null;
    return index.spatialById.get(currentId) ?? null;
  }, [index, currentId]);
}

/**
 * Fil d'Ariane de la salle courante : la chaîne d'ancêtres du `SourceNode` (dossier)
 * associé à la salle, de la racine à la salle incluse (PRD §9.3, FR-009).
 */
export function useBreadcrumb(): SourceNode[] {
  const index = useWorldIndex();
  const room = useCurrentRoom();
  return useMemo(() => {
    if (index === null || room === null) return [];
    return ancestorChain(index, room.sourceNodeId);
  }, [index, room]);
}

/** Le `SourceNode` du fichier sélectionné (panneau de code), ou `null`. */
export function useSelectedFile(): SourceNode | null {
  const index = useWorldIndex();
  const selectedId = useSelectedFileNodeId();
  return useMemo(() => {
    if (index === null || selectedId === null) return null;
    return index.nodeById.get(selectedId) ?? null;
  }, [index, selectedId]);
}
