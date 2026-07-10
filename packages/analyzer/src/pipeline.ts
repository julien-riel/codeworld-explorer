/**
 * Pipeline du générateur embryonnaire (sprint 2, sous-ensemble de PRD §19.3).
 *
 *   1. validation du chemin, refus des liens sortants, normalisation (inventory.ts) ;
 *   2. inventaire récursif trié + exclusions (inventory.ts) ;
 *   3. détection de langage par extension (language.ts) ;
 *   4. classification déterministe couches 1-2 (classify.ts) ;
 *   5. layout via `computeLayout` du contrat ;
 *   6. index de recherche (search.ts) ;
 *   7. GARDES `assertTreeInvariants` puis `assertLayoutInvariants` — un artefact qui
 *      viole un invariant n'est JAMAIS renvoyé ni écrit ;
 *   8. validation Zod (`parseWorld`).
 *
 * Fonction ASYNCHRONE et PURE au sens FR-026 : même arborescence ⇒ même `World`
 * (aucune horloge, aucun ordre de système de fichiers, aucune exécution du dépôt).
 * L'écriture sur disque est séparée (write.ts) : ici on ne fait que produire.
 */

import {
  DEFAULT_LAYOUT_OPTIONS,
  LAYOUT_VERSION,
  SCHEMA_VERSION,
  assertLayoutInvariants,
  assertRelationInvariants,
  assertSymbolInvariants,
  assertTreeInvariants,
  computeLayout,
  parseWorld,
  type Category,
  type Classification,
  type LayoutDir,
  type LayoutFile,
  type LayoutTree,
  type SourceNode,
  type World,
} from "@codeworld/world-schema";
import { basename } from "node:path";
import { ANALYZER_VERSION } from "./version.js";
import { resolveConfig, type FileConfig } from "./config.js";
import { inventory, nodeFsPort, type FsPort } from "./inventory.js";
import { classifyDirectory } from "./classify.js";
import { extractCode } from "./code.js";
import { buildSearchIndex } from "./search.js";
import { ParseCache, type CachePort, type ParseCacheStats } from "./cache.js";
import { NOOP_REPORTER, type ProgressReporter } from "./progress.js";
import { IdCollisionError, InvalidRootError } from "./errors.js";

/** Statistiques d'exécution, pour le journal du CLI (hors artefact, FR-026). */
export interface AnalyzeStats {
  readonly nodes: number;
  readonly files: number;
  readonly analyzed: number;
  readonly directories: number;
  readonly rooms: number;
  readonly classifications: number;
  readonly symbols: number;
  readonly relations: number;
  readonly parsedFiles: number;
  readonly cache: ParseCacheStats;
}

/** Produit du pipeline : l'artefact validé, les contenus, les avertissements, les stats. */
export interface AnalyzeResult {
  readonly world: World;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly warnings: readonly string[];
  readonly stats: AnalyzeStats;
}

/** Options d'analyse : configuration, port fs injectable (tests), cache et journal. */
export interface AnalyzeOptions {
  readonly config?: FileConfig;
  readonly fs?: FsPort;
  /** Cache par hash de contenu pour l'analyse statique incrémentale ; absent ⇒ désactivé. */
  readonly cache?: CachePort;
  /** Journal de progression par étape ; absent ⇒ muet (pipeline pur et silencieux). */
  readonly progress?: ProgressReporter;
}

/** Assemble un `LayoutTree` à partir des nœuds NON exclus (contrat §3.5.2). */
function buildLayoutTree(nodes: readonly SourceNode[]): LayoutTree {
  const included = nodes.filter((n) => n.excludedReason === undefined);
  const byId = new Map<string, SourceNode>();
  for (const n of included) byId.set(n.id, n);

  const childDirs = new Map<string, SourceNode[]>();
  const childFiles = new Map<string, SourceNode[]>();
  let root: SourceNode | undefined;
  for (const n of included) {
    if (n.parentId === null) {
      root = n;
      continue;
    }
    // Le parent d'un nœud non exclu est toujours non exclu (on n'inventorie pas
    // l'intérieur d'un dossier exclu) ; la présence dans `byId` est donc garantie.
    if (!byId.has(n.parentId)) continue;
    const bucket = n.nodeType === "directory" ? childDirs : childFiles;
    const list = bucket.get(n.parentId);
    if (list === undefined) bucket.set(n.parentId, [n]);
    else list.push(n);
  }
  if (root === undefined) throw new InvalidRootError("Arbre sans racine après inventaire.");

  const buildDir = (node: SourceNode): LayoutDir => {
    const dirs = (childDirs.get(node.id) ?? []).map(buildDir);
    const files: LayoutFile[] = (childFiles.get(node.id) ?? []).map((f) => ({
      id: f.id,
      path: f.path,
      name: f.name,
    }));
    return {
      id: node.id,
      path: node.path,
      depth: node.depth,
      isRoot: node.path === "",
      childDirs: dirs,
      files,
    };
  };

  return { root: buildDir(root) };
}

/** Vérifie l'unicité globale des `id` (contrat §4.3) ; lève `IdCollisionError` sinon. */
function assertNoIdCollision(nodes: readonly SourceNode[]): void {
  const byId = new Map<string, string>();
  for (const n of nodes) {
    const prev = byId.get(n.id);
    if (prev !== undefined && prev !== n.path) throw new IdCollisionError([prev, n.path]);
    byId.set(n.id, n.path);
  }
}

/**
 * Exécute le pipeline complet et renvoie un `World` valide (déjà passé par
 * `parseWorld`) accompagné des contenus de fichiers. Ne touche pas au disque.
 */
export async function analyze(rootPath: string, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const fs = options.fs ?? nodeFsPort;
  const progress = options.progress ?? NOOP_REPORTER;
  const parseCache = new ParseCache(options.cache);

  // Nom de dépôt par défaut = nom de base du chemin réel de la racine (normalisé plus bas).
  let canonicalRoot: string;
  try {
    canonicalRoot = await fs.realPath(rootPath);
  } catch {
    throw new InvalidRootError(`Chemin introuvable ou illisible : « ${rootPath} ».`);
  }
  // Nom NORMALISÉ en NFC, comme tout chemin/nom passant par `normalizePath` (contrat
  // §4.1) : sans cela, la forme Unicode du dossier racine renvoyée par le système de
  // fichiers (HFS+ NFD vs Linux/APFS NFC) fuirait dans `repository.name`, `repository.url`
  // et le nom de la racine, cassant la reproductibilité octet FR-026/FR-023 hors poste.
  const repoName = (basename(canonicalRoot) || "repository").normalize("NFC");
  const config = resolveConfig(options.config, repoName);

  // 1-3. Inventaire trié, exclusions, langage.
  progress.start("inventory");
  const { nodes, fileContents, warnings, stats } = await inventory(canonicalRoot, config, fs);
  assertNoIdCollision(nodes);
  progress.done("inventory", `${String(nodes.length)} nœuds, ${String(stats.analyzed)} analysés`);

  // 4. Classification des dossiers NON exclus (contrat §3.6).
  progress.start("classify");
  const classifications: Classification[] = [];
  const categoryByDirId = new Map<string, Category>();
  for (const node of nodes) {
    if (node.nodeType !== "directory" || node.excludedReason !== undefined) continue;
    const classification = classifyDirectory(node, config);
    classifications.push(classification);
    categoryByDirId.set(node.id, classification.category);
  }
  classifications.sort((a, b) =>
    a.sourceNodeId < b.sourceNodeId ? -1 : a.sourceNodeId > b.sourceNodeId ? 1 : 0,
  );
  progress.done("classify", `${String(classifications.length)} dossiers`);

  // 5. Layout (fonction pure du contrat ; `computeLayout` asserte déjà ses invariants).
  progress.start("layout");
  const tree = buildLayoutTree(nodes);
  const layout = computeLayout(tree, categoryByDirId, config.layoutSeed, DEFAULT_LAYOUT_OPTIONS);
  progress.done("layout", `${String(layout.spatialNodes.length)} salles`);

  // 6. Analyse statique du code (symboles + relations d'import, sprint 5). Étape PURE :
  //    projet ts-morph en mémoire depuis `fileContents`, aucune résolution externe. Le
  //    cache (si branché) mémoïse les faits bruts par hash de contenu.
  progress.start("analyze-code");
  const code = await extractCode(nodes, fileContents, config.idHashLength, parseCache);
  progress.done(
    "analyze-code",
    `${String(code.symbols.length)} symboles, ${String(code.relations.length)} relations` +
      (parseCache.enabled ? `, cache ${String(code.stats.cache.hits)}✓/${String(code.stats.cache.misses)}✗` : ""),
  );

  // 7. Index de recherche (couverture totale, bijection), enrichi des noms de symboles.
  progress.start("search");
  const search = buildSearchIndex(nodes, categoryByDirId, code.symbolsByNodeId);
  progress.done("search", `${String(search.documents.length)} documents`);

  // Assemblage de l'artefact. `symbols`/`relations` sont TOUJOURS présents en v1
  // (vides si le dépôt n'a aucun code analysable), comme les collections v0 (§2.3).
  const world: World = {
    manifest: {
      schemaVersion: SCHEMA_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      layoutVersion: LAYOUT_VERSION,
      configurationHash: config.configurationHash,
    },
    repository: {
      provider: "github",
      owner: config.repository.owner,
      name: config.repository.name,
      url: config.repository.url,
      defaultBranch: config.repository.defaultBranch,
      license: config.repository.license,
    },
    snapshot: {
      commitSha: config.snapshot.commitSha,
      branch: config.snapshot.branch,
      committedAt: config.snapshot.committedAt,
    },
    nodes,
    classifications,
    layout,
    search,
    symbols: code.symbols,
    relations: code.relations,
  };

  // 8. GARDES avant tout retour/écriture : un artefact non conforme n'existe pas.
  progress.start("guards");
  assertTreeInvariants(nodes, config.idHashLength);
  assertLayoutInvariants(layout, tree, DEFAULT_LAYOUT_OPTIONS);
  assertSymbolInvariants(code.symbols, nodes, config.idHashLength);
  assertRelationInvariants(code.relations, nodes, code.symbols);
  progress.done("guards");

  // 9. Validation Zod (forme du contrat §3, garde conditionnelle des entités §3.9).
  progress.start("validate");
  const validated = parseWorld(world);
  progress.done("validate");

  return {
    world: validated,
    files: fileContents,
    warnings: [...warnings, ...code.warnings],
    stats: {
      nodes: nodes.length,
      files: stats.files,
      analyzed: stats.analyzed,
      directories: stats.directories,
      rooms: layout.spatialNodes.length,
      classifications: classifications.length,
      symbols: code.symbols.length,
      relations: code.relations.length,
      parsedFiles: code.stats.parsedFiles,
      cache: code.stats.cache,
    },
  };
}
