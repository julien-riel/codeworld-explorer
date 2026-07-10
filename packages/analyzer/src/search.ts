/**
 * Construction de l'index de recherche embarqué (contrat §3.8, §3.8.1).
 *
 * Couverture TOTALE : chaque `SourceNode` — racine et nœuds exclus compris — produit
 * exactement un `SearchDoc`. La bijection `SourceNode.id ↔ SearchDoc.ref` est ainsi
 * garantie. `documents` est trié par `ref` (contrat §2.4). On n'embarque JAMAIS le
 * dump d'un moteur (MiniSearch) : le client reconstruit l'index en mémoire (ADR-0001).
 */

import type { Category, SearchIndex, SearchDoc, SourceNode } from "@codeworld/world-schema";

/** Version du format d'index (v0 : 0). */
const SEARCH_INDEX_VERSION = 0;

/**
 * Construit l'index. `categoryByDirId` associe l'id d'un dossier CLASSÉ à sa catégorie
 * (contrat §3.6) ; `category` n'est recopié dans le document que pour ces dossiers.
 * `language` n'est recopié que si le nœud le porte (donc jamais dossier ni exclu).
 */
export function buildSearchIndex(
  nodes: readonly SourceNode[],
  categoryByDirId: ReadonlyMap<string, Category>,
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
    }
    return doc;
  });

  documents.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  return { version: SEARCH_INDEX_VERSION, documents };
}
