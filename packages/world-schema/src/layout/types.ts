/**
 * Types géométriques du moteur de layout (layout-engine-v0 §4, §6).
 *
 * Définis localement pour que ce sous-arbre `layout/` ne dépende PAS de
 * `src/schema.ts` (écrit en parallèle) : le contrat n'y fige que la FORME des
 * entités (§3.7 du contrat), pas la géométrie entière calculée ici. Toutes les
 * grandeurs sont des entiers de millimètres ou de petits entiers.
 */

/** Mur d'une salle, nommé par sa normale sortante (§4.1). */
export type Wall = "north" | "east" | "south" | "west";

/** Point 2D au sol (plan XZ), entiers mm. */
export interface Point2 {
  readonly x: number;
  readonly z: number;
}

/** Vecteur 3D entier (mm) — position locale d'un objet (contrat §2.1). */
export interface Vec3i {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Boîte englobante alignée sur les axes, au sol (plan XZ), bornes entières incluses. */
export interface Aabb2 {
  readonly xMin: number;
  readonly xMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

/** Cellule de grille intérieure d'une salle, indexée `(col, row)` (§4.2). */
export interface Cell {
  readonly col: number;
  readonly row: number;
}

/** Créneau de mur : une cellule de périmètre non-coin portée par un mur (§4.2). */
export interface Slot {
  readonly wall: Wall;
  readonly col: number;
  readonly row: number;
}

/** Position d'un portail sur un mur : `offset` mm depuis le coin de référence (§4.1). */
export interface WallOffset {
  readonly wall: Wall;
  readonly offset: number;
}

/**
 * Données canoniques d'un mur (§4.1) : rang de tri, normale sortante, coin de
 * référence exprimé en SIGNES à multiplier par les demi-extents `(w/2, d/2)`, et
 * sens positif de l'offset.
 */
export interface WallSpec {
  readonly wall: Wall;
  readonly rank: number;
  readonly normal: Point2;
  readonly cornerSign: Point2;
  readonly offsetDir: Point2;
}

/** Constantes de layout nécessaires à la géométrie entière (sous-ensemble de `LayoutOptions` §10). */
export interface GeometryOptions {
  readonly cellSize: number;
  readonly clearance: number;
}
