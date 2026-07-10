/**
 * Implémentation PROCÉDURALE du `ThemeKit` (world-schema-v0 §13.1, layout-engine-v0 §8).
 *
 * Décision produit : aucun asset externe. Chaque couple `(theme, kind)` se résout en
 * UNE primitive low-poly (boîte, cylindre, cône) + dimensions dérivées du `footprint`
 * du contrat + une couleur de palette. Les descripteurs sont PRÉ-CALCULÉS et gelés :
 * `resolve` renvoie toujours la MÊME référence pour un couple donné, condition de
 * l'instancing côté scène (une géométrie/un matériau partagés par toutes les instances).
 *
 * Langage visuel v0 :
 *  - les OBJETS FICHIERS portent une couleur SÉMANTIQUE par `kind` (code=bleu,
 *    config=ambre, doc=info, test=vert, generic=gris) — cohérente d'une salle à l'autre ;
 *  - les REPÈRES ARCHITECTURAUX (`readme-stand`, `console`) portent l'ACCENT de la salle
 *    (`themeAccentName`), renforçant l'identité du thème.
 */

import type { ObjectKind, ThemeId } from "@codeworld/world-schema";
import { themeAccentName, type PaletteColorName } from "../palette";
import { footprint } from "./ThemeKit";
import type { PrimitiveDescriptor, PrimitiveShape, ThemeKit } from "./ThemeKit";

/** Les 3 thèmes réellement produits en v0 (world-schema-v0 §13.2). */
export const PROCEDURAL_THEMES = ["project-hall", "control-room", "neutral"] as const;
type V0Theme = (typeof PROCEDURAL_THEMES)[number];

/** Les 7 `ObjectKind` du contrat (layout-engine-v0 §8.2), pour itérer les couples. */
export const OBJECT_KINDS = [
  "file-generic",
  "file-code",
  "file-config",
  "file-doc",
  "file-test",
  "readme-stand",
  "console",
] as const satisfies readonly ObjectKind[];

/** Gabarit géométrique par `kind` : forme + hauteur + marge au sol (retrait du footprint). */
interface KindTemplate {
  shape: PrimitiveShape;
  /** Hauteur pleine en mm. */
  height: number;
  /** Retrait total appliqué à chaque dimension au sol, pour tenir dans le footprint. */
  inset: number;
  /** Segments radiaux pour cylindre/cône (bas = low-poly). */
  radialSegments?: number;
}

/**
 * Un gabarit par `kind`, PARTAGÉ par les 3 thèmes : la géométrie ne dépend que du `kind`
 * (seule la couleur varie par thème), ce qui minimise les géométries distinctes (PRD §9.5).
 * `readme-stand`/`console` héritent d'une emprise asymétrique 3000×1500 (footprint) : la
 * boîte reste plus large (x) que profonde (z), l'orientation étant appliquée par la scène.
 */
const KIND_TEMPLATE: Readonly<Record<ObjectKind, KindTemplate>> = {
  "file-generic": { shape: "box", height: 1200, inset: 500 },
  "file-code": { shape: "box", height: 1900, inset: 500 },
  "file-config": { shape: "cylinder", height: 1300, inset: 400, radialSegments: 6 },
  "file-doc": { shape: "box", height: 1500, inset: 600 },
  "file-test": { shape: "cone", height: 1600, inset: 400, radialSegments: 4 },
  "readme-stand": { shape: "box", height: 2000, inset: 200 },
  console: { shape: "box", height: 1100, inset: 200 },
};

/** Couleur SÉMANTIQUE des objets fichiers (les repères architecturaux la surchargent). */
const KIND_SEMANTIC_COLOR: Readonly<Record<ObjectKind, PaletteColorName>> = {
  "file-generic": "textMuted",
  "file-code": "accent",
  "file-config": "warning",
  "file-doc": "info",
  "file-test": "success",
  "readme-stand": "themeProjectHall",
  console: "themeControlRoom",
};

/** Un repère architectural prend l'accent de sa salle ; un fichier, sa couleur sémantique. */
function colorFor(theme: V0Theme, kind: ObjectKind): PaletteColorName {
  if (kind === "readme-stand" || kind === "console") return themeAccentName(theme);
  return KIND_SEMANTIC_COLOR[kind];
}

/** Construit le descripteur gelé d'un couple `(theme, kind)`. */
function buildDescriptor(theme: V0Theme, kind: ObjectKind): PrimitiveDescriptor {
  const tpl = KIND_TEMPLATE[kind];
  const fp = footprint(kind);
  const size = Object.freeze({ x: fp.x - tpl.inset, y: tpl.height, z: fp.z - tpl.inset });
  const base: PrimitiveDescriptor = { shape: tpl.shape, size, color: colorFor(theme, kind) };
  return Object.freeze(
    tpl.radialSegments !== undefined ? { ...base, radialSegments: tpl.radialSegments } : base,
  );
}

type ThemeTable = Readonly<Record<ObjectKind, PrimitiveDescriptor>>;

/** Table exhaustive d'un thème (les 7 kinds), gelée. */
function buildThemeTable(theme: V0Theme): ThemeTable {
  return {
    "file-generic": buildDescriptor(theme, "file-generic"),
    "file-code": buildDescriptor(theme, "file-code"),
    "file-config": buildDescriptor(theme, "file-config"),
    "file-doc": buildDescriptor(theme, "file-doc"),
    "file-test": buildDescriptor(theme, "file-test"),
    "readme-stand": buildDescriptor(theme, "readme-stand"),
    console: buildDescriptor(theme, "console"),
  };
}

/** Toutes les primitives pré-calculées : 3 thèmes × 7 kinds = 21 descripteurs stables. */
const TABLE: Readonly<Record<V0Theme, ThemeTable>> = {
  "project-hall": buildThemeTable("project-hall"),
  "control-room": buildThemeTable("control-room"),
  neutral: buildThemeTable("neutral"),
};

/** Ramène tout `ThemeId` sur un thème produit v0 ; les thèmes réservés retombent sur `neutral`. */
function toV0(theme: ThemeId): V0Theme {
  return theme === "project-hall" || theme === "control-room" ? theme : "neutral";
}

/**
 * Le kit procédural, unique et sans état, enregistré pour les 3 thèmes v0. `resolve` est
 * TOTALE (tout `ThemeId` × tout `ObjectKind`) et renvoie une référence partagée ; `footprint`
 * réutilise l'emprise du contrat (garantie d'égalité avec `FileObject.footprint`).
 */
export const proceduralThemeKit: ThemeKit = {
  resolve(theme, kind) {
    return TABLE[toV0(theme)][kind];
  },
  footprint,
};
