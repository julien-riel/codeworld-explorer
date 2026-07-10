/**
 * Géométrie entière du moteur de layout (layout-engine-v0 §4, §6).
 *
 * Contrainte dure : aucun flottant, aucune trigonométrie, aucune division
 * inexacte. Les seules divisions employées portent sur des quantités PAIRES
 * (§2.3) — demi-extents de salle, `cellSize/2` — et sont donc exactes ; elles
 * passent par `div` (§9.4), quotient entier vérifié.
 */

import { div, min, max } from "../integer.js";
import type {
  Wall,
  Point2,
  Vec3i,
  Aabb2,
  Cell,
  Slot,
  WallOffset,
  WallSpec,
  GeometryOptions,
} from "./types.js";

/** Ordre canonique des murs (rang de tri des portails, §2.4 du contrat). */
export const WALL_ORDER: readonly Wall[] = ["north", "east", "south", "west"];

/**
 * Les quatre murs (§4.1). `cornerSign` multiplie les demi-extents `(w/2, d/2)`
 * pour donner le coin de référence ; `offsetDir` est le sens de l'offset croissant
 * (parcours horaire vu du dessus). `normal` est la normale sortante.
 */
export const WALLS: Readonly<Record<Wall, WallSpec>> = {
  north: { wall: "north", rank: 0, normal: { x: 0, z: -1 }, cornerSign: { x: -1, z: -1 }, offsetDir: { x: 1, z: 0 } },
  east: { wall: "east", rank: 1, normal: { x: 1, z: 0 }, cornerSign: { x: 1, z: -1 }, offsetDir: { x: 0, z: 1 } },
  south: { wall: "south", rank: 2, normal: { x: 0, z: 1 }, cornerSign: { x: 1, z: 1 }, offsetDir: { x: -1, z: 0 } },
  west: { wall: "west", rank: 3, normal: { x: -1, z: 0 }, cornerSign: { x: -1, z: 1 }, offsetDir: { x: 0, z: -1 } },
};

/** Rang de tri d'un mur : north=0, east=1, south=2, west=3 (§4.1). */
export function wallRank(wall: Wall): number {
  return WALLS[wall].rank;
}

/**
 * Coin de référence d'un mur en coordonnées locales, pour une salle de largeur
 * `width` (extent x) et profondeur `depth` (extent z), tous deux PAIRS (§4.1).
 */
export function referenceCorner(wall: Wall, width: number, depth: number): Point2 {
  const spec = WALLS[wall];
  return { x: spec.cornerSign.x * div(width, 2), z: spec.cornerSign.z * div(depth, 2) };
}

/**
 * Seuil 2D d'un portail (§4.3) : point du mur cible du segment de visibilité,
 * fonction de `(wall, offset, width, depth)` uniquement. `width = dimensions.x`,
 * `depth = dimensions.z` de la salle (carrée en v0, mais gardés distincts pour
 * coller à la formule). Toutes les composantes sont entières.
 */
export function thresholdPoint(wall: Wall, offset: number, width: number, depth: number): Point2 {
  const spec = WALLS[wall];
  const corner = referenceCorner(wall, width, depth);
  return { x: corner.x + spec.offsetDir.x * offset, z: corner.z + spec.offsetDir.z * offset };
}

/**
 * Créneaux de mur dans l'ordre canonique (§4.2, §9.9) : mur par rang croissant
 * (north, east, south, west), puis offset croissant dans chaque mur. Exactement
 * `4·(S − 2)` créneaux, d'index global `0 … 4·(S−2) − 1`. Précondition : `S`
 * impair `≥ 3`.
 */
export function slotList(S: number): Slot[] {
  const slots: Slot[] = [];
  for (let i = 1; i <= S - 2; i++) slots.push({ wall: "north", col: i, row: 0 });
  for (let j = 1; j <= S - 2; j++) slots.push({ wall: "east", col: S - 1, row: j });
  for (let i = S - 2; i >= 1; i--) slots.push({ wall: "south", col: i, row: S - 1 });
  for (let j = S - 2; j >= 1; j--) slots.push({ wall: "west", col: 0, row: j });
  return slots;
}

/**
 * `(wall, offset)` du créneau d'index global `slotIndex` dans `slotList(S)`
 * (§4.3, §9.9). `offset` est la position du CENTRE de la porte le long du mur,
 * depuis le coin de référence — entier, car `cellSize` est pair.
 *
 * @throws RangeError si `slotIndex` sort de `[0, 4·(S−2))`.
 */
export function slotWallOffset(slotIndex: number, S: number, cellSize: number): WallOffset {
  const slot = slotList(S)[slotIndex];
  if (slot === undefined) {
    throw new RangeError(`slotIndex ${slotIndex} hors de [0, ${4 * (S - 2)}) pour S=${S}`);
  }
  const half = div(cellSize, 2);
  switch (slot.wall) {
    case "north":
      return { wall: "north", offset: slot.col * cellSize + half };
    case "east":
      return { wall: "east", offset: slot.row * cellSize + half };
    case "south":
      return { wall: "south", offset: (S - 1 - slot.col) * cellSize + half };
    case "west":
      return { wall: "west", offset: (S - 1 - slot.row) * cellSize + half };
  }
}

/**
 * Intersection segment `[a, b]` × AABB, en arithmétique ENTIÈRE (§6.4) : axes
 * séparateurs (SAT) sur les deux axes de la boîte plus la normale au segment,
 * par produits croisés — aucun flottant, aucune division, aucune trigonométrie.
 *
 * Généralise le test du §6.4 (fixé à `a = (0,0)`) à un segment quelconque : pour
 * `a = (0,0)`, `side(Q) = D × (Q − a)` se réduit à `b.x·Q.z − b.z·Q.x`, donc le
 * résultat est IDENTIQUE à celui de la spec sur son usage (segment centre→seuil).
 *
 * CONSERVATEUR AUX BORDS : les rejets d'axe utilisent `<`/`>` stricts et le rejet
 * par côté exige un signe strict aux 4 coins. Un contact exact (tangence, coin sur
 * la droite, seuil sur un coin) NE sépare PAS et compte comme intersection — c'est
 * le sens sûr pour l'invariant de visibilité. Cas dégénérés couverts : segment
 * axial (`dx == 0` ou `dz == 0`) et segment de longueur nulle (`a == b`, réduit à
 * un test point ∈ boîte fermée).
 */
export function segmentIntersectsAABB(a: Point2, b: Point2, box: Aabb2): boolean {
  // Axe 1 — projection sur x du segment vs [xMin, xMax].
  if (max(a.x, b.x) < box.xMin) return false;
  if (min(a.x, b.x) > box.xMax) return false;
  // Axe 2 — projection sur z.
  if (max(a.z, b.z) < box.zMin) return false;
  if (min(a.z, b.z) > box.zMax) return false;

  // Axe 3 — normale au segment. side(Q) = D × (Q − a), D = b − a.
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const s1 = dx * (box.zMin - a.z) - dz * (box.xMin - a.x); // coin (xMin, zMin)
  const s2 = dx * (box.zMin - a.z) - dz * (box.xMax - a.x); // coin (xMax, zMin)
  const s3 = dx * (box.zMax - a.z) - dz * (box.xMin - a.x); // coin (xMin, zMax)
  const s4 = dx * (box.zMax - a.z) - dz * (box.xMax - a.x); // coin (xMax, zMax)
  if (s1 > 0 && s2 > 0 && s3 > 0 && s4 > 0) return false;
  if (s1 < 0 && s2 < 0 && s3 < 0 && s4 < 0) return false;

  return true;
}

/**
 * Cellules libres d'une salle `S × S`, dans l'ordre canonique row-major (§6.3) :
 * on retire la cellule centrale et toute cellule dont l'AABB élargie de
 * `clearance` intersecte un segment `centre (0,0) → seuil` d'un portail.
 * `portals` porte les `(wall, offset)` de TOUS les portails placés (y compris les
 * réservés vides), afin que le résultat ne dépende que de `(S, portals, options)`.
 */
export function computeFreeCells(
  S: number,
  portals: readonly WallOffset[],
  options: GeometryOptions,
): Cell[] {
  const W = options.cellSize;
  const g = options.clearance;
  const mid = div(S - 1, 2);
  const half = div(W, 2);
  const side = S * W; // salle carrée : w = d = S·cellSize
  const thresholds = portals.map((p) => thresholdPoint(p.wall, p.offset, side, side));
  const center: Point2 = { x: 0, z: 0 };

  const free: Cell[] = [];
  for (let row = 0; row < S; row++) {
    for (let col = 0; col < S; col++) {
      if (col === mid && row === mid) continue; // cellule centrale exclue
      const cx = (col - mid) * W;
      const cz = (row - mid) * W;
      const box: Aabb2 = {
        xMin: cx - half - g,
        xMax: cx + half + g,
        zMin: cz - half - g,
        zMax: cz + half + g,
      };
      let blocked = false;
      for (const t of thresholds) {
        if (segmentIntersectsAABB(center, t, box)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) free.push({ col, row });
    }
  }
  return free;
}

/**
 * Centre d'une cellule en coordonnées LOCALES au centre-sol de la salle (§9.11).
 * `y = 0` (les objets sont posés au sol de leur salle).
 */
export function localCellCenter(cell: Cell, S: number, cellSize: number): Vec3i {
  const mid = div(S - 1, 2);
  return { x: (cell.col - mid) * cellSize, y: 0, z: (cell.row - mid) * cellSize };
}

/** Cellule → index row-major dans une grille de `cols` colonnes : `row·cols + col`. */
export function cellToIndex(cell: Cell, cols: number): number {
  return cell.row * cols + cell.col;
}

/** Index row-major → cellule dans une grille de `cols` colonnes (inverse de `cellToIndex`). */
export function indexToCell(index: number, cols: number): Cell {
  return { col: index % cols, row: div(index, cols) };
}
