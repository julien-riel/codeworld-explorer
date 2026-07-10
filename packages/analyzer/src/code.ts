/**
 * Étage d'analyse statique du code (sprint 5). Construit UN projet ts-morph EN MÉMOIRE
 * à partir des contenus déjà inventoriés, en extrait les symboles top-level (symbols.ts)
 * et les relations d'import fichier→fichier (relations.ts), puis agrège et trie selon
 * l'ordre canonique (contrat §2.4).
 *
 * Contraintes :
 *   - Hermétique et DÉTERMINISTE (FR-026) : système de fichiers en mémoire, aucun accès
 *     à node_modules ni à un tsconfig sur disque, aucune résolution de dépendance par
 *     ts-morph (résolution d'import faite lexicalement dans relations.ts).
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
  type RelationType,
  type SourceNode,
  type Symbol,
} from "@codeworld/world-schema";
import { extractFileSymbols } from "./symbols.js";
import { extractFileRelations } from "./relations.js";
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
  readonly warnings: readonly string[];
  readonly stats: { readonly parsedFiles: number; readonly parsedLines: number };
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

/** Compte les lignes d'un texte (nombre de sauts + 1), pour le plafond §27.3. */
function countLines(text: string): number {
  let n = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

/**
 * Analyse les fichiers de code du dépôt. `fileContents` associe `contentHash` → octets
 * (les mêmes que ceux écrits sous `files/`). `idHashLength` est celui de l'artefact.
 *
 * @throws AnalysisLimitError si le total de lignes de code dépasse le plafond §27.3.
 */
export function extractCode(
  nodes: readonly SourceNode[],
  fileContents: ReadonlyMap<string, Uint8Array>,
  idHashLength: number,
): CodeExtraction {
  const parsable = nodes.filter(isParsable);

  const filePaths = new Set<string>();
  const nodeIdByPath = new Map<string, string>();
  for (const node of parsable) {
    filePaths.add(node.path);
    nodeIdByPath.set(node.path, node.id);
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    // JS admis ; aucune résolution de types n'est déclenchée (analyse syntaxique seule).
    compilerOptions: { allowJs: true },
  });

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const warnings: string[] = [];
  const entries: { node: SourceNode; sf: SourceFile }[] = [];
  let parsedLines = 0;

  for (const node of parsable) {
    // `contentHash`/`language` garantis par `isParsable`.
    const bytes = fileContents.get(node.contentHash ?? "");
    if (bytes === undefined) continue;
    let text: string;
    try {
      text = decoder.decode(bytes);
    } catch {
      warnings.push(`Contenu non décodable ignoré pour l'analyse : « ${node.path} ».`);
      continue;
    }

    parsedLines += countLines(text);
    if (parsedLines > MAX_PARSED_LINES) {
      throw new AnalysisLimitError("lignes de code analysées", parsedLines, MAX_PARSED_LINES);
    }

    try {
      // Le chemin virtuel conserve l'extension : le parseur active JSX pour .tsx/.jsx.
      const sf = project.createSourceFile(node.path, text, { overwrite: true });
      entries.push({ node, sf });
    } catch {
      // TS est tolérant aux erreurs de syntaxe : une levée ici est exceptionnelle.
      warnings.push(`Parsing impossible, fichier sans symboles : « ${node.path} ».`);
    }
  }

  const symbols: Symbol[] = [];
  const relations: Relation[] = [];

  for (const { node, sf } of entries) {
    try {
      for (const s of extractFileSymbols(sf, node.id, idHashLength)) symbols.push(s);
    } catch {
      warnings.push(`Extraction des symboles échouée pour « ${node.path} » (fichier conservé).`);
    }
    try {
      const imports: { specifier: string; relationType: RelationType }[] = [];
      for (const imp of sf.getImportDeclarations()) {
        imports.push({ specifier: imp.getModuleSpecifierValue(), relationType: "import" });
      }
      for (const exp of sf.getExportDeclarations()) {
        const specifier = exp.getModuleSpecifierValue();
        if (specifier !== undefined) imports.push({ specifier, relationType: "re-export" });
      }
      for (const r of extractFileRelations(imports, node.path, node.id, filePaths, nodeIdByPath)) {
        relations.push(r);
      }
    } catch {
      warnings.push(`Extraction des imports échouée pour « ${node.path} » (fichier conservé).`);
    }
  }

  // Tri canonique du producteur (contrat §2.4) : la sérialisation ne réordonne pas.
  symbols.sort(compareSymbols);
  relations.sort(compareRelations);

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
    warnings,
    stats: { parsedFiles: entries.length, parsedLines },
  };
}
