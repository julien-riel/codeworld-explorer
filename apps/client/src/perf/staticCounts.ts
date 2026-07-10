/**
 * Harnais de mesure HORS-LIGNE (PRD §9.5, §16.1). Pour un monde donné, il compte —
 * SANS aucun contexte WebGL — ce que la scène monterait PAR ZONE : nombre de salles,
 * de meshes de décor, d'`InstancedMesh` (couples `theme, kind`), d'instances visibles,
 * de draw calls et de triangles.
 *
 * Il ne réinvente ni la sélection de zone (`computeActiveZone`), ni le regroupement
 * d'instances (`groupFileObjects`), ni la géométrie des salles (`roomGeometry`), ni la
 * résolution de forme (`resolveDescriptor`) : il MESURE exactement les mêmes chemins
 * que la scène, d'où des chiffres fidèles au rendu réel. Fonctions PURES et testables.
 */

import type { ObjectKind, SpatialNode, ThemeId, Wall, World } from "@codeworld/world-schema";
import { buildWorldIndex, type WorldIndex } from "../state/selectors";
import { computeActiveZone } from "../scene/zoneLoading";
import { groupFileObjects } from "../scene/instancing";
import { resolveDescriptor } from "../scene/themeFallback";
import { geometryFromDescriptor } from "../scene/primitives";
import { wallAxis, wallLength, wallPanels } from "../scene/roomGeometry";
import { geometryTriangleCount } from "./geometry";

/** Triangles d'une `BoxGeometry` low-poly (6 faces × 2). */
const BOX_TRIANGLES = 12;
/** Triangles du sol (`PlaneGeometry` par défaut). */
const FLOOR_TRIANGLES = 2;
/** Boîtes composant le cadre d'un portail (cible cliquable + 2 montants + linteau). */
const PORTAL_BOXES = 4;

const WALLS: readonly Wall[] = ["north", "east", "south", "west"];

// ── Triangles par instance (résolus via le MÊME chemin que la scène) ──

/** Mémoïsation des triangles par couple `(theme, kind)` : géométrie construite une fois. */
const triangleCache = new Map<string, number>();

/**
 * Triangles d'UNE instance d'objet fichier `(theme, kind)`. Résout le descripteur par
 * `resolveDescriptor` (kit enregistré, sinon repli), construit la géométrie réelle,
 * compte, libère. Le résultat reflète donc la configuration de thèmes ACTIVE.
 */
export function instanceTriangleCount(theme: ThemeId, kind: ObjectKind): number {
  const key = `${theme} ${kind}`;
  const cached = triangleCache.get(key);
  if (cached !== undefined) return cached;
  const geometry = geometryFromDescriptor(resolveDescriptor(theme, kind));
  const count = geometryTriangleCount(geometry);
  geometry.dispose();
  triangleCache.set(key, count);
  return count;
}

// ── Décor d'une salle (sol + murs troués + cadres de portail) ──

/** Nombre de meshes et de triangles du décor d'une salle (hors objets fichiers). */
export interface RoomMeshStats {
  meshCount: number;
  triangleCount: number;
}

/**
 * Compte les meshes de décor d'une salle, à l'identique de `Room`/`Portals` : un sol,
 * un panneau plein par segment/linteau de mur (autour des portails), et quatre boîtes
 * par cadre de portail. Fonction PURE (aucune dépendance à three ni React).
 */
export function roomMeshStats(room: SpatialNode): RoomMeshStats {
  const w = room.dimensions.x;
  const d = room.dimensions.z;
  const h = room.dimensions.y;

  // Sol : un plan.
  let meshCount = 1;
  let triangleCount = FLOOR_TRIANGLES;

  // Murs : segments pleins + linteaux découpés autour des ouvertures de portail.
  for (const wall of WALLS) {
    const openings = room.portals
      .filter((p) => p.wall === wall)
      .map((p) => ({ u: p.offset, width: p.width, height: p.height }));
    // `wallAxis` n'influe pas sur le compte ; il reste l'axe géométrique documenté.
    void wallAxis(wall);
    const panels = wallPanels(wallLength(wall, w, d), h, openings);
    meshCount += panels.length;
    triangleCount += panels.length * BOX_TRIANGLES;
  }

  // Portails : quatre boîtes chacun (cible + deux montants + linteau).
  meshCount += room.portals.length * PORTAL_BOXES;
  triangleCount += room.portals.length * PORTAL_BOXES * BOX_TRIANGLES;

  return { meshCount, triangleCount };
}

// ── Statistiques de rendu d'une ZONE (salle courante + voisines) ──

/** Compteurs statiques d'une zone active (salle courante + voisines immédiates). */
export interface ZoneRenderStats {
  /** Salle courante (tête de zone). */
  currentSpatialNodeId: string;
  /** Salles montées dans la zone. */
  roomCount: number;
  /** Meshes de décor (sols, murs, cadres de portail). */
  roomMeshCount: number;
  /** Triangles du décor. */
  roomTriangleCount: number;
  /** Nombre d'`InstancedMesh` = couples `(theme, kind)` visibles dans la zone. */
  instancedMeshCount: number;
  /** Instances d'objets fichiers visibles (total). */
  instanceCount: number;
  /** Triangles des objets fichiers instanciés. */
  instanceTriangleCount: number;
  /** Draw calls totaux : un par mesh de décor + un par `InstancedMesh`. */
  drawCallCount: number;
  /** Triangles totaux (décor + objets). */
  triangleCount: number;
}

/**
 * Compteurs statiques de la zone active d'une salle courante. Somme le décor de chaque
 * salle montée et les instances d'objets fichiers regroupées par `(theme, kind)`.
 */
export function zoneRenderStats(index: WorldIndex, currentSpatialNodeId: string): ZoneRenderStats {
  const zone = computeActiveZone(index, currentSpatialNodeId);

  let roomMeshCount = 0;
  let roomTriangleCount = 0;
  for (const room of zone.rooms) {
    const stats = roomMeshStats(room);
    roomMeshCount += stats.meshCount;
    roomTriangleCount += stats.triangleCount;
  }

  const groups = groupFileObjects(zone.rooms);
  let instanceCount = 0;
  let instanceTriangles = 0;
  for (const group of groups) {
    const perInstance = instanceTriangleCount(group.theme, group.kind);
    instanceCount += group.instances.length;
    instanceTriangles += perInstance * group.instances.length;
  }

  const instancedMeshCount = groups.length;
  return {
    currentSpatialNodeId,
    roomCount: zone.rooms.length,
    roomMeshCount,
    roomTriangleCount,
    instancedMeshCount,
    instanceCount,
    instanceTriangleCount: instanceTriangles,
    drawCallCount: roomMeshCount + instancedMeshCount,
    triangleCount: roomTriangleCount + instanceTriangles,
  };
}

// ── Statistiques d'un monde entier (toutes ses zones) ──

/** Pic de charge d'un monde : le maximum de chaque compteur sur TOUTES ses zones. */
export interface PeakRenderStats {
  drawCallCount: number;
  instancedMeshCount: number;
  instanceCount: number;
  triangleCount: number;
  /** Salle courante de la zone au pic de triangles (zone la plus lourde). */
  worstZoneByTriangles: string | null;
}

/** Rapport de rendu d'un monde : une zone par salle + le pic de charge. */
export interface WorldRenderStats {
  zones: ZoneRenderStats[];
  peak: PeakRenderStats;
}

/** Réduit une liste de zones au pic (maximum composante par composante). */
export function peakRenderStats(zones: readonly ZoneRenderStats[]): PeakRenderStats {
  const peak: PeakRenderStats = {
    drawCallCount: 0,
    instancedMeshCount: 0,
    instanceCount: 0,
    triangleCount: 0,
    worstZoneByTriangles: null,
  };
  for (const zone of zones) {
    peak.drawCallCount = Math.max(peak.drawCallCount, zone.drawCallCount);
    peak.instancedMeshCount = Math.max(peak.instancedMeshCount, zone.instancedMeshCount);
    peak.instanceCount = Math.max(peak.instanceCount, zone.instanceCount);
    if (zone.triangleCount > peak.triangleCount) {
      peak.triangleCount = zone.triangleCount;
      peak.worstZoneByTriangles = zone.currentSpatialNodeId;
    }
  }
  return peak;
}

/**
 * Statistiques de rendu d'un monde : la zone active de CHAQUE salle (le joueur peut se
 * tenir dans n'importe laquelle) et le pic de charge. C'est la base du contrôle de
 * budget : aucune zone ne doit dépasser les budgets.
 */
export function worldRenderStats(world: World): WorldRenderStats {
  const index = buildWorldIndex(world);
  const zones = world.layout.spatialNodes.map((node) => zoneRenderStats(index, node.id));
  return { zones, peak: peakRenderStats(zones) };
}
