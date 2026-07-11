/**
 * Étage d'analyse statique du code (sprint 5). Pour chaque fichier de code non exclu,
 * on obtient ses FAITS BRUTS (symboles top-level sans `id`, spécificateurs d'import) —
 * soit depuis le CACHE par hash de contenu (cache.ts), soit en parsant avec ts-morph —
 * puis on ASSEMBLE les entités d'artefact : `id` déterministe des symboles (dépend du
 * chemin) et résolution lexicale des relations (dépend des chemins du dépôt). On agrège
 * et on trie selon l'ordre canonique (contrat §2.4).
 *
 * Contraintes :
 *   - Hermétique et DÉTERMINISTE (FR-026) : projet ts-morph EN MÉMOIRE, aucun accès à
 *     node_modules ni à un tsconfig, aucune résolution de dépendance par ts-morph. Le
 *     cache mémoïse une fonction pure : cache chaud ⇒ artefact identique à cache froid.
 *   - Robuste (FR-024) : l'échec de parsing d'un fichier n'avorte pas l'analyse ; il est
 *     signalé par un avertissement et le fichier ne contribue simplement aucun symbole.
 *   - Le fichier reste PRÉSENT dans l'artefact (nœud inchangé) : on n'exclut jamais a
 *     posteriori un fichier lisible, ce qui préserve l'arbre et le layout déjà calculés.
 */

import { Project, type SourceFile } from "ts-morph";
import {
  compareRelations,
  compareSymbols,
  type Relation,
  type SourceNode,
  type Symbol,
} from "@codeworld/world-schema";
import { assembleSymbol, extractRawSymbols } from "./symbols.js";
import { extractFileRelations, type ImportSpec } from "./relations.js";
import { ParseCache, type FileFacts, type ParseCacheStats } from "./cache.js";
import { extensionOf } from "./language.js";
import { AnalysisLimitError } from "./errors.js";
import { MAX_PARSED_LINES } from "./exclusions.js";

/** Langages dont l'analyse statique de symboles est prise en charge au sprint 5 (PRD §27.1). */
const PARSED_LANGUAGES: ReadonlySet<string> = new Set(["TypeScript", "TSX", "JavaScript", "JSX"]);

/** Résultat de l'étage : entités triées + index nom-de-symbole par nœud (pour la recherche). */
export interface CodeExtraction {
  readonly symbols: Symbol[];
  readonly relations: Relation[];
  /** `sourceNodeId` → noms de symboles TRIÉS et dédupliqués (contrat §3.8, `symbolNames`). */
  readonly symbolsByNodeId: ReadonlyMap<string, string[]>;
  /**
   * `sourceNodeId` (fichier) → spécificateurs d'import/re-export BRUTS, dans l'ordre AST.
   * Inclut les modules « bare » (npm, frameworks) que la résolution de relations écarte :
   * c'est la matière première des signaux de framework de la couche 3 (classify-static.ts).
   * Non sérialisé (interne au pipeline) ; les fichiers sans import en sont absents.
   */
  readonly importsByNodeId: ReadonlyMap<string, readonly string[]>;
  readonly warnings: readonly string[];
  readonly stats: {
    readonly parsedFiles: number;
    readonly parsedLines: number;
    readonly cache: ParseCacheStats;
  };
}

/** Vrai si le nœud est un fichier de code analysable, lisible et non exclu. */
function isParsable(node: SourceNode): boolean {
  return (
    node.nodeType === "file" &&
    node.excludedReason === undefined &&
    node.contentHash !== undefined &&
    node.language !== undefined &&
    PARSED_LANGUAGES.has(node.language)
  );
}

/** Compte les lignes d'octets UTF-8 (nombre de LF + 1) pour le plafond §27.3, sans décoder. */
function countLineBytes(bytes: Uint8Array): number {
  let n = 1;
  for (let i = 0; i < bytes.length; i += 1) if (bytes[i] === 10) n += 1;
  return n;
}

/** Spécificateurs d'import ET de re-export (`export … from`) d'un fichier, dans l'ordre AST. */
function extractImportSpecs(sf: SourceFile): ImportSpec[] {
  const specs: ImportSpec[] = [];
  for (const imp of sf.getImportDeclarations()) {
    specs.push({ specifier: imp.getModuleSpecifierValue(), relationType: "import" });
  }
  for (const exp of sf.getExportDeclarations()) {
    const specifier = exp.getModuleSpecifierValue();
    if (specifier !== undefined) specs.push({ specifier, relationType: "re-export" });
  }
  return specs;
}

/**
 * Analyse les fichiers de code du dépôt. `fileContents` associe `contentHash` → octets.
 * `idHashLength` est celui de l'artefact. `parseCache` mémoïse les faits bruts par hash
 * de contenu (désactivé par défaut : comportement inchangé, pur au sens FR-026).
 *
 * @throws AnalysisLimitError si le total de lignes de code dépasse le plafond §27.3.
 */
export async function extractCode(
  nodes: readonly SourceNode[],
  fileContents: ReadonlyMap<string, Uint8Array>,
  idHashLength: number,
  parseCache: ParseCache = new ParseCache(),
): Promise<CodeExtraction> {
  const parsable = nodes.filter(isParsable);

  const filePaths = new Set<string>();
  const nodeIdByPath = new Map<string, string>();
  for (const node of parsable) {
    filePaths.add(node.path);
    nodeIdByPath.set(node.path, node.id);
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const warnings: string[] = [];
  // Projet ts-morph créé PARESSEUSEMENT : une exécution entièrement servie par le cache
  // n'initialise jamais le compilateur. Réutilisé entre défauts de cache d'une même analyse.
  let project: Project | undefined;

  const factsByNode: { node: SourceNode; facts: FileFacts }[] = [];
  let parsedLines = 0;

  for (const node of parsable) {
    const contentHash = node.contentHash ?? "";
    const bytes = fileContents.get(contentHash);
    if (bytes === undefined) continue;

    // Plafond §27.3 : compté sur les octets, INDÉPENDAMMENT du cache (le refus doit être
    // identique cache chaud ou froid, sinon le comportement ne serait pas déterministe).
    parsedLines += countLineBytes(bytes);
    if (parsedLines > MAX_PARSED_LINES) {
      throw new AnalysisLimitError("lignes de code analysées", parsedLines, MAX_PARSED_LINES);
    }

    // L'extension pilote le mode du parseur (JSX pour .tsx/.jsx) : elle fait partie de la clé.
    const ext = extensionOf(node.name);

    const cached = await parseCache.get(contentHash, ext);
    if (cached !== undefined) {
      factsByNode.push({ node, facts: cached });
      continue;
    }

    let text: string;
    try {
      text = decoder.decode(bytes);
    } catch {
      warnings.push(`Contenu non décodable ignoré pour l'analyse : « ${node.path} ».`);
      continue;
    }

    project ??= new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      // JS admis ; aucune résolution de types n'est déclenchée (analyse syntaxique seule).
      compilerOptions: { allowJs: true },
    });

    let sf: SourceFile;
    try {
      // Le chemin virtuel conserve l'extension : le parseur active JSX pour .tsx/.jsx.
      sf = project.createSourceFile(node.path, text, { overwrite: true });
    } catch {
      // TS est tolérant aux erreurs de syntaxe : une levée ici est exceptionnelle.
      warnings.push(`Parsing impossible, fichier sans symboles : « ${node.path} ».`);
      continue;
    }

    // Extraction des deux familles de faits, chacune isolée : l'échec de l'une n'empêche
    // pas l'autre (FR-024).
    let extractionOk = true;
    let symbols: FileFacts["symbols"] = [];
    try {
      symbols = extractRawSymbols(sf);
    } catch {
      warnings.push(`Extraction des symboles échouée pour « ${node.path} » (fichier conservé).`);
      extractionOk = false;
    }
    let imports: FileFacts["imports"] = [];
    try {
      imports = extractImportSpecs(sf);
    } catch {
      warnings.push(`Extraction des imports échouée pour « ${node.path} » (fichier conservé).`);
      extractionOk = false;
    }

    const facts: FileFacts = { symbols, imports };
    // On ne met en cache QUE les extractions complètes : mémoïser un résultat partiel ferait
    // qu'une exécution ultérieure (cache chaud) le servirait SANS ré-émettre l'avertissement,
    // rendant le diagnostic incohérent chaud/froid. Un échec d'extraction est exceptionnel et
    // sera re-tenté à chaque exécution (sans effet sur les octets de l'artefact, faits vides).
    if (extractionOk) await parseCache.set(contentHash, ext, facts);
    factsByNode.push({ node, facts });
  }

  // Assemblage des entités d'artefact depuis les faits (dérivation d'`id`, résolution des
  // relations). Étape recalculée à chaque exécution : elle dépend de l'état GLOBAL du dépôt.
  const symbols: Symbol[] = [];
  const relations: Relation[] = [];
  for (const { node, facts } of factsByNode) {
    for (const raw of facts.symbols) symbols.push(assembleSymbol(raw, node.id, idHashLength));
    for (const r of extractFileRelations(facts.imports, node.path, node.id, filePaths, nodeIdByPath)) {
      relations.push(r);
    }
  }

  // Tri canonique du producteur (contrat §2.4) : la sérialisation ne réordonne pas.
  symbols.sort(compareSymbols);
  relations.sort(compareRelations);

  // Index des spécificateurs d'import bruts par fichier (pour la couche 3). Construit
  // depuis les faits (cache-transparent), dans l'ordre AST ; les fichiers sans import
  // sont omis pour garder l'index creux. Non trié : consommé par agrégation, pas sérialisé.
  const importsByNodeId = new Map<string, readonly string[]>();
  for (const { node, facts } of factsByNode) {
    if (facts.imports.length === 0) continue;
    importsByNodeId.set(
      node.id,
      facts.imports.map((i) => i.specifier),
    );
  }

  // Index nom-de-symbole par nœud, trié et dédupliqué (pour SearchDoc.symbolNames).
  const symbolsByNodeId = new Map<string, string[]>();
  for (const s of symbols) {
    const arr = symbolsByNodeId.get(s.sourceNodeId);
    if (arr === undefined) symbolsByNodeId.set(s.sourceNodeId, [s.name]);
    else arr.push(s.name);
  }
  for (const [nodeId, names] of symbolsByNodeId) {
    const unique = [...new Set(names)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    symbolsByNodeId.set(nodeId, unique);
  }

  return {
    symbols,
    relations,
    symbolsByNodeId,
    importsByNodeId,
    warnings,
    stats: { parsedFiles: factsByNode.length, parsedLines, cache: parseCache.stats },
  };
}
