/**
 * Panneau de recherche 2D (PRD §9.4, §14.4, FR-011, FR-012).
 *
 * Arbre DOM pur (séparé de la scène, PRD §11.3) : il interroge l'index MiniSearch en
 * mémoire, regroupe les résultats par type et propose des filtres. Choisir un résultat
 * TÉLÉPORTE en écrivant la cible dans le store (`requestTeleport`) ; l'intégration
 * caméra la consomme. Depuis l'ouverture de la recherche, atteindre l'objet ne coûte
 * que DEUX actions de store (ouvrir, puis choisir) — le panneau NE ferme donc PAS de
 * lui-même au choix (règle anti-friction §9.4).
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { useWorldStore } from "../state/store";
import { useSearchIndex } from "../search/useSearchIndex";
import { useSearchHotkey } from "../search/useSearchHotkey";
import { runSearch, type ClientSearchIndex, type SearchHit } from "../search/searchIndex";
import { groupHits } from "../search/grouping";
import { SearchFilters, type FilterState, emptyFilters, toSearchFilters } from "./SearchFilters";

/** Nombre maximal de résultats rendus (le reste est signalé mais non monté). */
const MAX_RESULTS = 60;

/** Corps du panneau, monté uniquement quand la recherche est ouverte et l'index prêt. */
function SearchPanelBody({ index }: { index: ClientSearchIndex }): ReactElement {
  const requestTeleport = useWorldStore((s) => s.requestTeleport);
  const setSearchOpen = useWorldStore((s) => s.setSearchOpen);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus au montage : la frappe part directement dans le champ.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allHits = useMemo(
    () => runSearch(index, query, toSearchFilters(filters)),
    [index, query, filters],
  );
  const hits = allHits.slice(0, MAX_RESULTS);
  const groups = useMemo(() => groupHits(hits), [hits]);

  // Résultats changés → l'élément actif repart en tête.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, filters]);

  const activeRef = hits[activeIndex]?.ref;

  function teleportTo(hit: SearchHit): void {
    // UNE seule action de store : la cible d'arrivée. Le panneau reste ouvert.
    requestTeleport({ kind: "node", sourceNodeId: hit.ref });
  }

  function close(): void {
    setSearchOpen(false);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[activeIndex];
      if (hit !== undefined) teleportTo(hit);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    // Empêche les touches (WASD/flèches) et raccourcis d'atteindre la scène.
    event.stopPropagation();
  }

  return (
    <section className="cw-panel cw-search" role="dialog" aria-label="Recherche">
      <div className="cw-search-head">
        <span className="cw-search-icon" aria-hidden="true">🔍</span>
        <input
          ref={inputRef}
          type="search"
          className="cw-search-input"
          placeholder="Rechercher un fichier, un chemin, un symbole…"
          aria-label="Rechercher un fichier, un chemin ou un symbole"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          onKeyDown={onInputKeyDown}
        />
        <button type="button" className="cw-btn" onClick={close} aria-label="Fermer la recherche">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <SearchFilters index={index} value={filters} onChange={setFilters} />

      <div className="cw-search-results" role="listbox" aria-label="Résultats">
        {query.trim() === "" && (
          <p className="cw-search-hint cw-muted">
            Tapez pour rechercher parmi {index.size} entrées. Entrée pour vous téléporter.
          </p>
        )}
        {query.trim() !== "" && allHits.length === 0 && (
          <p className="cw-search-hint cw-muted">Aucun résultat.</p>
        )}
        {groups.map((group) => (
          <div key={group.kind} className="cw-search-group">
            <h3 className="cw-search-group-title">
              {group.label} <span className="cw-faint">({group.hits.length})</span>
            </h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {group.hits.map((hit) => (
                <li key={hit.ref}>
                  <ResultRow
                    hit={hit}
                    active={hit.ref === activeRef}
                    onSelect={() => {
                      teleportTo(hit);
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {allHits.length > hits.length && (
          <p className="cw-search-hint cw-faint">
            {allHits.length - hits.length} résultats supplémentaires — affinez la recherche.
          </p>
        )}
      </div>
    </section>
  );
}

/** Une ligne de résultat : nom + prévisualisation du chemin + badges. Téléporte au clic. */
function ResultRow({
  hit,
  active,
  onSelect,
}: {
  hit: SearchHit;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={active ? "cw-search-row cw-search-row-active" : "cw-search-row"}
      onClick={onSelect}
    >
      <span className="cw-search-row-name">{hit.name === "" ? hit.path || "/" : hit.name}</span>
      <span className="cw-search-row-path cw-muted">{hit.path === "" ? "/" : hit.path}</span>
      <span className="cw-search-row-badges">
        {hit.language !== undefined && <span className="cw-badge">{hit.language}</span>}
        {hit.category !== undefined && <span className="cw-badge">{hit.category}</span>}
      </span>
    </button>
  );
}

/**
 * Panneau de recherche : toujours monté en-monde (pour le raccourci), mais visible
 * seulement quand `searchOpen`. Sans monde chargé, ne rend que l'écouteur clavier.
 */
export function SearchPanel(): ReactElement | null {
  useSearchHotkey();
  const open = useWorldStore((s) => s.searchOpen);
  const index = useSearchIndex();

  if (!open || index === null) return null;
  return <SearchPanelBody index={index} />;
}
