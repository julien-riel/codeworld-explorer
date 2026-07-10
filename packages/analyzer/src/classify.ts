/**
 * Classification déterministe des dossiers — couches 1 et 2 seulement (PRD §12.1,
 * contrat §3.6). AUCUNE IA, aucune analyse statique en sprint 2.
 *
 *   couche 1 — configuration explicite (chemin ou nom de dossier) : `decisionSource:
 *              "config"`, `overriddenByConfig: true`, prime toujours.
 *   couche 2 — règles de noms de dossiers (table `CLASSIFICATION_RULES`, PRD §12.4) :
 *              `decisionSource: "rule"`.
 *   repli    — `category: "unknown"`, `confidence: 0`, `evidence: []` (contrat §3.6).
 *
 * Chaque `Classification` porte `confidence` (pour-mille), `decisionSource` et
 * `evidence`, même quand la règle est triviale (PRD §12.3).
 */

import type { Category, Classification, Evidence, SourceNode, ThemeId } from "@codeworld/world-schema";
import type { ResolvedConfig } from "./config.js";

/** Abaissement ASCII pur (indépendant de la version Unicode du moteur). */
function asciiLower(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    out += String.fromCharCode(u >= 0x41 && u <= 0x5a ? u + 0x20 : u);
  }
  return out;
}

/** Une règle de couche 2 : des noms de dossiers mènent à une catégorie, avec priorité. */
export interface ClassificationRule {
  readonly folderNames: readonly string[];
  readonly category: Category;
  readonly priority: number;
}

/**
 * Thème v0 d'une catégorie (miroir de la table `THEME_OF`, contrat §13.2), utilisé
 * pour enrichir la représentation `visualMappings` de `effectiveConfig` (§5.4). Le
 * moteur de layout applique sa PROPRE table ; celle-ci ne sert qu'au hachage de config.
 */
export function themeForCategory(category: Category): ThemeId {
  if (category === "root") return "project-hall";
  if (category === "controller" || category === "route") return "control-room";
  return "neutral";
}

/**
 * Table de règles couche 2 (PRD §12.4), couvrant l'intégralité de la taxonomie
 * PRD §12.2. Les listes de noms sont DISJOINTES entre règles : aucune ambiguïté de
 * couverture. `priority` reproduit la structure `visualMappings` du PRD et départage
 * une éventuelle collision future.
 */
export const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  { folderNames: ["controllers", "controller"], category: "controller", priority: 100 },
  { folderNames: ["routes", "route", "api", "apis", "endpoints", "endpoint"], category: "route", priority: 100 },
  { folderNames: ["services", "service", "business"], category: "service", priority: 90 },
  { folderNames: ["domain", "domains", "core"], category: "domain", priority: 90 },
  { folderNames: ["ui", "components", "component", "views", "view", "pages", "page", "widgets", "widget", "screens"], category: "ui", priority: 90 },
  { folderNames: ["utils", "util", "utilities", "utility", "helpers", "helper", "lib", "libs", "common", "shared"], category: "utility", priority: 85 },
  { folderNames: ["models", "model", "entities", "entity", "schemas"], category: "model", priority: 85 },
  { folderNames: ["repositories", "repository", "repos", "repo", "dao", "daos"], category: "repository", priority: 85 },
  { folderNames: ["data", "datasets", "dataset", "db", "database", "migrations", "seeds", "fixtures"], category: "data", priority: 80 },
  { folderNames: ["config", "configs", "configuration", "configurations", "settings", "conf"], category: "configuration", priority: 80 },
  { folderNames: ["test", "tests", "__tests__", "spec", "specs", "e2e", "__mocks__", "mocks"], category: "test", priority: 80 },
  { folderNames: ["docs", "doc", "documentation", "wiki"], category: "documentation", priority: 70 },
  { folderNames: ["assets", "asset", "static", "public", "images", "img", "fonts", "media", "resources", "res"], category: "asset", priority: 70 },
  { folderNames: ["build", "dist", "out", "output", "target", "bin"], category: "build", priority: 60 },
  { folderNames: ["generated", "gen", "__generated__", "codegen", "autogen"], category: "generated", priority: 60 },
  { folderNames: ["vendor", "vendors", "third_party", "third-party", "node_modules", "deps", "external"], category: "vendor", priority: 60 },
];

/** Index nom-de-dossier → catégorie, construit une fois ; la priorité la plus haute gagne. */
const CATEGORY_BY_FOLDER_NAME: ReadonlyMap<string, Category> = (() => {
  const best = new Map<string, { category: Category; priority: number }>();
  for (const rule of CLASSIFICATION_RULES) {
    for (const raw of rule.folderNames) {
      const name = asciiLower(raw);
      const prev = best.get(name);
      if (prev === undefined || rule.priority > prev.priority) {
        best.set(name, { category: rule.category, priority: rule.priority });
      }
    }
  }
  const out = new Map<string, Category>();
  for (const [name, v] of best) out.set(name, v.category);
  return out;
})();

/** Tri des preuves par (kind, detail), ordre de code-unit UTF-16 (contrat §3.6). */
function sortEvidence(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) =>
    a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0,
  );
}

/**
 * Classe UN dossier. Précondition : `node.nodeType === "directory"`. La racine
 * (`path === ""`) est toujours `root`. La configuration (couche 1) prime sur les
 * règles de noms (couche 2), qui priment sur le repli `unknown`.
 */
export function classifyDirectory(node: SourceNode, config: ResolvedConfig): Classification {
  const base = { sourceNodeId: node.id } as const;

  // ── Racine : verdict structurel, jamais un nom de dossier ──
  if (node.path === "") {
    return {
      ...base,
      category: "root",
      confidence: 1000,
      decisionSource: "rule",
      evidence: [{ kind: "structural", detail: "repository-root" }],
      overriddenByConfig: false,
    };
  }

  // ── Couche 1 : configuration explicite (chemin exact, puis nom de dossier) ──
  const byPath = config.classificationPaths.get(node.path);
  if (byPath !== undefined) {
    return {
      ...base,
      category: byPath,
      confidence: 1000,
      decisionSource: "config",
      evidence: sortEvidence([{ kind: "config-path", detail: node.path }]),
      overriddenByConfig: true,
    };
  }
  const lowerName = asciiLower(node.name);
  const byConfigName = config.classificationFolderNames.get(lowerName);
  if (byConfigName !== undefined) {
    return {
      ...base,
      category: byConfigName,
      confidence: 1000,
      decisionSource: "config",
      evidence: sortEvidence([{ kind: "config-folder-name", detail: node.name }]),
      overriddenByConfig: true,
    };
  }

  // ── Couche 2 : règle déterministe de nom de dossier ──
  const byRule = CATEGORY_BY_FOLDER_NAME.get(lowerName);
  if (byRule !== undefined) {
    return {
      ...base,
      category: byRule,
      confidence: 1000,
      decisionSource: "rule",
      evidence: sortEvidence([{ kind: "folder-name", detail: node.name }]),
      overriddenByConfig: false,
    };
  }

  // ── Repli : inconnu, confiance nulle, aucune preuve (contrat §3.6) ──
  return {
    ...base,
    category: "unknown",
    confidence: 0,
    decisionSource: "rule",
    evidence: [],
    overriddenByConfig: false,
  };
}
