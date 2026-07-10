/**
 * Filtres de la recherche (PRD §9.4 : regroupements et filtres au-delà de 200 fichiers).
 * Trois axes cumulables : type de nœud, langage, catégorie. Les valeurs de langage et
 * de catégorie sont dérivées de l'index (celles réellement présentes). DOM pur.
 */

import type { ReactElement } from "react";
import type { Category, NodeType } from "@codeworld/world-schema";
import type { ClientSearchIndex, SearchFilters as Filters } from "../search/searchIndex";

/** État des filtres côté UI : `""` signifie « tous ». */
export interface FilterState {
  kind: NodeType | "";
  language: string;
  category: Category | "";
}

/** Filtres vides (aucune restriction). */
export const emptyFilters: FilterState = { kind: "", language: "", category: "" };

/** Projette l'état UI vers les filtres du moteur (`""` → `null`). */
export function toSearchFilters(state: FilterState): Filters {
  return {
    kind: state.kind === "" ? null : state.kind,
    language: state.language === "" ? null : state.language,
    category: state.category === "" ? null : state.category,
  };
}

/** Libellés des types de nœud pour le sélecteur. */
const KIND_LABELS: Readonly<Record<NodeType, string>> = {
  file: "Fichiers",
  directory: "Dossiers",
};

export function SearchFilters({
  index,
  value,
  onChange,
}: {
  index: ClientSearchIndex;
  value: FilterState;
  onChange: (next: FilterState) => void;
}): ReactElement {
  return (
    <div className="cw-search-filters">
      <label className="cw-search-filter">
        <span className="cw-faint">Type</span>
        <select
          value={value.kind}
          aria-label="Filtrer par type"
          onChange={(e) => {
            onChange({ ...value, kind: e.target.value as NodeType | "" });
          }}
        >
          <option value="">Tous</option>
          {(["file", "directory"] as const).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      {index.languages.length > 0 && (
        <label className="cw-search-filter">
          <span className="cw-faint">Langage</span>
          <select
            value={value.language}
            aria-label="Filtrer par langage"
            onChange={(e) => {
              onChange({ ...value, language: e.target.value });
            }}
          >
            <option value="">Tous</option>
            {index.languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </label>
      )}

      {index.categories.length > 0 && (
        <label className="cw-search-filter">
          <span className="cw-faint">Catégorie</span>
          <select
            value={value.category}
            aria-label="Filtrer par catégorie"
            onChange={(e) => {
              onChange({ ...value, category: e.target.value as Category | "" });
            }}
          >
            <option value="">Toutes</option>
            {index.categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
