/**
 * Abstraction `ThemeKit` (world-schema-v0 §13.1) : le contrat de rendu des thèmes,
 * PARTAGÉ côté client et HORS artefact.
 *
 * Ce fichier ne contient que le CONTRAT : l'interface `ThemeKit`, les types de
 * descripteurs de primitives, la table d'emprises `KIND_FOOTPRINT` (donnée de
 * layout, versionnée avec `layoutVersion`) et un registre VIDE. L'implémentation
 * procédurale des 3 thèmes v0 (`project-hall`, `control-room`, `neutral`) est
 * écrite par un autre agent, qui remplit `themeKitRegistry`.
 */

// Les vocabulaires fermés viennent du contrat : on ne les redéfinit pas.
import type { ObjectKind, ThemeId } from "@codeworld/world-schema";
import type { PaletteColorName } from "../palette";

export type { ObjectKind, ThemeId };

/** Forme géométrique procédurale low-poly (PRD §9.5). Aucun asset externe en v0. */
export type PrimitiveShape =
  | "box"
  | "cylinder"
  | "cone"
  | "plane"
  | "sphere";

/**
 * Descripteur d'une primitive de rendu retourné par `resolve`. Il porte la géométrie
 * (forme + dimensions en mm, repère MODÈLE), la couleur (NOM de palette, jamais un
 * hex nu — PRD §10.3), et des paramètres low-poly optionnels.
 *
 * Les dimensions sont en millimètres pour rester cohérentes avec le layout ; la
 * conversion vers l'échelle three (1 unité = 1 m) est faite au montage de la scène.
 */
export interface PrimitiveDescriptor {
  shape: PrimitiveShape;
  /** Dimensions pleines en mm (largeur x, hauteur y, profondeur z), avant rotation. */
  size: { x: number; y: number; z: number };
  /** Couleur de base, par NOM de palette produit (PRD §9.5, §10.3). */
  color: PaletteColorName;
  /** Nombre de segments radiaux pour `cylinder`/`cone`/`sphere` (défaut rendu : bas). */
  radialSegments?: number;
  /** Décalage vertical du centre par rapport au sol, en mm (défaut : posé au sol). */
  yOffset?: number;
}

/**
 * Contrat `ThemeKit` (world-schema-v0 §13.1). Un kit par thème sait produire la
 * géométrie de rendu d'un `ObjectKind` et rappeler son emprise au sol.
 */
export interface ThemeKit {
  /** Géométrie procédurale + couleur pour un couple (thème, kind). */
  resolve(theme: ThemeId, kind: ObjectKind): PrimitiveDescriptor;
  /** Emprise au sol en mm (= `KIND_FOOTPRINT`), utilisée aussi par le layout. */
  footprint(kind: ObjectKind): { x: number; z: number };
}

/**
 * `KIND_FOOTPRINT` — emprise au sol en mm, table §8.3 de layout-engine-v0.
 *
 * Cette table est la DONNÉE de layout partagée (versionnée avec `layoutVersion`).
 * Le paquet `@codeworld/world-schema` la garde interne (elle n'est pas réexportée) ;
 * on en tient donc ici une copie fidèle, dont l'égalité avec `FileObject.footprint`
 * est déjà garantie côté producteur par l'invariant I9. Le rendu n'a besoin de rien
 * de plus.
 */
export const KIND_FOOTPRINT: Readonly<Record<ObjectKind, { x: number; z: number }>> = {
  "file-generic": { x: 2000, z: 2000 },
  "file-code": { x: 2000, z: 2000 },
  "file-config": { x: 2000, z: 2000 },
  "file-doc": { x: 2000, z: 2000 },
  "file-test": { x: 2000, z: 2000 },
  "readme-stand": { x: 3000, z: 1500 },
  console: { x: 3000, z: 1500 },
};

/** Emprise au sol d'un `ObjectKind` (helper partageable par tous les kits). */
export function footprint(kind: ObjectKind): { x: number; z: number } {
  return KIND_FOOTPRINT[kind];
}

/**
 * Registre des kits par thème. VIDE en fondation : l'agent « thèmes » y enregistre
 * les implémentations procédurales de `project-hall`, `control-room` et `neutral`.
 * `Partial` reflète qu'un thème peut ne pas (encore) avoir de kit.
 */
export type ThemeKitRegistry = Partial<Record<ThemeId, ThemeKit>>;

/** Enregistrement de kit, initialement vide (rempli par l'agent thèmes). */
export const themeKitRegistry: ThemeKitRegistry = {};

/** Enregistre le kit d'un thème (appelé par l'implémentation des thèmes). */
export function registerThemeKit(theme: ThemeId, kit: ThemeKit): void {
  themeKitRegistry[theme] = kit;
}

/** Récupère le kit d'un thème, ou `undefined` s'il n'est pas encore enregistré. */
export function getThemeKit(theme: ThemeId): ThemeKit | undefined {
  return themeKitRegistry[theme];
}
