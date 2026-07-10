/**
 * Règles d'exclusion par défaut (PRD §22.2, §27.3, contrat §3.5.1).
 *
 * Un dossier exclu N'EST PAS inventorié : on ne descend jamais dans son intérieur
 * (contrat §3.5.1). Un fichier exclu apparaît comme feuille marquée `excludedReason`,
 * sans `contentHash`. La partition volontaire/échec est portée par la seule valeur
 * du code (contrat §3.5.2).
 */

import type { ExcludedReason } from "@codeworld/world-schema";

/** Taille maximale d'un fichier texte inventorié en contenu (PRD §27.3 : 10 Mo). */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Plafond du nombre TOTAL de nœuds inventoriés — racine, dossiers ET fichiers, exclus
 * compris (PRD §27.3, §22.2). Borne le travail CPU/mémoire de bout en bout : sans lui,
 * une arborescence de milliers de dossiers vides échapperait à toute limite (le plafond
 * de fichiers ne mordrait pas) et ouvrirait un déni de service (§22.2).
 */
export const MAX_INVENTORY_NODES = 10_000;

/** Plafond de fichiers analysés en profondeur — ici lus et hachés (PRD §27.3). */
export const MAX_ANALYZED_FILES = 2_000;

/**
 * Plafond du nombre TOTAL de lignes de code passées à l'analyse statique (ts-morph,
 * PRD §27.3, §16.1). Garde-fou de temps CPU distinct du plafond de fichiers : un
 * unique fichier pathologiquement long (bundle minifié échappant à la détection
 * binaire) ne doit pas faire exploser le temps de parsing. Volontairement large :
 * l'objectif de perf vise 100 000 lignes en < 5 min ; ce plafond n'attrape que l'abus.
 */
export const MAX_PARSED_LINES = 2_000_000;

/**
 * Noms de dossiers exclus par défaut, avec le `excludedReason` de la famille
 * VOLONTAIRE qui les qualifie. `node_modules`/`vendor` sont des dépendances tierces
 * (`vendored`) ; `dist`/`build`/`coverage` sont des sorties de build (`generated`) ;
 * `.git` est écarté par politique (`config-exclude`).
 */
export const DEFAULT_EXCLUDED_DIRS: Record<string, ExcludedReason> = {
  node_modules: "vendored",
  vendor: "vendored",
  ".git": "config-exclude",
  dist: "generated",
  build: "generated",
  coverage: "generated",
};

/**
 * Extensions réputées binaires : écartées AVANT lecture de contenu, sans jamais les
 * sérialiser (contrat §3.5.1, `binary`). La détection de contenu (§`isBinaryContent`)
 * complète cette liste pour les binaires sans extension parlante.
 */
const BINARY_EXTENSIONS = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "tiff", "avif", "heic",
  // fontes
  "ttf", "otf", "woff", "woff2", "eot",
  // archives et paquets
  "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "jar", "war",
  // médias
  "mp3", "wav", "flac", "ogg", "mp4", "mov", "avi", "mkv", "webm",
  // exécutables et objets compilés
  "exe", "dll", "so", "dylib", "o", "a", "class", "wasm", "node",
  // documents binaires
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  // divers
  "bin", "dat", "db", "sqlite", "ds_store",
]);

/** Vrai si l'extension (minuscule) désigne un format binaire connu. */
export function isBinaryExtension(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Détecte un contenu non textuel : présence d'un octet NUL, ou décodage UTF-8
 * strict impossible (« mal encodé », FR-025). Un tel fichier est écarté en `binary`
 * plutôt que haché : le sprint 2 ne manipule que du texte UTF-8. La détection porte
 * sur un préfixe borné pour rester bon marché sur les gros fichiers.
 */
export function isBinaryContent(bytes: Uint8Array): boolean {
  const sample = bytes.length > 65_536 ? bytes.subarray(0, 65_536) : bytes;
  for (const b of sample) {
    if (b === 0) return true;
  }
  try {
    // `fatal` lève sur toute séquence UTF-8 invalide : le fichier n'est pas du texte.
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return false;
  } catch {
    return true;
  }
}
