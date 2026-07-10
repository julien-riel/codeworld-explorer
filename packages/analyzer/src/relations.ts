/**
 * Extraction des relations d'IMPORT fichier→fichier (sprint 5, PRD §14.6, §20.3).
 *
 * Profondeur 1, granularité node→node : une arête par (fichier source, fichier cible,
 * type). Seuls les imports RELATIFS résolus vers un fichier du dépôt produisent une
 * relation ; les spécificateurs « bare » (npm, chemins d'alias) sont ignorés — la
 * dépendance externe est hors périmètre, conforme au « lorsque possible » du §14.6.
 *
 * La résolution de module est LEXICALE et faite ici, PAS par ts-morph : elle ne
 * consulte ni tsconfig ni node_modules (surface de confiance §22.2) et ne dépend que
 * de l'ensemble figé des chemins du dépôt — garant du déterminisme FR-026. On reproduit
 * les conventions utiles : extensions omises, correspondance `./x.js` → `./x.ts`
 * (moduleResolution nodenext), et fichiers `index` de dossier.
 */

import { posix } from "node:path";
import { compareEvidence, type Evidence, type Relation, type RelationType } from "@codeworld/world-schema";

/**
 * Spécificateur d'import/re-export tel qu'extrait de l'AST : la chaîne littérale et le
 * type de relation, indépendants du dépôt. C'est la forme mémoïsée par le cache (cache.ts)
 * et l'entrée de `extractFileRelations`, dont la RÉSOLUTION (contre les chemins du dépôt)
 * reste faite à chaque exécution.
 */
export interface ImportSpec {
  readonly specifier: string;
  readonly relationType: RelationType;
}

/** Extensions de code, dans l'ordre d'essai (TS avant JS, comme la résolution TS). */
const CODE_EXTENSIONS = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"] as const;

/** Extension JS → extension TS sœur (import `./x.js` résolu vers `./x.ts`, nodenext). */
const JS_TO_TS_EXTENSION: Record<string, string> = { js: "ts", jsx: "tsx", mjs: "mts", cjs: "cts" };

/** Vrai si le spécificateur est relatif (seul cas résolu vers le dépôt). */
function isRelative(specifier: string): boolean {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}

/** Extension (après le dernier point du DERNIER segment), ou `""` (dotfile compris). */
function segmentExtension(base: string): string {
  const seg = base.slice(base.lastIndexOf("/") + 1);
  const dot = seg.lastIndexOf(".");
  return dot > 0 ? seg.slice(dot + 1) : "";
}

/**
 * Résout un spécificateur relatif depuis `fromPath` vers un chemin de fichier du
 * dépôt présent dans `filePaths`, ou `null` s'il est externe / introuvable. Les
 * candidats sont essayés dans un ordre FIXE : correspondance TS d'un spécificateur
 * JS, chemin exact, extensions ajoutées, puis `index` de dossier.
 */
export function resolveSpecifier(
  fromPath: string,
  specifier: string,
  filePaths: ReadonlySet<string>,
): string | null {
  if (!isRelative(specifier)) return null;

  const dir = posix.dirname(fromPath); // "." pour un fichier à la racine
  let base = posix.join(dir, specifier); // normalise "." et ".." lexicalement
  if (base === ".") base = "";
  // Sortie de la racine du dépôt : non résoluble (jamais de cible hors périmètre).
  if (base === ".." || base.startsWith("../")) return null;
  base = base.normalize("NFC"); // aligne la forme Unicode sur les chemins du dépôt

  const candidates: string[] = [];
  const ext = segmentExtension(base);
  const tsSibling = JS_TO_TS_EXTENSION[ext];
  if (tsSibling !== undefined) candidates.push(base.slice(0, base.length - ext.length) + tsSibling);
  candidates.push(base); // chemin exact (spécificateur déjà suffixé, ou fichier non-code)
  for (const e of CODE_EXTENSIONS) candidates.push(base === "" ? `index.${e}` : `${base}.${e}`);
  for (const e of CODE_EXTENSIONS) candidates.push(base === "" ? `index.${e}` : `${base}/index.${e}`);

  for (const c of candidates) if (filePaths.has(c)) return c;
  return null;
}

/** Une arête agrégée en construction : spécificateurs distincts menant à une même cible. */
interface Edge {
  targetPath: string;
  relationType: RelationType;
  specifiers: Set<string>;
}

/**
 * Extrait les relations d'import du fichier `fromPath` (nœud `sourceNodeId`). Renvoie
 * un tableau NON trié (l'appelant agrège tous les fichiers puis trie, contrat §2.4).
 * `nodeIdByPath` associe un chemin de fichier résolu à l'`id` de son `SourceNode`.
 */
export function extractFileRelations(
  imports: readonly ImportSpec[],
  fromPath: string,
  sourceNodeId: string,
  filePaths: ReadonlySet<string>,
  nodeIdByPath: ReadonlyMap<string, string>,
): Relation[] {
  // Dédup par (cible, type) : deux `import` vers le même fichier fusionnent leurs preuves.
  const edges = new Map<string, Edge>();
  for (const imp of imports) {
    const targetPath = resolveSpecifier(fromPath, imp.specifier, filePaths);
    if (targetPath === null || targetPath === fromPath) continue; // externe ou auto-import
    const key = `${imp.relationType} ${targetPath}`;
    const edge = edges.get(key);
    if (edge === undefined) {
      edges.set(key, { targetPath, relationType: imp.relationType, specifiers: new Set([imp.specifier]) });
    } else {
      edge.specifiers.add(imp.specifier);
    }
  }

  const relations: Relation[] = [];
  for (const edge of edges.values()) {
    const targetId = nodeIdByPath.get(edge.targetPath);
    if (targetId === undefined) continue; // filet : la cible est toujours un nœud fichier connu
    const evidence: Evidence[] = [{ kind: "resolved-path", detail: edge.targetPath }];
    for (const spec of edge.specifiers) evidence.push({ kind: "module-specifier", detail: spec });
    evidence.sort(compareEvidence);
    relations.push({
      sourceRef: { kind: "node", id: sourceNodeId },
      targetRef: { kind: "node", id: targetId },
      relationType: edge.relationType,
      confidence: 1000, // import relatif résolu par l'AST : certitude (§20.3)
      evidence,
    });
  }
  return relations;
}
