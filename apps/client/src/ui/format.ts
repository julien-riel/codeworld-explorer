/**
 * Helpers de FORMATAGE purs pour l'interface 2D (PRD §9.3, §11.2).
 *
 * Aucune dépendance à React ni au store : fonctions testables en isolation,
 * partagées par les panneaux (fil d'Ariane, panneau de code, barre d'orientation).
 */

import type { ThemeId } from "@codeworld/world-schema";

// ── Chemins de mondes / contenus ──

/**
 * Dossier de base d'un monde à partir du chemin de son `world.json`.
 * Ex. `"schema/world.json"` → `"schema"` ; sert à composer l'URL des blobs de
 * contenu (`worlds/<base>/files/<contentHash>`, cf. `fileContentUrl`).
 */
export function worldBaseDir(worldPath: string): string {
  return worldPath.replace(/\/?[^/]*$/, "");
}

// ── Lien GitHub (FR-008) ──

/** Empreinte de commit « nulle » (mondes de démonstration sans dépôt réel). */
const ZERO_SHA = "0".repeat(40);

/**
 * Réf git préférée pour un lien GitHub : le commit analysé s'il est réel, sinon la
 * branche (les artefacts de démonstration portent une empreinte nulle).
 */
export function preferredRef(commitSha: string, branch: string): string {
  return commitSha === "" || commitSha === ZERO_SHA ? branch : commitSha;
}

/** Paramètres d'un lien « blob » GitHub (fichier à une réf donnée). */
export interface GithubBlobParams {
  /** `repository.url`, ex. `https://github.com/owner/name`. */
  repoUrl: string;
  /** Commit SHA ou nom de branche. */
  ref: string;
  /** Chemin du fichier dans le dépôt (repère racine). */
  path: string;
  /** Numéro de ligne (1-based) pour l'ancre `#L…`, si connu. */
  line?: number;
}

/**
 * Construit l'URL GitHub d'un fichier (FR-008) :
 * `<repoUrl>/blob/<ref>/<path>` avec l'ancre `#L<line>` quand une ligne est fournie.
 * Robuste au slash final et au suffixe `.git` de `repoUrl` ; chaque segment de
 * chemin est encodé (espaces, caractères spéciaux) sans toucher aux séparateurs.
 */
export function githubBlobUrl(params: GithubBlobParams): string {
  const base = params.repoUrl.replace(/\/+$/, "").replace(/\.git$/, "");
  const encodedPath = params.path
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const anchor =
    params.line !== undefined && Number.isFinite(params.line) && params.line > 0
      ? `#L${String(Math.floor(params.line))}`
      : "";
  return `${base}/blob/${encodeURIComponent(params.ref)}/${encodedPath}${anchor}`;
}

// ── Tailles ──

const BYTE_UNITS = ["o", "Ko", "Mo", "Go"] as const;

/**
 * Taille lisible en base 1024 (octets → Ko/Mo/Go), une décimale au-delà du Ko.
 * Ex. `479` → `"479 o"`, `1536` → `"1,5 Ko"`. `undefined` → chaîne vide.
 */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? String(value) : value.toFixed(1).replace(".", ",");
  return `${rounded} ${BYTE_UNITS[unit] ?? "o"}`;
}

// ── Libellés lisibles ──

/** Libellé français d'un `ThemeId` (barre d'orientation, PRD §9.3). */
const THEME_LABELS: Readonly<Record<ThemeId, string>> = {
  "project-hall": "Hall de projet",
  "control-room": "Salle de contrôle",
  neutral: "Neutre",
  factory: "Usine",
  "design-gallery": "Galerie de design",
  "tool-workshop": "Atelier",
  "object-museum": "Musée",
  "archive-warehouse": "Entrepôt d'archives",
  "machine-room": "Salle des machines",
  laboratory: "Laboratoire",
  library: "Bibliothèque",
};

/** Libellé affichable d'un thème ; retombe sur l'identifiant brut si inconnu. */
export function themeLabel(theme: string): string {
  return THEME_LABELS[theme as ThemeId] ?? theme;
}

/**
 * Libellé d'un segment de chemin GitHub : le nom du nœud, ou `"/"` pour la racine
 * (dont le `path` est vide). Jamais une chaîne vide, pour rester cliquable/lisible.
 */
export function segmentLabel(name: string, path: string): string {
  if (name !== "") return name;
  return path === "" ? "/" : path;
}
