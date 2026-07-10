/**
 * Sélecteurs dérivés PURS sur les données d'un monde (world-schema-v0 §3).
 *
 * Aucune dépendance au store ni à React : ce sont des fonctions testables en
 * isolation, consommées par les deux arbres via le store. Pour éviter de reparcourir
 * les collections à chaque appel, elles opèrent sur un `WorldIndex` construit une
 * fois par `buildWorldIndex` au chargement du monde.
 */

import type {
  SourceNode,
  SpatialNode,
  World,
} from "@codeworld/world-schema";

// ── Index dérivé (construit une fois par monde) ──

/** Index O(1) des entités d'un monde, dérivé de `World`. Immuable après construction. */
export interface WorldIndex {
  /** `SourceNode` par `id`. */
  nodeById: ReadonlyMap<string, SourceNode>;
  /** `SpatialNode` (salle) par `id`. */
  spatialById: ReadonlyMap<string, SpatialNode>;
  /** Salle de PAGE 0 (hall/primary) d'un dossier, par `sourceNodeId`. */
  roomByDirectory: ReadonlyMap<string, SpatialNode>;
  /** Salle contenant un FICHIER (via `objects[].sourceNodeId`), par `sourceNodeId`. */
  roomByFile: ReadonlyMap<string, SpatialNode>;
  /** La salle `hall` (racine unique du monde, FR-005), si présente. */
  hall: SpatialNode | undefined;
}

/** Construit l'index dérivé d'un monde. À appeler une fois au chargement. */
export function buildWorldIndex(world: World): WorldIndex {
  const nodeById = new Map<string, SourceNode>();
  for (const node of world.nodes) {
    nodeById.set(node.id, node);
  }

  const spatialById = new Map<string, SpatialNode>();
  const roomByDirectory = new Map<string, SpatialNode>();
  const roomByFile = new Map<string, SpatialNode>();
  let hall: SpatialNode | undefined;

  for (const spatial of world.layout.spatialNodes) {
    spatialById.set(spatial.id, spatial);
    // La salle « canonique » d'un dossier est sa page 0 (hall/primary) ; les annexes
    // (role "annex", page ≥ 1) partagent le même `sourceNodeId` mais ne l'écrasent pas.
    if (spatial.page === 0) {
      roomByDirectory.set(spatial.sourceNodeId, spatial);
    }
    if (spatial.role === "hall") {
      hall = spatial;
    }
    for (const object of spatial.objects) {
      roomByFile.set(object.sourceNodeId, spatial);
    }
  }

  return { nodeById, spatialById, roomByDirectory, roomByFile, hall };
}

// ── Fil d'Ariane (chaîne d'ancêtres) ──

/**
 * Chaîne d'ancêtres d'un `SourceNode`, de la RACINE au nœud inclus (ordre fil
 * d'Ariane). Retourne `[]` si le nœud est inconnu. Robuste à un éventuel cycle
 * (garde par ensemble visité) même si les invariants d'arbre l'interdisent.
 */
export function ancestorChain(index: WorldIndex, nodeId: string): SourceNode[] {
  const chain: SourceNode[] = [];
  const visited = new Set<string>();
  let current: SourceNode | undefined = index.nodeById.get(nodeId);
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId === null ? undefined : index.nodeById.get(current.parentId);
  }
  chain.reverse();
  return chain;
}

/** Alias explicite : le fil d'Ariane EST la chaîne d'ancêtres (PRD §9.3). */
export const breadcrumb = ancestorChain;

// ── Résolution salle ↔ source ──

/**
 * Salle qui « contient » un `SourceNode` : la salle-fichier s'il s'agit d'un fichier
 * placé, sinon la salle de page 0 s'il s'agit d'un dossier. `undefined` si le nœud
 * n'a pas de salle (dossier aplati, fichier exclu…).
 */
export function roomOfSourceNode(
  index: WorldIndex,
  sourceNodeId: string,
): SpatialNode | undefined {
  return index.roomByFile.get(sourceNodeId) ?? index.roomByDirectory.get(sourceNodeId);
}

// ── Voisins d'une salle ──

/**
 * Salles voisines accessibles depuis une salle par un portail (`portals[] →
 * toSpatialNodeId`). Dédupliquées, dans l'ordre des portails, sans la salle elle-même.
 * Sert au chargement PAR ZONE (PRD §9.5) : salle courante + voisines immédiates.
 */
export function neighbors(index: WorldIndex, spatialNodeId: string): SpatialNode[] {
  const room = index.spatialById.get(spatialNodeId);
  if (room === undefined) return [];
  const seen = new Set<string>();
  const result: SpatialNode[] = [];
  for (const portal of room.portals) {
    const target = portal.toSpatialNodeId;
    if (target === spatialNodeId || seen.has(target)) continue;
    const neighbor = index.spatialById.get(target);
    if (neighbor !== undefined) {
      seen.add(target);
      result.push(neighbor);
    }
  }
  return result;
}

/** Ids des salles à monter pour une salle courante : elle-même + ses voisines (PRD §9.5). */
export function activeZoneIds(index: WorldIndex, spatialNodeId: string): string[] {
  if (!index.spatialById.has(spatialNodeId)) return [];
  return [spatialNodeId, ...neighbors(index, spatialNodeId).map((n) => n.id)];
}

// ── Téléportation ──

/** Cible d'une téléportation demandée par l'UI (recherche, mini-carte, fil d'Ariane…). */
export type TeleportTarget =
  | { kind: "room"; spatialNodeId: string }
  | { kind: "node"; sourceNodeId: string };

/** Résolution d'une téléportation : salle d'arrivée + fichier éventuel à sélectionner. */
export interface TeleportResolution {
  spatialNodeId: string;
  selectedFileNodeId: string | null;
}

/**
 * Résout une cible de téléportation en une salle d'arrivée concrète (PRD §9.2) :
 * - `room` → la salle elle-même, sans sélection ;
 * - `node` fichier → la salle qui le contient, avec le fichier sélectionné ;
 * - `node` dossier → sa salle de page 0, sans sélection.
 * Retourne `undefined` si la cible n'a pas de salle atteignable.
 */
export function resolveTeleport(
  index: WorldIndex,
  target: TeleportTarget,
): TeleportResolution | undefined {
  if (target.kind === "room") {
    return index.spatialById.has(target.spatialNodeId)
      ? { spatialNodeId: target.spatialNodeId, selectedFileNodeId: null }
      : undefined;
  }
  const fileRoom = index.roomByFile.get(target.sourceNodeId);
  if (fileRoom !== undefined) {
    return { spatialNodeId: fileRoom.id, selectedFileNodeId: target.sourceNodeId };
  }
  const dirRoom = index.roomByDirectory.get(target.sourceNodeId);
  if (dirRoom !== undefined) {
    return { spatialNodeId: dirRoom.id, selectedFileNodeId: null };
  }
  return undefined;
}
