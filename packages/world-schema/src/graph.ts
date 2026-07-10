/**
 * Invariants d'intégrité référentielle des entités sémantiques de phase 1 —
 * `Symbol` et `Relation` (contrat §3.9, §4.3). Zod ne valide que des FORMES ;
 * l'intégrité référentielle (un symbole pointe un `SourceNode` existant, une relation
 * relie deux entités présentes) est portée par ces gardes de pipeline, à l'image de
 * `assertTreeInvariants` (tree.ts) et `assertLayoutInvariants` (layout/invariants.ts).
 *
 * Les comparateurs canoniques (`compareSymbols`, `compareRelations`, `compareEvidence`)
 * sont EXPORTÉS et partagés : le producteur (analyseur) les emploie pour trier avant
 * insertion, et ces gardes les emploient pour vérifier le tri. Une seule source de
 * vérité pour l'ordre §2.4 — jamais deux tris divergents.
 */

import type { Evidence, Relation, RefTarget, SourceNode, Symbol } from "./schema.js";
import { symbolId, DEFAULT_ID_HASH_LENGTH } from "./ids.js";
import { IdCollisionError, RelationInvariantError, SymbolInvariantError } from "./errors.js";

/** Comparaison en ordre de code-unit UTF-16 (comparaison native des chaînes). */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ordre canonique des `Evidence` : (kind, detail) en code-unit UTF-16 (contrat §2.4). */
export function compareEvidence(a: Evidence, b: Evidence): number {
  return cmp(a.kind, b.kind) || cmp(a.detail, b.detail);
}

/** Ordre canonique des `Symbol` : par `id` (clé primaire unique, contrat §2.4). */
export function compareSymbols(a: Symbol, b: Symbol): number {
  return cmp(a.id, b.id);
}

/** Représentation stable d'une référence pour le tri et les messages : `"kind:id"`. */
function refKey(ref: RefTarget): string {
  return `${ref.kind}:${ref.id}`;
}

/**
 * Ordre canonique des `Relation` (contrat §2.4) : (sourceRef, targetRef, relationType).
 * `relationType` départage deux arêtes de mêmes extrémités (ex. `import` vs `re-export`).
 */
export function compareRelations(a: Relation, b: Relation): number {
  return (
    cmp(refKey(a.sourceRef), refKey(b.sourceRef)) ||
    cmp(refKey(a.targetRef), refKey(b.targetRef)) ||
    cmp(a.relationType, b.relationType)
  );
}

/** Vrai si `arr` est trié (non strictement) selon `compare`. */
function isSorted<T>(arr: readonly T[], compare: (a: T, b: T) => number): boolean {
  for (let i = 1; i < arr.length; i += 1) {
    const prev = arr[i - 1];
    const curr = arr[i];
    if (prev !== undefined && curr !== undefined && compare(prev, curr) > 0) return false;
  }
  return true;
}

/**
 * Vérifie les invariants des `Symbol` (contrat §3.9, §4.3) :
 *   1. identité dérivée : `id === symbolId(sourceNodeId, qualifiedName, symbolType)` ;
 *   2. `sourceNodeId` désigne un `SourceNode` de type `file` présent ;
 *   3. intervalle de lignes cohérent : `1 ≤ startLine ≤ endLine` ;
 *   4. unicité globale des `id` (collision ⇒ `IdCollisionError`, levier `idHashLength`) ;
 *   5. tableau trié par `id` (§2.4).
 *
 * @throws SymbolInvariantError / IdCollisionError à la première violation.
 */
export function assertSymbolInvariants(
  symbols: readonly Symbol[],
  nodes: readonly SourceNode[],
  idHashLength: number = DEFAULT_ID_HASH_LENGTH,
): void {
  const fileNodeIds = new Set<string>();
  for (const n of nodes) if (n.nodeType === "file") fileNodeIds.add(n.id);

  const seenIds = new Map<string, string>(); // id → clé composite, pour diagnostiquer la collision
  for (const s of symbols) {
    // 1. Identité dérivée (aucun id forgé hors formule).
    const expected = symbolId(s.sourceNodeId, s.qualifiedName, s.symbolType, idHashLength);
    if (s.id !== expected) {
      throw new SymbolInvariantError(
        "id-derived",
        `identité incohérente pour « ${s.qualifiedName} » (${s.symbolType}) : id=${s.id}, attendu ${expected}.`,
        [s.id, expected],
      );
    }
    // 2. Nœud source résolu et de type fichier.
    if (!fileNodeIds.has(s.sourceNodeId)) {
      throw new SymbolInvariantError(
        "source-node-resolved",
        `sourceNodeId « ${s.sourceNodeId} » absent ou non-fichier pour le symbole « ${s.qualifiedName} ».`,
        [s.id],
      );
    }
    // 3. Intervalle de lignes.
    if (s.startLine < 1 || s.endLine < s.startLine) {
      throw new SymbolInvariantError(
        "line-range",
        `intervalle de lignes invalide pour « ${s.qualifiedName} » : [${String(s.startLine)}, ${String(s.endLine)}].`,
        [s.id],
      );
    }
    // 4. Unicité globale des id. Un id répété est toujours fautif : soit deux clés
    //    composites distinctes ont produit le même hash (collision §4.3, levier
    //    idHashLength), soit le même symbole apparaît deux fois (doublon du producteur).
    const key = `${s.sourceNodeId}|${s.qualifiedName}|${s.symbolType}`;
    const prev = seenIds.get(s.id);
    if (prev !== undefined) {
      if (prev === key) {
        throw new SymbolInvariantError("duplicate", `symbole en double : « ${key} ».`, [s.id]);
      }
      throw new IdCollisionError(s.id, [prev, key], idHashLength);
    }
    seenIds.set(s.id, key);
  }

  // 5. Tri canonique.
  if (!isSorted(symbols, compareSymbols)) {
    throw new SymbolInvariantError("sorted-by-id", "le tableau symbols n'est pas trié par id (§2.4).");
  }
}

/**
 * Vérifie les invariants des `Relation` (contrat §3.9) :
 *   1. `sourceRef` et `targetRef` résolvent chacun vers un `SourceNode` (kind `node`)
 *      ou un `Symbol` (kind `symbol`) présent dans l'artefact ;
 *   2. les `evidence` de chaque relation sont triées (§2.4) ;
 *   3. le tableau `relations` est trié (§2.4).
 *
 * @throws RelationInvariantError à la première violation.
 */
export function assertRelationInvariants(
  relations: readonly Relation[],
  nodes: readonly SourceNode[],
  symbols: readonly Symbol[],
): void {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const symIds = new Set(symbols.map((s) => s.id));

  const resolves = (ref: RefTarget): boolean =>
    ref.kind === "node" ? nodeIds.has(ref.id) : symIds.has(ref.id);

  for (const r of relations) {
    if (!resolves(r.sourceRef)) {
      throw new RelationInvariantError(
        "source-ref-resolved",
        `sourceRef non résolue : ${refKey(r.sourceRef)}.`,
        [refKey(r.sourceRef)],
      );
    }
    if (!resolves(r.targetRef)) {
      throw new RelationInvariantError(
        "target-ref-resolved",
        `targetRef non résolue : ${refKey(r.targetRef)}.`,
        [refKey(r.targetRef)],
      );
    }
    if (!isSorted(r.evidence, compareEvidence)) {
      throw new RelationInvariantError(
        "evidence-sorted",
        `evidence non triée pour la relation ${refKey(r.sourceRef)} → ${refKey(r.targetRef)}.`,
        [refKey(r.sourceRef), refKey(r.targetRef)],
      );
    }
  }

  if (!isSorted(relations, compareRelations)) {
    throw new RelationInvariantError("sorted", "le tableau relations n'est pas trié (§2.4).");
  }
}
