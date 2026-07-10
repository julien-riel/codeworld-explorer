/**
 * Regroupement des résultats de recherche PAR TYPE (PRD §9.4 : « regroupements et
 * filtres » pour les grands dépôts). Le « type » est le `NodeType` du document —
 * fichiers puis dossiers — l'axe qui, en phase 1, accueillera aussi les symboles.
 * Logique PURE, sans React ni store.
 */

import type { NodeType } from "@codeworld/world-schema";
import type { SearchHit } from "./searchIndex";

/** Un groupe de résultats homogènes en type, avec son libellé affichable. */
export interface SearchGroup {
  kind: NodeType;
  /** Libellé français pluriel du groupe. */
  label: string;
  hits: SearchHit[];
}

/** Ordre d'affichage des types (les fichiers, cible principale, d'abord). */
const KIND_ORDER: readonly NodeType[] = ["file", "directory"];

/** Libellé pluriel d'un type de nœud. */
const KIND_LABELS: Readonly<Record<NodeType, string>> = {
  file: "Fichiers",
  directory: "Dossiers",
};

/**
 * Regroupe des résultats par type, dans l'ordre fichiers → dossiers, en préservant
 * l'ordre de pertinence à l'intérieur de chaque groupe et en omettant les groupes vides.
 */
export function groupHits(hits: readonly SearchHit[]): SearchGroup[] {
  const byKind = new Map<NodeType, SearchHit[]>();
  for (const hit of hits) {
    const bucket = byKind.get(hit.kind);
    if (bucket === undefined) {
      byKind.set(hit.kind, [hit]);
    } else {
      bucket.push(hit);
    }
  }

  const groups: SearchGroup[] = [];
  for (const kind of KIND_ORDER) {
    const bucket = byKind.get(kind);
    if (bucket !== undefined && bucket.length > 0) {
      groups.push({ kind, label: KIND_LABELS[kind], hits: bucket });
    }
  }
  return groups;
}
