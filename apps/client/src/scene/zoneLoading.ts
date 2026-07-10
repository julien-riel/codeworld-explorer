/**
 * Chargement PAR ZONE (PRD §9.5) : ne monter que la salle courante et ses voisines
 * immédiates (accessibles par un portail), jamais le monde entier. Fonction PURE et
 * testable, séparée des composants R3F.
 *
 * S'appuie sur les sélecteurs dérivés (`activeZoneIds`) déjà validés : on ne
 * reconstruit pas la logique de voisinage, on la résout en `SpatialNode[]` prêts à
 * monter, salle courante en tête.
 */

import type { SpatialNode } from "@codeworld/world-schema";
import { activeZoneIds, type WorldIndex } from "../state/selectors";

/** Zone active à monter : salle courante + voisines immédiates (PRD §9.5). */
export interface ActiveZone {
  /** Id de la salle courante, ou `null` si aucune. */
  currentId: string | null;
  /** Salles à monter, salle courante en tête, sans doublon. */
  rooms: SpatialNode[];
}

/** Zone active vide (aucun monde, ou salle courante inconnue). */
const EMPTY_ZONE: ActiveZone = { currentId: null, rooms: [] };

/**
 * Sélectionne les salles à monter pour une salle courante donnée : elle-même puis
 * ses voisines immédiates (une porte de distance). Retourne une zone VIDE si le
 * monde ou la salle courante est absent. Fonction PURE.
 */
export function computeActiveZone(
  index: WorldIndex | null,
  currentSpatialNodeId: string | null,
): ActiveZone {
  if (index === null || currentSpatialNodeId === null) return EMPTY_ZONE;
  const ids = activeZoneIds(index, currentSpatialNodeId);
  if (ids.length === 0) return EMPTY_ZONE;
  const rooms: SpatialNode[] = [];
  for (const id of ids) {
    const room = index.spatialById.get(id);
    if (room !== undefined) rooms.push(room);
  }
  return { currentId: currentSpatialNodeId, rooms };
}
