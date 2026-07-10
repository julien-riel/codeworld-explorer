/**
 * Fixtures déterministes du moteur de layout, écrites en TypeScript (jamais lues
 * du disque). Chaque fixture est un `LayoutTree` dont les `id` DÉRIVENT du `path`
 * (contrat §4.2), plus une carte de classifications (dossier → catégorie).
 *
 * Ces six arborescences couvrent les cas limites du PRD : minuscule, imbriquée,
 * large (chaîne d'annexes de fichiers), fan-out (chaîne d'annexes de portes),
 * profonde (plafond de `level` à 20) et Unicode (espaces, accents, İ turc U+0130,
 * caractère hors BMP).
 */

import {
  computeLayout,
  nodeId,
  sha256Hex,
  canonicalStringify,
  LAYOUT_VERSION,
  DEFAULT_LAYOUT_OPTIONS,
} from "../src/index";
import type {
  LayoutDir,
  LayoutFile,
  LayoutTree,
  WorldLayout,
  World,
  SourceNode,
  Classification,
  SearchDoc,
} from "../src/index";
import type { Category } from "../src/layout/tables";

/** Graine de corpus par défaut (contrat §5.3). */
export const SEED = "cwe-v0";

/** Options de layout par défaut (layout-engine-v0 §10.2). */
export const OPTIONS = DEFAULT_LAYOUT_OPTIONS;

/** Dernier segment d'un chemin POSIX ; racine (`""`) → `""`. */
export function lastSegment(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

/** Profondeur SOURCE d'un chemin : racine `""` → 0, sinon le nombre de segments. */
function depthOf(path: string): number {
  return path === "" ? 0 : path.split("/").length;
}

/** Fichier non exclu dont l'`id` dérive du `path` (contrat §4.2). */
export function file(path: string): LayoutFile {
  return { id: nodeId(path), path, name: lastSegment(path) };
}

/** Dossier non exclu dont l'`id` dérive du `path` ; `depth`/`isRoot` déduits du `path`. */
export function dir(
  path: string,
  childDirs: readonly LayoutDir[] = [],
  files: readonly LayoutFile[] = [],
): LayoutDir {
  return { id: nodeId(path), path, depth: depthOf(path), isRoot: path === "", childDirs, files };
}

/** Carte `dossierId → catégorie` à partir des CHEMINS des dossiers (plus lisible). */
function classMap(entries: readonly (readonly [string, Category])[]): Map<string, Category> {
  return new Map(entries.map(([path, cat]) => [nodeId(path), cat] as const));
}

/** Une fixture : nom, arbre d'entrée, classifications des dossiers. */
export interface Fixture {
  readonly name: string;
  readonly tree: LayoutTree;
  readonly classifications: ReadonlyMap<string, Category>;
}

/** Calcule le layout d'une fixture avec la graine et les options de corpus. */
export function layoutOf(fx: Fixture): WorldLayout {
  return computeLayout(fx.tree, fx.classifications, SEED, OPTIONS);
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// ── tiny : 3 fichiers, aucun sous-dossier ──

const tinyTree: LayoutTree = {
  root: dir("", [], [file("README.md"), file("index.ts"), file("config.json")]),
};

// ── nested : profondeur 5, quelques fichiers par niveau ; « src/api » en control-room ──

const nestedTree: LayoutTree = {
  root: dir(
    "",
    [
      dir(
        "src",
        [
          dir(
            "src/api",
            [
              dir(
                "src/api/v1",
                [
                  dir(
                    "src/api/v1/models",
                    [
                      dir(
                        "src/api/v1/models/schema",
                        [],
                        [file("src/api/v1/models/schema/index.ts"), file("src/api/v1/models/schema/types.ts")],
                      ),
                    ],
                    [file("src/api/v1/models/user.ts"), file("src/api/v1/models/post.ts")],
                  ),
                ],
                [file("src/api/v1/users.ts")],
              ),
            ],
            [file("src/api/routes.ts"), file("src/api/handler.ts")],
          ),
        ],
        [file("src/index.ts"), file("src/util.ts")],
      ),
    ],
    [file("README.md"), file("package.json")],
  ),
};

// ── wide : un dossier de plus de 200 fichiers, qui force la chaîne d'annexes ──

function buildWide(): LayoutTree {
  const files: LayoutFile[] = [];
  for (let i = 0; i < 210; i++) files.push(file(`assets/f${pad(i, 3)}.dat`));
  return { root: dir("", [dir("assets", [], files)], [file("README.md")]) };
}

// ── fanout : un dossier de 200 sous-dossiers, qui force la chaîne d'annexes de portes ──

function buildFanout(): LayoutTree {
  const subs: LayoutDir[] = [];
  for (let i = 0; i < 200; i++) subs.push(dir(`pkg/m${pad(i, 3)}`, [], []));
  return { root: dir("", [dir("pkg", subs, [])], [file("README.md")]) };
}

// ── deep : profondeur 30, qui force `level` à se plafonner à 20 ──

function buildDeep(): LayoutTree {
  let node: LayoutDir | null = null;
  for (let d = 30; d >= 1; d--) {
    const path = Array.from({ length: d }, (_v, k) => `l${pad(k + 1, 2)}`).join("/");
    const childDirs = node === null ? [] : [node];
    node = dir(path, childDirs, [file(`${path}/note.md`)]);
  }
  // `node` est le dossier `l01` (profondeur 1), portant la chaîne jusqu'à `l30`.
  const l01 = node === null ? dir("l01") : node;
  return { root: dir("", [l01], [file("README.md")]) };
}

// ── unicode : espaces, accents, İ turc (U+0130), caractère hors BMP (U+1F600) ──

const unicodeTree: LayoutTree = {
  root: dir(
    "",
    [
      dir(
        "café-dossier",
        [],
        [file("café-dossier/naïve.md"), file("café-dossier/Ünïcödé.json")],
      ),
      dir("документы", [], [file("документы/файл.md")]),
    ],
    [
      file("hello world.md"),
      file("café.txt"),
      file("İstanbul.ts"),
      file("emoji😀.js"),
    ],
  ),
};

/** Les six fixtures, dans un ordre stable. */
export const FIXTURES: readonly Fixture[] = [
  { name: "tiny", tree: tinyTree, classifications: classMap([["", "root"]]) },
  {
    name: "nested",
    tree: nestedTree,
    classifications: classMap([
      ["", "root"],
      ["src/api", "controller"],
    ]),
  },
  { name: "wide", tree: buildWide(), classifications: classMap([["", "root"]]) },
  { name: "fanout", tree: buildFanout(), classifications: classMap([["", "root"]]) },
  { name: "deep", tree: buildDeep(), classifications: classMap([["", "root"]]) },
  { name: "unicode", tree: unicodeTree, classifications: classMap([["", "root"]]) },
];

// ── Assemblage d'un artefact `World` complet (pour la suite FR-027) ──

const REPO_NAME = "fixture-repo";

/** Langage d'un fichier d'après son extension, ou `null` si non détecté (contrat §3.5). */
function languageOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  const ext = dot < 0 ? "" : name.slice(dot + 1);
  const table: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    py: "python", md: "markdown",
  };
  return table[ext] ?? null;
}

/**
 * Assemble un artefact `World` v0 VALIDE à partir d'une fixture : `nodes` triés par
 * `path` avec `id`/`parentId` dérivés (contrat §3.5, §4.2), classifications de
 * dossiers (§3.6), layout produit par le moteur, index de recherche en couverture
 * totale (§3.8.1), et métadonnées figées (dépôt/commit) — aucune valeur d'exécution.
 */
export function buildWorld(fx: Fixture): World {
  const nodes: SourceNode[] = [];
  const classifications: Classification[] = [];
  const dirCategory = new Map<string, Category>();

  const walk = (d: LayoutDir, parentId: string | null): void => {
    const dirNode: SourceNode = {
      id: d.id,
      parentId,
      path: d.path,
      name: d.isRoot ? REPO_NAME : lastSegment(d.path),
      nodeType: "directory",
      depth: d.depth,
      childCount: d.childDirs.length + d.files.length,
    };
    nodes.push(dirNode);

    const cat: Category = fx.classifications.get(d.id) ?? (d.isRoot ? "root" : "unknown");
    dirCategory.set(d.id, cat);
    const useEvidence = cat !== "unknown" && !d.isRoot;
    classifications.push({
      sourceNodeId: d.id,
      category: cat,
      confidence: cat === "unknown" ? 0 : 1000,
      decisionSource: "rule",
      evidence: useEvidence ? [{ kind: "folder-name", detail: lastSegment(d.path) }] : [],
      overriddenByConfig: false,
    });

    for (const f of d.files) {
      const fileNode: SourceNode = {
        id: f.id,
        parentId: d.id,
        path: f.path,
        name: f.name,
        nodeType: "file",
        depth: depthOf(f.path),
        contentHash: sha256Hex(f.path),
      };
      const lang = languageOf(f.name);
      if (lang !== null) fileNode.language = lang;
      nodes.push(fileNode);
    }
    for (const c of d.childDirs) walk(c, d.id);
  };
  walk(fx.tree.root, null);

  const byPath = (a: { path: string }, b: { path: string }): number =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  nodes.sort(byPath);
  classifications.sort((a, b) =>
    a.sourceNodeId < b.sourceNodeId ? -1 : a.sourceNodeId > b.sourceNodeId ? 1 : 0,
  );

  const documents: SearchDoc[] = nodes.map((n) => {
    const doc: SearchDoc = { ref: n.id, path: n.path, name: n.name, kind: n.nodeType };
    if (n.language !== undefined) doc.language = n.language;
    if (n.nodeType === "directory") {
      const cat = dirCategory.get(n.id);
      if (cat !== undefined) doc.category = cat;
    }
    return doc;
  });
  documents.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));

  const layout = computeLayout(fx.tree, fx.classifications, SEED, OPTIONS);
  const configurationHash = sha256Hex(
    canonicalStringify({ seed: SEED, options: OPTIONS, taxonomyVersion: 0 }),
  );

  return {
    manifest: {
      schemaVersion: 0,
      analyzerVersion: "0.1.0-test",
      layoutVersion: LAYOUT_VERSION,
      configurationHash,
    },
    repository: {
      provider: "github",
      owner: "acme",
      name: REPO_NAME,
      url: `https://github.com/acme/${REPO_NAME}`,
      defaultBranch: "main",
      license: "MIT",
    },
    snapshot: {
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      branch: "main",
      committedAt: "2026-07-09T12:32:07Z",
    },
    nodes,
    classifications,
    layout,
    search: { version: 0, documents },
  };
}
