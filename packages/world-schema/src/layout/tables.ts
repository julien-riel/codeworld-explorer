/**
 * Tables déterministes du moteur de layout (layout-engine-v0 §8).
 *
 * Ces tables entrent dans les octets de l'artefact (FR-026) : elles sont
 * EXHAUSTIVES et sans approximation. Elles ne dépendent d'aucune source d'entropie
 * ni d'horloge, ne font aucune arithmétique flottante et n'importent aucun module
 * Node. Les types de domaine (`Category`, `ThemeId`, `ObjectKind`, `SpaceType`,
 * `FileRole`, `Orientation`) sont déclarés localement : le contrat `schema.ts` est
 * écrit en parallèle et ne doit PAS être importé ici.
 */

import { abs, div } from "../integer.js";

// ── Domaines énumérés (const arrays → types dérivés, énumérables au runtime) ──

/** Catégories de classification (contrat §3.6, taxonomie PRD §12.2). */
export const CATEGORIES = [
  "root", "controller", "route", "service", "domain", "ui", "utility",
  "model", "repository", "data", "configuration", "test", "documentation",
  "asset", "build", "generated", "vendor", "unknown",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Identifiants de thème (contrat §3.7) ; seuls les trois premiers sont produits en v0. */
export const THEME_IDS = [
  "project-hall", "control-room", "neutral",
  "factory", "design-gallery", "tool-workshop",
  "object-museum", "archive-warehouse", "machine-room",
  "laboratory", "library",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Vocabulaire d'objets fichier (layout-engine-v0 §8.2). */
export const OBJECT_KINDS = [
  "file-generic", "file-code", "file-config", "file-doc", "file-test",
  "readme-stand", "console",
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** Rôle d'un fichier, dérivé de son nom (layout-engine-v0 §8.1). */
export const FILE_ROLES = [
  "readme", "doc", "test", "config", "code", "generic",
] as const;
export type FileRole = (typeof FILE_ROLES)[number];

/** Types d'espace produits en v0 (sous-ensemble de `SpaceType`, layout-engine-v0 §8.4). */
export type V0SpaceType = "hall" | "room" | "plaza" | "gallery";

/** Orientation en quarts de tour horaires (contrat §2.1) : 0=−z, 1=+x, 2=+z, 3=−x. */
export type Orientation = 0 | 1 | 2 | 3;

// ── asciiLower : abaissement ASCII PUR, sans dépendance à la version Unicode ──

/**
 * Abaisse les SEULS code-units U+0041..U+005A (A..Z → a..z) et laisse tout autre
 * code-unit inchangé. On n'emploie JAMAIS `String.prototype.toLowerCase`, dont le
 * case-mapping dépend de la version Unicode du moteur (aléa banni, §1.2 / ADR-0003) :
 * l'İ turc (U+0130) ou le ẞ (U+1E9E) donneraient des octets différents entre Node et
 * le navigateur. L'itération porte sur les code-units UTF-16 ; une paire de
 * substitution (hors BMP) traverse donc intacte.
 */
export function asciiLower(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    out += String.fromCharCode(u >= 0x41 && u <= 0x5a ? u + 0x20 : u);
  }
  return out;
}

// ── roleOfFile : cascade ordonnée et exhaustive (layout-engine-v0 §8.1) ──

const DOC_EXT = new Set(["md", "mdx", "markdown", "rst", "adoc", "txt"]);
const CONFIG_EXT = new Set([
  "json", "yaml", "yml", "toml", "ini", "env", "cfg", "conf", "xml", "lock", "properties",
]);
const CONFIG_NAME = new Set([".gitignore", ".npmrc", ".editorconfig", "dockerfile", "makefile"]);
const CODE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt", "scala",
  "c", "h", "cpp", "hpp", "cc", "cs", "php", "swift", "sh", "bash",
]);

/**
 * Associe à un nom de fichier son `FileRole`. La PREMIÈRE règle satisfaite gagne ;
 * la dernière (`generic`) est un défaut total. L'évaluation est insensible à la casse
 * ASCII uniquement (`asciiLower`). L'extension est la sous-chaîne après le DERNIER
 * point de `lower`, ou `""` s'il n'y a pas de point (donc `.gitignore` a l'extension
 * `gitignore`, mais est reconnu par son nom complet en règle 4).
 */
export function roleOfFile(name: string): FileRole {
  const lower = asciiLower(name);
  const dot = lower.lastIndexOf(".");
  const ext = dot === -1 ? "" : lower.slice(dot + 1);

  if (lower === "readme" || lower.startsWith("readme.")) return "readme";
  if (DOC_EXT.has(ext)) return "doc";
  if (lower.includes(".test.") || lower.includes(".spec.")) return "test";
  if (CONFIG_EXT.has(ext) || CONFIG_NAME.has(lower)) return "config";
  if (CODE_EXT.has(ext)) return "code";
  return "generic";
}

// ── THEME_OF : Category → ThemeId, totale (contrat §13.2) ──

/**
 * Associe une catégorie à son thème v0. Totale sur les 18 catégories : `root` →
 * `project-hall`, `controller`/`route` → `control-room`, tout le reste (dont le repli
 * `unknown`) → `neutral`. Seuls ces trois thèmes sont produits en v0.
 */
export const THEME_OF: Record<Category, ThemeId> = {
  root: "project-hall",
  controller: "control-room",
  route: "control-room",
  service: "neutral",
  domain: "neutral",
  ui: "neutral",
  utility: "neutral",
  model: "neutral",
  repository: "neutral",
  data: "neutral",
  configuration: "neutral",
  test: "neutral",
  documentation: "neutral",
  asset: "neutral",
  build: "neutral",
  generated: "neutral",
  vendor: "neutral",
  unknown: "neutral",
};

// ── OBJECT_OF : (thème v0 × rôle) → ObjectKind, table totale (layout-engine-v0 §8.2) ──

/** Thèmes effectivement produits en v0, seul domaine de `OBJECT_OF` (§8.2). */
export const OBJECT_THEMES = ["project-hall", "control-room", "neutral"] as const;
export type ObjectTheme = (typeof OBJECT_THEMES)[number];

/**
 * Table `OBJECT_OF[theme][role]`. Les 18 combinaisons (3 thèmes v0 × 6 rôles) sont
 * définies, aucune case vide. Dans `control-room`, `code` et `config` deviennent des
 * `console` ; partout ailleurs les rôles se mappent sur leurs objets `file-*` homonymes
 * (`project-hall` et `neutral` sont identiques). `readme` donne toujours `readme-stand`.
 */
export const OBJECT_OF: Record<ObjectTheme, Record<FileRole, ObjectKind>> = {
  "project-hall": {
    readme: "readme-stand", doc: "file-doc", test: "file-test",
    config: "file-config", code: "file-code", generic: "file-generic",
  },
  "control-room": {
    readme: "readme-stand", doc: "file-doc", test: "file-test",
    config: "console", code: "console", generic: "file-generic",
  },
  neutral: {
    readme: "readme-stand", doc: "file-doc", test: "file-test",
    config: "file-config", code: "file-code", generic: "file-generic",
  },
};

// ── KIND_FOOTPRINT : emprise au sol (mm entiers), repère modèle (layout-engine-v0 §8.3) ──

/**
 * Emprise au sol de chaque `ObjectKind`, en mm entiers, dans le repère MODÈLE (avant
 * rotation). Contrainte respectée pour chaque entrée : `max(x, z) + clearance ≤ cellSize`
 * (3000 + 1000 ≤ 4000), donc l'objet tourné de 90° tient aussi. Le producteur COPIE la
 * référence dans `FileObject.footprint` (I9 teste l'égalité de référence) : ces objets
 * sont des constantes de module partagées, jamais recréées.
 */
export const KIND_FOOTPRINT: Record<ObjectKind, { x: number; z: number }> = {
  "file-generic": { x: 2000, z: 2000 },
  "file-code": { x: 2000, z: 2000 },
  "file-config": { x: 2000, z: 2000 },
  "file-doc": { x: 2000, z: 2000 },
  "file-test": { x: 2000, z: 2000 },
  "readme-stand": { x: 3000, z: 1500 },
  console: { x: 3000, z: 1500 },
};

// ── pickSpaceType : SpaceType de la page 0 d'un dossier, totale (layout-engine-v0 §8.4) ──

/**
 * Vue minimale d'un dossier suffisante à `pickSpaceType` : seuls la racineïté et les
 * cardinalités `C = |childDirs|`, `F = |files|` comptent. Toute structure du layout
 * (`LayoutDir`) satisfait ce type ; on n'importe donc pas la définition d'entrée.
 */
export interface SpaceTypeInput {
  isRoot: boolean;
  childDirs: readonly unknown[];
  files: readonly unknown[];
}

/**
 * Type d'espace de la page 0 (`primary`/`hall`) d'un dossier. Totale, évaluée dans
 * l'ordre : la racine est toujours `hall` ; le critère sous-dossiers (`plaza`) prime sur
 * le critère fichiers (`gallery`). Les seuils viennent de `LayoutOptions` (§10) et sont
 * passés en paramètre pour éviter une dépendance circulaire vers `options.ts`. Les annexes
 * (page ≥ 1) sont TOUJOURS `"gallery"` et ne passent jamais par ici (§8.4).
 */
export function pickSpaceType(
  d: SpaceTypeInput,
  plazaThreshold: number,
  galleryThreshold: number,
): V0SpaceType {
  if (d.isRoot) return "hall";
  if (d.childDirs.length >= plazaThreshold) return "plaza";
  if (d.files.length >= galleryThreshold) return "gallery";
  return "room";
}

// ── objectOrientation : l'objet fait face au centre (layout-engine-v0 §8.5) ──

/**
 * Orientation d'un `FileObject` en cellule `(col, row)` d'une salle `S×S` : celle dont la
 * direction s'aligne le mieux avec le vecteur objet → centre. La rupture d'égalité en
 * diagonale (`|Δrow| == |Δcol|`) va à l'axe z (orientation 0/2). Le facteur `cellSize` du
 * §8.5 se simplifie exactement : positif, il préserve la comparaison des valeurs absolues
 * et le signe, donc l'orientation ne dépend que de `(col, row, S)`. Le cas centre
 * (`Δrow == Δcol == 0`) est impossible : la cellule centrale est exclue de `freeCells` (§6.3).
 */
export function objectOrientation(col: number, row: number, S: number): Orientation {
  const mid = div(S - 1, 2);
  const dcol = col - mid;
  const drow = row - mid;
  if (abs(drow) >= abs(dcol)) return drow > 0 ? 0 : 2;
  return dcol > 0 ? 3 : 1;
}
