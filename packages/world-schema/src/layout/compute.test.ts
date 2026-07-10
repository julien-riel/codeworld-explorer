import { describe, it, expect } from "vitest";
import { computeLayout } from "./compute.js";
import type { LayoutDir, LayoutFile, LayoutTree } from "./compute.js";
import { DEFAULT_LAYOUT_OPTIONS } from "./options.js";
import type { Category } from "./tables.js";
import { nodeId } from "../ids.js";
import { canonicalStringify } from "../canonical.js";
import { WorldLayoutSchema } from "../schema.js";
import type { SpatialNode, WorldLayout } from "../schema.js";

// ── Fixtures : construit un LayoutTree dont les ids dérivent du path (contrat §4.2) ──

function makeFile(path: string): LayoutFile {
  return { id: nodeId(path), path, name: path.slice(path.lastIndexOf("/") + 1) };
}

function makeDir(
  path: string,
  childDirs: readonly LayoutDir[] = [],
  files: readonly LayoutFile[] = [],
): LayoutDir {
  return {
    id: nodeId(path),
    path,
    depth: path === "" ? 0 : path.split("/").length,
    isRoot: path === "",
    childDirs,
    files,
  };
}

const NO_CLASS: ReadonlyMap<string, Category> = new Map();
const SEED = "cwe-v0";

function run(tree: LayoutTree, classifications: ReadonlyMap<string, Category> = NO_CLASS): WorldLayout {
  return computeLayout(tree, classifications, SEED, DEFAULT_LAYOUT_OPTIONS);
}

// ── Vérifications structurelles réutilisées (sous-ensemble de assertLayoutInvariants §11) ──

interface Box {
  readonly xMin: number;
  readonly xMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

function floorAabb(n: SpatialNode): Box {
  const hx = n.dimensions.x / 2;
  const hz = n.dimensions.z / 2;
  return { xMin: n.position.x - hx, xMax: n.position.x + hx, zMin: n.position.z - hz, zMax: n.position.z + hz };
}

/** I3 — deux salles quelconques ont des AABB au sol disjointes. */
function assertNoOverlap(layout: WorldLayout): void {
  const nodes = layout.spatialNodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = floorAabb(nn(nodes[i]));
      const b = floorAabb(nn(nodes[j]));
      const disjoint = a.xMax <= b.xMin || b.xMax <= a.xMin || a.zMax <= b.zMin || b.zMax <= a.zMin;
      expect(disjoint, `chevauchement salles #${i} et #${j}`).toBe(true);
    }
  }
}

/** I5 — BFS du graphe de portails depuis l'unique `hall` atteint toutes les salles. */
function assertConnected(layout: WorldLayout): void {
  const byId = new Map(layout.spatialNodes.map((n) => [n.id, n] as const));
  const hall = layout.spatialNodes.find((n) => n.role === "hall");
  expect(hall, "un hall existe").toBeDefined();
  const seen = new Set<string>();
  const stack = [nn(hall).id];
  while (stack.length > 0) {
    const id = nn(stack.pop());
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of nn(byId.get(id)).portals) stack.push(p.toSpatialNodeId);
  }
  expect(seen.size).toBe(layout.spatialNodes.length);
}

/** I8 — l'ensemble des sourceNodeId d'objets est exactement celui des fichiers, sans doublon. */
function collectFileIds(dir: LayoutDir, acc: Set<string>): void {
  for (const f of dir.files) acc.add(f.id);
  for (const c of dir.childDirs) collectFileIds(c, acc);
}

function assertFileBijection(layout: WorldLayout, tree: LayoutTree): void {
  const expected = new Set<string>();
  collectFileIds(tree.root, expected);
  const seen: string[] = [];
  for (const n of layout.spatialNodes) for (const o of n.objects) seen.push(o.sourceNodeId);
  expect(new Set(seen).size).toBe(seen.length); // aucun doublon
  expect(new Set(seen)).toEqual(expected);
}

function nn<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("valeur absente dans le test");
  return v;
}

/** Valide contre le schéma Zod ET revérifie les invariants structurels clés. */
function assertValidLayout(layout: WorldLayout, tree: LayoutTree): void {
  expect(() => WorldLayoutSchema.parse(layout)).not.toThrow();
  assertNoOverlap(layout);
  assertConnected(layout);
  assertFileBijection(layout, tree);
}

// ── Les six entrées imposées par la mission ──

describe("computeLayout — entrées de base", () => {
  it("un dépôt d'un seul fichier : 1 salle hall, 1 objet", () => {
    const tree: LayoutTree = { root: makeDir("", [], [makeFile("README.md")]) };
    const layout = run(tree);
    assertValidLayout(layout, tree);
    expect(layout.spatialNodes).toHaveLength(1);
    const hall = nn(layout.spatialNodes[0]);
    expect(hall.role).toBe("hall");
    expect(hall.spaceType).toBe("hall");
    expect(hall.objects).toHaveLength(1);
    expect(hall.position).toEqual({ x: 0, y: 0, z: -4000 }); // monde centré
  });

  it("un dossier vide : 1 salle hall, aucun objet, aucun portail", () => {
    const tree: LayoutTree = { root: makeDir("", [], []) };
    const layout = run(tree);
    assertValidLayout(layout, tree);
    expect(layout.spatialNodes).toHaveLength(1);
    const hall = nn(layout.spatialNodes[0]);
    expect(hall.role).toBe("hall");
    expect(hall.objects).toHaveLength(0);
    expect(hall.portals).toHaveLength(0);
    expect(hall.pageCount).toBe(1);
  });

  it("tous les fichiers tiennent dans la salle primaire (pas d'annexe)", () => {
    const files = ["a.ts", "b.ts", "c.md", "d.json"].map((n) => makeFile(n));
    const tree: LayoutTree = { root: makeDir("", [], files) };
    const layout = run(tree);
    assertValidLayout(layout, tree);
    expect(layout.spatialNodes).toHaveLength(1);
    const hall = nn(layout.spatialNodes[0]);
    expect(hall.pageCount).toBe(1);
    expect(hall.objects).toHaveLength(4);
    expect(hall.role).toBe("hall");
  });

  it("un dossier qui déborde en annexe (pagination)", () => {
    const files = Array.from({ length: 300 }, (_, i) => makeFile(`f${String(i).padStart(4, "0")}.ts`));
    const tree: LayoutTree = { root: makeDir("", [], files) };
    const layout = run(tree);
    assertValidLayout(layout, tree);
    // Une salle hall + au moins une annexe.
    expect(layout.spatialNodes.length).toBeGreaterThanOrEqual(2);
    const roles = layout.spatialNodes.map((n) => n.role);
    expect(roles.filter((r) => r === "hall")).toHaveLength(1);
    expect(roles).toContain("annex");
    // pageCount cohérent et identique dans tout le groupe (un seul dossier).
    const pageCount = nn(layout.spatialNodes[0]).pageCount;
    expect(pageCount).toBe(layout.spatialNodes.length);
    for (const n of layout.spatialNodes) expect(n.pageCount).toBe(pageCount);
    // Les 300 fichiers sont tous placés (bijection).
    const total = layout.spatialNodes.reduce((s, n) => s + n.objects.length, 0);
    expect(total).toBe(300);
    // Les annexes sont des galeries (§8.4).
    for (const n of layout.spatialNodes) {
      if (n.role === "annex") expect(n.spaceType).toBe("gallery");
    }
  });

  it("un dossier de 200 sous-dossiers", () => {
    const subs = Array.from({ length: 200 }, (_, i) => makeDir(`d${String(i).padStart(3, "0")}`));
    const tree: LayoutTree = { root: makeDir("", subs, []) };
    const layout = run(tree);
    assertValidLayout(layout, tree);
    // 200 primaries d'enfants + la chaîne de la racine (≥ 1 salle).
    const primaries = layout.spatialNodes.filter((n) => n.role === "primary");
    expect(primaries).toHaveLength(200);
    expect(layout.spatialNodes.length).toBeGreaterThan(200);
    // La racine reste "hall" quel que soit C (§8.4 : la racine prime sur plaza).
    const hall = nn(layout.spatialNodes.find((n) => n.role === "hall"));
    expect(hall.spaceType).toBe("hall");
    // Chaque enfant a exactement un primary (I7) et une seule identité.
    const bySource = new Map<string, number>();
    for (const p of primaries) bySource.set(p.sourceNodeId, (bySource.get(p.sourceNodeId) ?? 0) + 1);
    for (const count of bySource.values()) expect(count).toBe(1);
  });

  it("une profondeur de 30 : level plafonné, imbrication XZ continue", () => {
    // Chaîne imbriquée d0 > d0/d1 > … > jusqu'à depth 30, chaque niveau 1 sous-dossier.
    let path = "";
    const segments: string[] = [];
    for (let i = 1; i <= 30; i++) {
      segments.push(`d${i}`);
      path = segments.join("/");
    }
    // Construit de bas en haut.
    let node = makeDir(path); // depth 30, feuille
    for (let depth = 29; depth >= 1; depth--) {
      const parentPath = segments.slice(0, depth).join("/");
      node = makeDir(parentPath, [node]);
    }
    const root = makeDir("", [node]);
    const tree: LayoutTree = { root };
    const layout = run(tree);
    assertValidLayout(layout, tree);
    expect(layout.spatialNodes).toHaveLength(31); // racine + 30 dossiers imbriqués

    const maxRender = DEFAULT_LAYOUT_OPTIONS.maxRenderDepth;
    for (const n of layout.spatialNodes) {
      expect(n.level).toBeLessThanOrEqual(maxRender);
      // depthFlattened SSI la salle est au plafond de level.
      if (n.depthFlattened) expect(n.level).toBe(maxRender);
    }
    // Au moins une salle plafonnée (depth 21..30 > 20).
    expect(layout.spatialNodes.some((n) => n.depthFlattened)).toBe(true);
    // Les salles au-delà du plafond partagent le même y mais des XZ distincts (I3 déjà vérifié).
    const flattened = layout.spatialNodes.filter((n) => n.depthFlattened);
    for (const n of flattened) expect(n.position.y).toBe(maxRender * DEFAULT_LAYOUT_OPTIONS.floorHeight);
  });
});

// ── Déterminisme (FR-026) et indépendance à l'ordre d'entrée (§1.1, §5.2) ──

describe("computeLayout — déterminisme et indépendance à l'ordre", () => {
  const cases: { readonly name: string; readonly make: () => LayoutTree }[] = [
    { name: "un seul fichier", make: () => ({ root: makeDir("", [], [makeFile("README.md")]) }) },
    { name: "dossier vide", make: () => ({ root: makeDir("", [], []) }) },
    {
      name: "fichiers dans la primary",
      make: () => ({ root: makeDir("", [], ["a.ts", "b.md", "c.json"].map(makeFile)) }),
    },
    {
      name: "débordement en annexe",
      make: () => ({
        root: makeDir("", [], Array.from({ length: 300 }, (_, i) => makeFile(`f${String(i).padStart(4, "0")}.ts`))),
      }),
    },
    {
      name: "200 sous-dossiers",
      make: () => ({
        root: makeDir("", Array.from({ length: 200 }, (_, i) => makeDir(`d${String(i).padStart(3, "0")}`)), []),
      }),
    },
  ];

  it("deux exécutions identiques produisent la même chaîne canonique", () => {
    for (const c of cases) {
      const a = canonicalStringify(run(c.make()));
      const b = canonicalStringify(run(c.make()));
      expect(a, c.name).toBe(b);
    }
  });

  it("mélanger childDirs/files ne change pas la sortie canonique", () => {
    // Dossier mixte : sous-dossiers ET fichiers, dans un ordre puis son inverse.
    const subs = ["src", "lib", "docs", "test", "config"].map((p) => makeDir(p));
    const files = ["z.ts", "a.md", "m.json", "b.test.ts", "readme"].map(makeFile);
    const ordered: LayoutTree = { root: makeDir("", subs, files) };
    const shuffled: LayoutTree = { root: makeDir("", [...subs].reverse(), [...files].reverse()) };
    expect(canonicalStringify(run(ordered))).toBe(canonicalStringify(run(shuffled)));
  });

  it("le grand dossier de sous-dossiers est stable après mélange", () => {
    const subs = Array.from({ length: 200 }, (_, i) => makeDir(`d${String(i).padStart(3, "0")}`));
    const ordered: LayoutTree = { root: makeDir("", subs, []) };
    const shuffled: LayoutTree = { root: makeDir("", [...subs].reverse(), []) };
    expect(canonicalStringify(run(ordered))).toBe(canonicalStringify(run(shuffled)));
  });

  it("la graine change la sortie mais reste déterministe", () => {
    const tree = (): LayoutTree => ({ root: makeDir("", ["src", "lib"].map((p) => makeDir(p)), ["a.ts", "b.ts"].map(makeFile)) });
    const s1 = canonicalStringify(computeLayout(tree(), NO_CLASS, "cwe-v0", DEFAULT_LAYOUT_OPTIONS));
    const s1bis = canonicalStringify(computeLayout(tree(), NO_CLASS, "cwe-v0", DEFAULT_LAYOUT_OPTIONS));
    const s2 = canonicalStringify(computeLayout(tree(), NO_CLASS, "autre-graine", DEFAULT_LAYOUT_OPTIONS));
    expect(s1).toBe(s1bis);
    expect(s1).not.toBe(s2);
  });
});

// ── Classification, thèmes et objets (§8.2, contrat §13.2) ──

describe("computeLayout — thèmes et objets", () => {
  it("un dossier controller devient control-room et transforme code/config en console", () => {
    const controllerId = nodeId("controllers");
    const classifications = new Map<string, Category>([[controllerId, "controller"]]);
    const tree: LayoutTree = {
      root: makeDir("", [makeDir("controllers", [], ["handler.ts", "routes.json", "README.md"].map(makeFile))], []),
    };
    const layout = computeLayout(tree, classifications, SEED, DEFAULT_LAYOUT_OPTIONS);
    const controlRoom = nn(layout.spatialNodes.find((n) => n.sourceNodeId === controllerId));
    expect(controlRoom.theme).toBe("control-room");
    const kinds = controlRoom.objects.map((o) => o.kind).sort();
    // handler.ts (code) → console ; routes.json (config) → console ; README.md (readme) → readme-stand.
    expect(kinds).toEqual(["console", "console", "readme-stand"]);
  });

  it("un dossier NON racine avec beaucoup de sous-dossiers est une plaza (§8.4)", () => {
    const many = Array.from({ length: 10 }, (_, i) => makeDir(`big/s${String(i)}`));
    const tree: LayoutTree = { root: makeDir("", [makeDir("big", many)], []) };
    const layout = run(tree);
    const big = nn(layout.spatialNodes.find((n) => n.sourceNodeId === nodeId("big") && n.role === "primary"));
    expect(big.spaceType).toBe("plaza"); // C = 10 ≥ plazaThreshold (8)
  });

  it("un dossier NON racine avec beaucoup de fichiers est une gallery (§8.4)", () => {
    const files = Array.from({ length: 15 }, (_, i) => makeFile(`pkg/f${String(i)}.ts`));
    const tree: LayoutTree = { root: makeDir("", [makeDir("pkg", [], files)], []) };
    const layout = run(tree);
    const pkg = nn(layout.spatialNodes.find((n) => n.sourceNodeId === nodeId("pkg") && n.role === "primary"));
    expect(pkg.spaceType).toBe("gallery"); // F = 15 ≥ galleryThreshold (12), pas de plaza (C = 0)
  });

  it("la racine sans classification est un project-hall neutre", () => {
    const layout = run({ root: makeDir("", [], [makeFile("main.ts")]) });
    const hall = nn(layout.spatialNodes[0]);
    // Racine → catégorie root implicite ? Non : sans classification, THEME_OF[unknown] = neutral.
    expect(hall.theme).toBe("neutral");
    expect(nn(hall.objects[0]).kind).toBe("file-code");
  });
});
