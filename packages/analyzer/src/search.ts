/**
 * Construction de l'index de recherche embarqué (contrat §3.8, §3.8.1).
 *
 * Couverture TOTALE : chaque `SourceNode` — racine et nœuds exclus compris — produit
 * exactement un `SearchDoc`. La bijection `SourceNode.id ↔ SearchDoc.ref` est ainsi
 * garantie. `documents` est trié par `ref` (contrat §2.4). On n'embarque JAMAIS le
 * dump d'un moteur (MiniSearch) : le client reconstruit l'index en mémoire (ADR-0001).
 *
 * Sprint 5 : les documents de fichiers portent `symbolNames` (noms des symboles
 * top-level du fichier) pour la recherche par symbole (PRD §17.5). On reste au niveau
 * NODE (un document par `SourceNode`) : la granularité par symbole (`ref = symbolId`),
 * qui romprait la bijection §3.8.1, est reportée au sprint 7.
 */

import type { Category, SearchIndex, SearchDoc, SourceNode } from "@codeworld/world-schema";

/** Version du format d'index (v0 : 0). */
const SEARCH_INDEX_VERSION = 0;

/**
 * Construit l'index. `categoryByDirId` associe l'id d'un dossier CLASSÉ à sa catégorie
 * (contrat §3.6) ; `category` n'est recopié dans le document que pour ces dossiers.
 * `language` n'est recopié que si le nœud le porte (donc jamais dossier ni exclu).
 * `symbolsByNodeId` associe l'id d'un fichier à ses noms de symboles (déjà triés et
 * dédupliqués) ; `symbolNames` n'est posé que sur les fichiers en portant au moins un.
 */
export function buildSearchIndex(
  nodes: readonly SourceNode[],
  categoryByDirId: ReadonlyMap<string, Category>,
  symbolsByNodeId: ReadonlyMap<string, readonly string[]> = new Map(),
): SearchIndex {
  const documents: SearchDoc[] = nodes.map((node) => {
    const doc: SearchDoc = {
      ref: node.id,
      path: node.path,
      name: node.name,
      kind: node.nodeType,
    };
    if (node.language !== undefined) doc.language = node.language;
    if (node.nodeType === "directory") {
      const category = categoryByDirId.get(node.id);
      if (category !== undefined) doc.category = category;
    } else {
      const names = symbolsByNodeId.get(node.id);
      // Champ OMIS (jamais tableau vide) quand le fichier n'a aucun symbole (contrat §2.3).
      if (names !== undefined && names.length > 0) doc.symbolNames = [...names];
    }
    return doc;
  });

  documents.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  return { version: SEARCH_INDEX_VERSION, documents };
}
