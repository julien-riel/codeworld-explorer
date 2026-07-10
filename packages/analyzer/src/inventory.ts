/**
 * Inventaire récursif d'une arborescence LOCALE réelle (PRD §19.3, étapes 1-3).
 *
 * Déterminisme (FR-026) : le parcours est TRIÉ explicitement par nom (code-unit
 * UTF-16) ; l'ordre du système de fichiers n'influence jamais la sortie. Aucune
 * horloge, aucune exécution de code du dépôt (PRD §22.2).
 *
 * Sécurité : les liens symboliques ne sont jamais suivis ; un lien dont la cible
 * SORT de la racine est refusé (`OutgoingSymlinkError`). Un dossier exclu n'est pas
 * inventorié — on ne descend jamais dans son intérieur (contrat §3.5.1).
 *
 * L'accès disque passe par un port `FsPort` injectable : les tests fournissent une
 * implémentation qui mélange l'ordre de `readDir` ou simule une erreur de lecture,
 * sans dépendre du système de fichiers réel.
 */

import { nodeId, normalizePath, sha256Hex, type SourceNode } from "@codeworld/world-schema";
import { join, relative, isAbsolute, sep } from "node:path";
import * as nodeFs from "node:fs/promises";
import type { ResolvedConfig } from "./config.js";
import { detectLanguage, extensionOf } from "./language.js";
import {
  DEFAULT_EXCLUDED_DIRS,
  MAX_ANALYZED_FILES,
  MAX_FILE_SIZE_BYTES,
  MAX_INVENTORY_NODES,
  isBinaryContent,
  isBinaryExtension,
} from "./exclusions.js";
import { AnalysisLimitError, InvalidRootError, OutgoingSymlinkError } from "./errors.js";

/** Type d'une entrée de répertoire, réduit à ce dont l'inventaire a besoin. */
export type FsEntryKind = "file" | "directory" | "symlink" | "other";

/** Une entrée de répertoire : nom de segment et nature. */
export interface FsEntry {
  readonly name: string;
  readonly kind: FsEntryKind;
}

/** Port d'accès au système de fichiers, injectable pour les tests. */
export interface FsPort {
  /** Liste les entrées directes d'un dossier (ordre quelconque : l'appelant trie). */
  readDir(absPath: string): Promise<readonly FsEntry[]>;
  /** Taille en octets d'un fichier régulier. */
  statSize(absPath: string): Promise<number>;
  /** Octets bruts d'un fichier. */
  readFile(absPath: string): Promise<Uint8Array>;
  /** Chemin réel (liens résolus) — sert au refus des liens sortants. */
  realPath(absPath: string): Promise<string>;
}

/** Résultat de l'inventaire : nœuds triés, contenus dé-dupliqués, avertissements. */
export interface InventoryResult {
  readonly nodes: SourceNode[];
  /** `contentHash` → octets bruts, un par hash (dé-duplication, contrat §11). */
  readonly fileContents: ReadonlyMap<string, Uint8Array>;
  readonly warnings: readonly string[];
  readonly stats: { readonly files: number; readonly analyzed: number; readonly directories: number };
}

/** Chemin du parent : `p` privé de son dernier segment ; `""` pour un enfant de la racine. */
function parentPath(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

/** Dernier segment d'un chemin POSIX non vide. */
function lastSegment(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

/** Comparaison de noms en ordre de code-unit UTF-16 (déterminisme FR-026). */
function compareName(a: FsEntry, b: FsEntry): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * Implémentation par défaut du port, adossée à `node:fs/promises`. `readDir` ne
 * suit aucun lien (types lus via `Dirent`), `statSize` suit les fichiers réguliers.
 */
export const nodeFsPort: FsPort = {
  async readDir(absPath) {
    const dirents = await nodeFs.readdir(absPath, { withFileTypes: true });
    return dirents.map((d) => {
      let kind: FsEntryKind;
      if (d.isSymbolicLink()) kind = "symlink";
      else if (d.isDirectory()) kind = "directory";
      else if (d.isFile()) kind = "file";
      else kind = "other";
      return { name: d.name, kind };
    });
  },
  async statSize(absPath) {
    const s = await nodeFs.stat(absPath);
    return s.size;
  },
  async readFile(absPath) {
    return nodeFs.readFile(absPath);
  },
  async realPath(absPath) {
    return nodeFs.realpath(absPath);
  },
};

/**
 * Inventorie l'arborescence enracinée en `rootPath`. Renvoie la liste PLATE des
 * `SourceNode` triée par `path` (contrat §2.4), les contenus des fichiers non exclus
 * adressés par hash, et les avertissements non bloquants.
 *
 * @throws InvalidRootError si la racine n'existe pas ou n'est pas un dossier.
 * @throws OutgoingSymlinkError au premier lien symbolique sortant rencontré.
 * @throws AnalysisLimitError si une limite de PRD §27.3 est franchie.
 */
export async function inventory(
  rootPath: string,
  config: ResolvedConfig,
  fs: FsPort = nodeFsPort,
): Promise<InventoryResult> {
  const idLen = config.idHashLength;

  let canonicalRoot: string;
  try {
    canonicalRoot = await fs.realPath(rootPath);
  } catch {
    throw new InvalidRootError(`Chemin introuvable ou illisible : « ${rootPath} ».`);
  }

  const nodes: SourceNode[] = [];
  const fileContents = new Map<string, Uint8Array>();
  const warnings: string[] = [];
  let files = 0;
  let analyzed = 0;
  let directories = 0;
  let totalNodes = 0;

  /**
   * Compte un nœud inventorié (racine, dossier OU fichier) et applique le plafond
   * §22.2/§27.3 : c'est le nombre TOTAL de nœuds — pas seulement les fichiers — qui
   * borne le travail CPU/mémoire et prévient le déni de service par arborescence géante.
   * Un dépôt de milliers de dossiers vides est ainsi refusé au lieu d'être matérialisé.
   */
  function countNode(): void {
    totalNodes += 1;
    if (totalNodes > MAX_INVENTORY_NODES) {
      throw new AnalysisLimitError("nœuds inventoriés", totalNodes, MAX_INVENTORY_NODES);
    }
  }

  /** Vrai si un nom de segment ou un chemin relatif est exclu par la config (couche 1). */
  function isConfigExcluded(name: string, relNorm: string): boolean {
    return config.extraExcludes.includes(name) || config.extraExcludes.includes(relNorm);
  }

  /** Construit un `SourceNode` de dossier ; `childCount`/`excludedReason` posés ensuite. */
  function makeDir(pathNorm: string, depth: number): SourceNode {
    const node: SourceNode = {
      id: nodeId(pathNorm, idLen),
      parentId: pathNorm === "" ? null : nodeId(parentPath(pathNorm), idLen),
      path: pathNorm,
      name: pathNorm === "" ? config.repository.name : lastSegment(pathNorm),
      nodeType: "directory",
      depth,
    };
    return node;
  }

  /** Traite un fichier : exclusions volontaires, échecs, ou contenu haché. */
  async function handleFile(childAbs: string, relNorm: string, depth: number): Promise<SourceNode> {
    files += 1;
    countNode();
    const name = lastSegment(relNorm);
    const node: SourceNode = {
      id: nodeId(relNorm, idLen),
      parentId: nodeId(parentPath(relNorm), idLen),
      path: relNorm,
      name,
      nodeType: "file",
      depth,
    };

    const ext = extensionOf(name);

    // ── Exclusions volontaires, dans l'ordre : config, binaire, taille ──
    if (isConfigExcluded(name, relNorm)) {
      node.excludedReason = "config-exclude";
      return node;
    }
    if (isBinaryExtension(ext)) {
      node.excludedReason = "binary";
      return node;
    }
    let size: number;
    try {
      size = await fs.statSize(childAbs);
    } catch {
      node.excludedReason = "read-error";
      warnings.push(`Taille illisible : « ${relNorm} » (marqué read-error).`);
      return node;
    }
    if (size > MAX_FILE_SIZE_BYTES) {
      node.excludedReason = "too-large";
      return node;
    }

    // ── Lecture du contenu ; échec I/O → read-error (FR-024/FR-025) ──
    let bytes: Uint8Array;
    try {
      bytes = await fs.readFile(childAbs);
    } catch {
      node.excludedReason = "read-error";
      warnings.push(`Lecture impossible : « ${relNorm} » (marqué read-error).`);
      return node;
    }
    // Contenu non textuel (octet NUL ou UTF-8 invalide) → binaire, jamais haché.
    if (isBinaryContent(bytes)) {
      node.excludedReason = "binary";
      return node;
    }

    // ── Fichier texte analysable ──
    analyzed += 1;
    if (analyzed > MAX_ANALYZED_FILES) {
      throw new AnalysisLimitError("fichiers analysés", analyzed, MAX_ANALYZED_FILES);
    }
    const contentHash = sha256Hex(bytes);
    node.sizeBytes = size;
    node.contentHash = contentHash;
    const language = detectLanguage(name);
    if (language !== undefined) node.language = language;
    if (!fileContents.has(contentHash)) fileContents.set(contentHash, bytes);
    return node;
  }

  /**
   * Parcourt un dossier réel `absPath` (chemin relatif normalisé `relNorm`, profondeur
   * `depth`) et renvoie le nombre d'enfants directs INVENTORIÉS (inclus + exclus),
   * valeur de `childCount` du dossier (contrat §3.5.1).
   */
  async function walkDir(absPath: string, relNorm: string, depth: number): Promise<number> {
    let entries: readonly FsEntry[];
    try {
      entries = await fs.readDir(absPath);
    } catch {
      // Dossier illisible : signalé par l'appelant qui pose read-error ; ici on relaie 0.
      throw new DirReadError();
    }
    const sorted = [...entries].sort(compareName);
    let childCount = 0;
    // Chemins NFC déjà produits dans CE dossier : garde-fou contre deux frères dont les
    // noms se réduisent au même chemin après normalisation Unicode (voir plus bas).
    const seenChildPaths = new Set<string>();

    for (const entry of sorted) {
      // Un segment de nom réel ne doit JAMAIS introduire de séparateur de chemin. Or
      // `normalizePath` convertit « \ » en « / » (contrat §4.1) : appliqué à un nom de
      // fichier légal contenant « \ » (macOS/Linux), il éclaterait le segment en faux
      // composants de chemin et désynchroniserait le nœud de sa place dans l'arbre. On
      // écarte l'entrée avec un avertissement ; l'artefact reste produit (FR-024).
      if (entry.name.includes("/") || entry.name.includes("\\")) {
        const where = relNorm === "" ? "(racine)" : relNorm;
        warnings.push(`Nom d'entrée avec séparateur de chemin ignoré : « ${entry.name} » sous « ${where} ».`);
        continue;
      }

      const childAbs = join(absPath, entry.name);
      const childRel = relNorm === "" ? entry.name : `${relNorm}/${entry.name}`;
      const childNorm = normalizePath(childRel);

      if (entry.kind === "symlink") {
        // Jamais suivi : cible hors racine → refus ; sinon (interne/cassé) → ignoré.
        await handleSymlink(childAbs, childNorm);
        continue;
      }
      if (entry.kind === "other") {
        warnings.push(`Entrée non régulière ignorée : « ${childNorm} ».`);
        continue;
      }

      // Deux frères dont les noms se réduisent au MÊME chemin NFC (« café » NFC et
      // « café » NFD sur un checkout Linux/ext4 ; impossible sur un FS insensible comme
      // APFS/HFS+) produiraient deux nœuds de path/id identiques (violation contrat
      // §2.4/§4.3), qui dégénérerait en invariant d'arbre/layout. On garde le premier
      // (ordre de tri canonique) et on écarte le suivant avec un avertissement (FR-024).
      if (seenChildPaths.has(childNorm)) {
        warnings.push(`Doublon de chemin après normalisation Unicode ignoré : « ${childNorm} ».`);
        continue;
      }
      seenChildPaths.add(childNorm);

      if (entry.kind === "directory") {
        childCount += 1;
        directories += 1;
        countNode();
        const defaultReason = DEFAULT_EXCLUDED_DIRS[entry.name];
        const dirNode = makeDir(childNorm, depth + 1);
        if (defaultReason !== undefined) {
          dirNode.excludedReason = defaultReason;
          nodes.push(dirNode); // dossier exclu : NON inventorié à l'intérieur (§3.5.1)
          continue;
        }
        if (isConfigExcluded(entry.name, childNorm)) {
          dirNode.excludedReason = "config-exclude";
          nodes.push(dirNode);
          continue;
        }
        nodes.push(dirNode);
        try {
          dirNode.childCount = await walkDir(childAbs, childNorm, depth + 1);
        } catch (error) {
          if (error instanceof DirReadError) {
            // Dossier illisible : bascule en échec, aucun enfant inventorié (FR-024).
            // `readDir` échoue avant tout enfant, donc `childCount` n'a jamais été posé.
            dirNode.excludedReason = "read-error";
            warnings.push(`Dossier illisible : « ${childNorm} » (marqué read-error).`);
          } else {
            throw error;
          }
        }
        continue;
      }

      // Fichier régulier.
      childCount += 1;
      nodes.push(await handleFile(childAbs, childNorm, depth + 1));
    }

    return childCount;
  }

  /** Refuse un lien sortant ; ignore (avec avertissement) un lien interne ou cassé. */
  async function handleSymlink(childAbs: string, childNorm: string): Promise<void> {
    let real: string;
    try {
      real = await fs.realPath(childAbs);
    } catch {
      warnings.push(`Lien symbolique cassé ignoré : « ${childNorm} ».`);
      return;
    }
    const rel = relative(canonicalRoot, real);
    const outgoing = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
    if (outgoing) throw new OutgoingSymlinkError(childNorm, real);
    warnings.push(`Lien symbolique interne ignoré (non suivi) : « ${childNorm} ».`);
  }

  // ── Racine ──
  const root = makeDir("", 0);
  nodes.push(root);
  countNode();
  try {
    root.childCount = await walkDir(canonicalRoot, "", 0);
  } catch (error) {
    if (error instanceof DirReadError) {
      throw new InvalidRootError(`La racine n'est pas un dossier lisible : « ${rootPath} ».`);
    }
    throw error;
  }

  // Tri canonique par path (invariant d'arbre 7, contrat §2.4).
  nodes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { nodes, fileContents, warnings, stats: { files, analyzed, directories } };
}

/** Sentinelle interne : un `readDir` a échoué ; convertie en read-error par l'appelant. */
class DirReadError extends Error {}
