/**
 * Constantes de `LayoutOptions` et vérification de leur cohérence (layout-engine-v0
 * §10 et §10.1, unique source normative — le §14 du contrat n'est plus qu'un renvoi).
 *
 * Toutes les valeurs sont des ENTIERS de millimètres (ou de petits entiers), versionnées
 * avec `LAYOUT_VERSION`. `LayoutOptions` est déclaré ici localement : le contrat
 * `schema.ts` est écrit en parallèle et ne doit PAS être importé.
 */

import { KIND_FOOTPRINT } from "./tables.js";

/**
 * Contrat de configuration du moteur de layout (layout-engine-v0 §10). Toutes les
 * grandeurs sont des entiers ; `roomSideTiers` est une liste ascendante d'impairs.
 */
export interface LayoutOptions {
  // ── grille et espacement (mm) ──
  cellSize: number;
  margin: number;
  clearance: number;
  // ── hauteurs (mm) ──
  roomHeight: number;
  floorHeight: number;
  // ── portes (mm) ──
  doorWidth: number;
  doorHeight: number;
  // ── budget de déplacement (PRD §9.4) ──
  normalSpeed: number;
  doorReachBudgetSeconds: number;
  hopBudgetSeconds: number;
  maxRoomHalfExtent: number;
  // ── paliers et seuils de forme ──
  roomSideTiers: readonly number[];
  plazaThreshold: number;
  galleryThreshold: number;
  reservedSlotCount: number;
  // ── profondeur ──
  maxRenderDepth: number;
}

/** Valeurs par défaut du §10.2 (récapitulatif chiffré). Entiers exacts. */
export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  cellSize: 4000,
  margin: 8000,
  clearance: 1000,
  roomHeight: 4000,
  floorHeight: 6000,
  doorWidth: 2000,
  doorHeight: 3000,
  normalSpeed: 6000,
  doorReachBudgetSeconds: 8,
  hopBudgetSeconds: 3,
  maxRoomHalfExtent: 48000,
  roomSideTiers: [3, 5, 7, 9, 11],
  plazaThreshold: 8,
  galleryThreshold: 12,
  reservedSlotCount: 3,
  maxRenderDepth: 20,
};

/** Lève une erreur nommant l'invariant §10.1 violé. */
function fail(rule: string, detail: string): never {
  throw new Error(`LayoutOptions incohérent (${rule}) : ${detail}`);
}

/**
 * Vérifie les invariants dérivés du §10.1. Passe silencieusement sur des options
 * cohérentes ; lève une `Error` au PREMIER invariant violé. Aucune valeur flottante,
 * aucune trigonométrie : arithmétique entière de bout en bout.
 */
export function assertLayoutOptionsCoherent(options: LayoutOptions): void {
  const {
    cellSize, margin, clearance, doorWidth,
    normalSpeed, doorReachBudgetSeconds, hopBudgetSeconds, maxRoomHalfExtent,
    roomSideTiers, reservedSlotCount,
  } = options;

  // maxRoomHalfExtent == normalSpeed · doorReachBudgetSeconds
  if (maxRoomHalfExtent !== normalSpeed * doorReachBudgetSeconds) {
    fail("half-extent", `${String(maxRoomHalfExtent)} ≠ ${String(normalSpeed)}·${String(doorReachBudgetSeconds)}`);
  }

  // margin ≤ normalSpeed · hopBudgetSeconds
  if (margin > normalSpeed * hopBudgetSeconds) {
    fail("hop-budget", `margin ${String(margin)} > ${String(normalSpeed)}·${String(hopBudgetSeconds)}`);
  }

  // roomSideTiers : non vide, impairs, strictement croissants
  if (roomSideTiers.length === 0) fail("tiers-nonempty", "roomSideTiers est vide");
  let maxTier = 0;
  for (let i = 0; i < roomSideTiers.length; i++) {
    const s = roomSideTiers[i];
    if (s === undefined) continue; // inatteignable (i < length) ; satisfait noUncheckedIndexedAccess
    if (s % 2 !== 1) fail("tiers-odd", `palier pair ${String(s)}`);
    if (i > 0) {
      const prev = roomSideTiers[i - 1];
      if (prev !== undefined && s <= prev) fail("tiers-increasing", `${String(prev)} ≮ ${String(s)}`);
    }
    if (s > maxTier) maxTier = s;
  }

  // max(roomSideTiers) · cellSize ≤ 2 · maxRoomHalfExtent
  if (maxTier * cellSize > 2 * maxRoomHalfExtent) {
    fail("extent-ceiling", `${String(maxTier)}·${String(cellSize)} > 2·${String(maxRoomHalfExtent)}`);
  }

  // cellSize et margin pairs (garantit les divisions exactes, §2.3)
  if (cellSize % 2 !== 0) fail("cellSize-even", `cellSize ${String(cellSize)} impair`);
  if (margin % 2 !== 0) fail("margin-even", `margin ${String(margin)} impair`);

  // Contrainte d'emprise : max(footprint.x, footprint.z) + clearance ≤ cellSize
  for (const fp of Object.values(KIND_FOOTPRINT)) {
    const m = fp.x > fp.z ? fp.x : fp.z;
    if (m + clearance > cellSize) {
      fail("footprint-clearance", `max(${String(fp.x)},${String(fp.z)})+${String(clearance)} > ${String(cellSize)}`);
    }
  }

  // doorWidth ≤ cellSize (la porte tient dans son créneau)
  if (doorWidth > cellSize) fail("door-width", `doorWidth ${String(doorWidth)} > cellSize ${String(cellSize)}`);

  // reservedSlotCount == 3 et doorCapacity(S) = 4·(S−2) − reservedSlotCount > 0 pour tout palier
  if (reservedSlotCount !== 3) fail("reserved-count", `reservedSlotCount ${String(reservedSlotCount)} ≠ 3`);
  for (const s of roomSideTiers) {
    const doorCapacity = 4 * (s - 2) - reservedSlotCount;
    if (doorCapacity <= 0) fail("door-capacity", `doorCapacity(${String(s)}) = ${String(doorCapacity)} ≤ 0`);
  }
}
