/**
 * Couche 3 de classification — HEURISTIQUES D'ANALYSE STATIQUE (PRD §12.1, §20.3).
 *
 * N'intervient QUE sur les dossiers laissés `unknown` par les couches 1 (config) et 2
 * (règles de noms) : l'ordre de priorité config > règle > statique est respecté en amont
 * (pipeline.ts). À partir des faits déjà extraits par l'étage d'analyse de code (symboles,
 * imports bruts) et des noms de fichiers, on agrège des SIGNAUX pondérés vers une catégorie
 * de la taxonomie, avec preuves.
 *
 * Trois familles de signaux, par précision décroissante :
 *   - nom de fichier conventionnel (`user.controller.ts`, `user.service.ts`, `x.spec.ts`) —
 *     signal FORT, quasi sans faux positif sur les codebases NestJS/Angular/Jest ;
 *   - import de framework non ambigu (`react`→ui, `express`→route, `typeorm`→repository) —
 *     signal FORT ;
 *   - suffixe de nom de symbole (`*Controller`, `*Service`, `*Repository`, composant PascalCase
 *     dans un fichier TSX/JSX) — signal MODÉRÉ.
 *
 * Politique : PRÉCISION avant rappel. La confiance produite est intermédiaire, bornée à
 * [MIN_CONFIDENCE, MAX_CONFIDENCE] — jamais 1000, réservé à la certitude config/règle. En cas
 * d'ambiguïté (aucun signal, ou deux catégories à égalité de score), on renvoie `null` : le
 * dossier reste `unknown` (thème neutre), sans devinette forcée — c'est le rôle de la couche 4
 * (IA, reportée au sprint 7) de trancher ces cas.
 *
 * DÉTERMINISME (FR-026) : entrées déjà déterministes (symboles/imports mémoïsés par hash,
 * ordre d'arbre figé), agrégation à sélection totalement ordonnée, preuves triées puis
 * plafonnées, confiance entière (pour-mille). Aucune horloge, aucune source d'ordre instable.
 */

import type { Category, Classification, Evidence, SymbolType } from "@codeworld/world-schema";

/** Symbole top-level minimal nécessaire aux heuristiques (sous-ensemble de `Symbol`). */
export interface StaticSymbol {
  readonly name: string;
  readonly symbolType: SymbolType;
  readonly exported: boolean;
}

/** Profil statique d'un fichier de code d'un dossier candidat. */
export interface StaticFileProfile {
  /** Nom de base du fichier (ex. « user.controller.ts »), tel que dans le `SourceNode`. */
  readonly name: string;
  /** Langage détecté (« TypeScript » | « TSX » | « JavaScript » | « JSX »). */
  readonly language: string;
  /** Symboles top-level du fichier. */
  readonly symbols: readonly StaticSymbol[];
  /** Spécificateurs d'import/re-export bruts (bare + relatifs) ; les relatifs sont ignorés. */
  readonly importModules: readonly string[];
}

// ── Bornes du modèle de confiance (pour-mille entier) ──

const MIN_CONFIDENCE = 400;
const MAX_CONFIDENCE = 850;
/** Score minimal pour émettre un verdict (au moins un signal modéré). */
const MIN_SCORE = 2;
/** Pas de confiance par point de score au-delà de `MIN_SCORE`. */
const CONFIDENCE_STEP = 75;
/** Poids d'un signal fort (nom de fichier, import de framework). */
const WEIGHT_STRONG = 3;
/** Poids d'un signal modéré (suffixe de symbole, composant). */
const WEIGHT_MODERATE = 2;
/** Nombre maximal de preuves conservées pour le verdict (après tri). */
const MAX_EVIDENCE = 8;

// ── Tables de signaux ──

/**
 * Infixe de nom de fichier conventionnel → catégorie. Comparé sur le nom ABAISSÉ ASCII.
 * Les points encadrants évitent les faux positifs (`.service.` ne matche pas « myservices.ts »).
 */
const FILE_INFIX_CATEGORY: readonly (readonly [string, Category])[] = [
  [".controller.", "controller"],
  [".resolver.", "controller"],
  [".service.", "service"],
  [".repository.", "repository"],
  [".entity.", "model"],
  [".model.", "model"],
  [".schema.", "model"],
  [".component.", "ui"],
  [".page.", "ui"],
  [".view.", "ui"],
  [".route.", "route"],
  [".router.", "route"],
  [".middleware.", "route"],
  [".guard.", "route"],
  [".spec.", "test"],
  [".test.", "test"],
];

/** Module npm racine non ambigu → catégorie (signal fort). Clé = racine du paquet. */
const FRAMEWORK_MODULE_CATEGORY: ReadonlyMap<string, Category> = new Map<string, Category>([
  // UI / front-end
  ["react", "ui"],
  ["react-dom", "ui"],
  ["next", "ui"],
  ["vue", "ui"],
  ["svelte", "ui"],
  ["solid-js", "ui"],
  ["preact", "ui"],
  // Serveur / routage HTTP
  ["express", "route"],
  ["fastify", "route"],
  ["koa", "route"],
  // Accès aux données / ORM
  ["typeorm", "repository"],
  ["sequelize", "repository"],
  ["drizzle-orm", "repository"],
  ["knex", "repository"],
  ["@prisma/client", "repository"],
  ["mongoose", "model"],
  // Tests
  ["vitest", "test"],
  ["jest", "test"],
  ["@jest/globals", "test"],
  ["mocha", "test"],
  ["chai", "test"],
  ["supertest", "test"],
]);

/** Préfixe de scope de framework → catégorie (comparé sur la racine du module). */
const FRAMEWORK_SCOPE_CATEGORY: readonly (readonly [string, Category])[] = [
  ["@angular/", "ui"],
  ["@remix-run/", "ui"],
  ["@testing-library/", "test"],
  ["@mikro-orm/", "repository"],
];

/**
 * Suffixe de nom de symbole → catégorie (signal modéré). Ordre = priorité : le PREMIER
 * suffixe correspondant l'emporte (mais un nom ne matche en pratique qu'un seul suffixe).
 */
const NAME_SUFFIX_CATEGORY: readonly (readonly [string, Category])[] = [
  ["Controller", "controller"],
  ["Resolver", "controller"],
  ["Service", "service"],
  ["Repository", "repository"],
  ["Repo", "repository"],
  ["Dao", "repository"],
  ["Entity", "model"],
  ["Model", "model"],
  ["Component", "ui"],
  ["Widget", "ui"],
  ["Middleware", "route"],
  ["Router", "route"],
];

/** Types de symboles pouvant être un composant (fonction ou constante/variable liée). */
const COMPONENT_SYMBOL_TYPES: ReadonlySet<SymbolType> = new Set<SymbolType>([
  "function",
  "constant",
  "variable",
]);

/** Langages porteurs de JSX (donc susceptibles de définir des composants). */
const JSX_LANGUAGES: ReadonlySet<string> = new Set(["TSX", "JSX"]);

// ── Utilitaires purs ──

/** Abaissement ASCII pur (indépendant de la version Unicode du moteur), comme classify.ts. */
function asciiLower(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    out += String.fromCharCode(u >= 0x41 && u <= 0x5a ? u + 0x20 : u);
  }
  return out;
}

/** Vrai si le spécificateur est un module « bare » (npm/framework), pas un import relatif. */
function isBareModule(mod: string): boolean {
  return mod.length > 0 && !mod.startsWith(".") && !mod.startsWith("/");
}

/** Racine d'un module bare : `@scope/name` (deux segments) ou premier segment. */
function packageRoot(mod: string): string {
  const parts = mod.split("/");
  if (mod.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : mod;
  return parts[0] ?? mod;
}

/** Catégorie associée à un module bare, ou `undefined` s'il n'est pas un framework connu. */
function categoryForModule(mod: string): Category | undefined {
  const root = packageRoot(mod);
  const exact = FRAMEWORK_MODULE_CATEGORY.get(root);
  if (exact !== undefined) return exact;
  for (const [prefix, cat] of FRAMEWORK_SCOPE_CATEGORY) if (root.startsWith(prefix)) return cat;
  return undefined;
}

/** Catégorie associée au suffixe d'un nom de symbole, ou `undefined`. */
function categoryForSymbolName(name: string): Category | undefined {
  for (const [suffix, cat] of NAME_SUFFIX_CATEGORY) if (name.endsWith(suffix)) return cat;
  return undefined;
}

/** Nom de composant plausible : PascalCase ASCII (majuscule initiale + une minuscule). */
function isComponentName(name: string): boolean {
  if (name.length === 0) return false;
  const first = name.charCodeAt(0);
  if (first < 0x41 || first > 0x5a) return false; // doit commencer par A-Z
  for (let i = 1; i < name.length; i++) {
    const u = name.charCodeAt(i);
    if (u >= 0x61 && u <= 0x7a) return true; // au moins une minuscule → pas une CONSTANTE
  }
  return false;
}

/** Accumulateur de vote d'une catégorie : score cumulé + preuves dédupliquées. */
interface Vote {
  score: number;
  evidence: Map<string, Evidence>;
}

/** Clé de déduplication d'une preuve (le NUL ne peut apparaître dans un nom réel). */
function evidenceKey(kind: string, detail: string): string {
  return `${kind} ${detail}`;
}

/** Tri des preuves par (kind, detail) en ordre code-unit UTF-16 (contrat §3.6). */
function compareEvidence(a: Evidence, b: Evidence): number {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.detail !== b.detail) return a.detail < b.detail ? -1 : 1;
  return 0;
}

/** Ordre total et stable des catégories (pour un départage déterministe résiduel). */
function compareCategory(a: Category, b: Category): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Applique la couche 3 à UN dossier candidat, à partir des profils statiques de ses fichiers
 * de code DIRECTS. Renvoie une `Classification` (`decisionSource: "static"`) si un signal
 * suffisamment net se dégage, sinon `null` (le dossier reste `unknown`).
 *
 * Précondition : appelée uniquement pour un dossier laissé `unknown` par les couches 1-2.
 */
export function classifyDirectoryStatic(
  sourceNodeId: string,
  files: readonly StaticFileProfile[],
): Classification | null {
  const votes = new Map<Category, Vote>();

  const addVote = (category: Category, weight: number, kind: string, detail: string): void => {
    let vote = votes.get(category);
    if (vote === undefined) {
      vote = { score: 0, evidence: new Map() };
      votes.set(category, vote);
    }
    vote.score += weight;
    const key = evidenceKey(kind, detail);
    if (!vote.evidence.has(key)) vote.evidence.set(key, { kind, detail });
  };

  for (const file of files) {
    const lowerName = asciiLower(file.name);

    // Signal FORT — nom de fichier conventionnel.
    for (const [infix, category] of FILE_INFIX_CATEGORY) {
      if (lowerName.includes(infix)) {
        addVote(category, WEIGHT_STRONG, "file-name", file.name);
        break; // un nom conventionnel ne porte qu'une convention
      }
    }

    // Signal FORT — import de framework non ambigu (modules distincts au sein du fichier).
    const seenModules = new Set<string>();
    for (const mod of file.importModules) {
      if (!isBareModule(mod)) continue;
      const root = packageRoot(mod);
      if (seenModules.has(root)) continue;
      seenModules.add(root);
      const category = categoryForModule(mod);
      if (category !== undefined) addVote(category, WEIGHT_STRONG, "framework-import", root);
    }

    // Signal MODÉRÉ — suffixe de symbole, ou composant PascalCase dans un fichier JSX.
    const jsx = JSX_LANGUAGES.has(file.language);
    for (const sym of file.symbols) {
      const suffixCategory = categoryForSymbolName(sym.name);
      if (suffixCategory !== undefined) {
        addVote(suffixCategory, WEIGHT_MODERATE, "symbol-name", sym.name);
      } else if (jsx && sym.exported && COMPONENT_SYMBOL_TYPES.has(sym.symbolType) && isComponentName(sym.name)) {
        addVote("ui", WEIGHT_MODERATE, "component", sym.name);
      }
    }
  }

  if (votes.size === 0) return null;

  // Sélection déterministe : plus haut score ; départage résiduel par ordre de catégorie
  // UNIQUEMENT pour un ordre total stable — une vraie égalité de tête reste ambiguë (null).
  const ranked = [...votes.entries()].sort((a, b) =>
    b[1].score - a[1].score || compareCategory(a[0], b[0]),
  );
  const top = ranked[0];
  if (top === undefined) return null; // votes.size > 0 le garantit ; garde pour le typage
  const [winner, winnerVote] = top;
  if (winnerVote.score < MIN_SCORE) return null;
  // Ambiguïté : la catégorie de tête n'est pas strictement dominante → pas de devinette.
  const runnerUp = ranked[1];
  if (runnerUp !== undefined && runnerUp[1].score === winnerVote.score) return null;

  const confidence = Math.min(
    MAX_CONFIDENCE,
    MIN_CONFIDENCE + CONFIDENCE_STEP * (winnerVote.score - MIN_SCORE),
  );

  const evidence = [...winnerVote.evidence.values()].sort(compareEvidence).slice(0, MAX_EVIDENCE);

  return {
    sourceNodeId,
    category: winner,
    confidence,
    decisionSource: "static",
    evidence,
    overriddenByConfig: false,
  };
}
