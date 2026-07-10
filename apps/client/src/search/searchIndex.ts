/**
 * Index de recherche CLIENT en mémoire (PRD §9.4, §14.4, FR-011).
 *
 * On indexe l'index de recherche EMBARQUÉ dans l'artefact (`world.search.documents`)
 * avec MiniSearch, une fois par monde. La recherche porte sur le chemin, le nom de
 * fichier et — dès qu'ils existeront (phase 1) — les symboles (`symbolNames`). Elle
 * tolère les fautes simples (recherche floue) et le début de mot (préfixe), puis
 * filtre par catégorie / langage / type. Logique PURE, testable sans DOM : elle ne
 * dépend ni de React ni du store.
 */

import MiniSearch, { type Options } from "minisearch";
import type {
  Category,
  NodeType,
  SearchDoc,
  SearchIndex,
} from "@codeworld/world-schema";

/** Un résultat de recherche : le document source enrichi de son score et des termes matchés. */
export interface SearchHit {
  /** `sourceNodeId` de la cible (sert à la téléportation `{ kind: "node" }`). */
  ref: string;
  path: string;
  name: string;
  kind: NodeType;
  language: string | undefined;
  category: Category | undefined;
  /** Score MiniSearch (pertinence décroissante). */
  score: number;
  /** Termes du document qui ont matché, pour la prévisualisation/surlignage. */
  terms: string[];
}

/** Filtres cumulables sur les résultats (PRD §9.4 : regroupements et filtres au-delà de 200 fichiers). */
export interface SearchFilters {
  /** Restreint au type de nœud (`file`/`directory`). */
  kind?: NodeType | null;
  /** Restreint au langage (`SearchDoc.language`). */
  language?: string | null;
  /** Restreint à la catégorie architecturale (`SearchDoc.category`). */
  category?: Category | null;
}

/** Index construit une fois par monde + valeurs disponibles pour peupler les filtres. */
export interface ClientSearchIndex {
  /** Moteur MiniSearch peuplé. */
  mini: MiniSearch<SearchDoc>;
  /** Document source par `ref`, pour reconstruire un `SearchHit` typé sans lire de champ `any`. */
  docsByRef: ReadonlyMap<string, SearchDoc>;
  /** Langages présents, triés, pour l'UI de filtre. */
  languages: string[];
  /** Catégories présentes, triées, pour l'UI de filtre. */
  categories: Category[];
  /** Nombre de documents indexés. */
  size: number;
}

/** Champs indexés (tokenisés) : nom, chemin, et noms de symboles (phase 1). */
const SEARCH_FIELDS = ["name", "path", "symbolNames"] as const;

/**
 * Extrait un champ pour la tokenisation. Les tableaux (`symbolNames`) sont aplatis
 * par espaces ; les champs absents deviennent une chaîne vide (jamais `undefined`).
 */
function extractField(document: SearchDoc, fieldName: string): string {
  const value = (document as unknown as Record<string, unknown>)[fieldName];
  if (Array.isArray(value)) return value.join(" ");
  return typeof value === "string" ? value : "";
}

/** Construit l'index MiniSearch d'un monde. À appeler UNE fois au chargement. */
export function buildSearchIndex(search: SearchIndex): ClientSearchIndex {
  const options: Options<SearchDoc> = {
    idField: "ref",
    fields: [...SEARCH_FIELDS],
    extractField,
  };
  const mini = new MiniSearch<SearchDoc>(options);
  const docsByRef = new Map<string, SearchDoc>();
  const languages = new Set<string>();
  const categories = new Set<Category>();

  for (const doc of search.documents) {
    docsByRef.set(doc.ref, doc);
    if (doc.language !== undefined) languages.add(doc.language);
    if (doc.category !== undefined) categories.add(doc.category);
  }
  // MiniSearch déduplique par id : on n'ajoute que des documents à `ref` unique.
  mini.addAll(search.documents);

  return {
    mini,
    docsByRef,
    languages: [...languages].sort((a, b) => a.localeCompare(b)),
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    size: docsByRef.size,
  };
}

/** Vrai si le document satisfait TOUS les filtres actifs (un filtre `null`/absent est ignoré). */
function matchesFilters(doc: SearchDoc, filters: SearchFilters): boolean {
  if (filters.kind != null && doc.kind !== filters.kind) return false;
  if (filters.language != null && doc.language !== filters.language) return false;
  if (filters.category != null && doc.category !== filters.category) return false;
  return true;
}

/** Reconstruit un `SearchHit` typé à partir du document source et des métadonnées MiniSearch. */
function toHit(doc: SearchDoc, score: number, terms: string[]): SearchHit {
  return {
    ref: doc.ref,
    path: doc.path,
    name: doc.name,
    kind: doc.kind,
    language: doc.language,
    category: doc.category,
    score,
    terms,
  };
}

/**
 * Exécute une recherche : préfixe + flou (tolérance aux fautes simples), tous les
 * termes requis (`AND`), puis filtrage. Une requête vide retourne `[]`. Résultats
 * triés par pertinence décroissante (ordre MiniSearch).
 */
export function runSearch(
  index: ClientSearchIndex,
  query: string,
  filters: SearchFilters = {},
): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];

  const raw = index.mini.search(trimmed, {
    prefix: true,
    fuzzy: 0.2,
    combineWith: "AND",
  });

  const hits: SearchHit[] = [];
  for (const result of raw) {
    // `id` est notre `ref` (idField), donc une chaîne ; l'assertion resserre le `any` de MiniSearch.
    const ref = result.id as string;
    const doc = index.docsByRef.get(ref);
    if (doc === undefined) continue;
    if (!matchesFilters(doc, filters)) continue;
    hits.push(toHit(doc, result.score, result.terms));
  }
  return hits;
}
