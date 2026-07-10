import { describe, it, expect } from "vitest";
import {
  assertExtent,
  assertVisibility,
  assertRoomsDisjoint,
  assertRenderDepth,
  assertConnected,
  assertPortalReciprocity,
  assertRoomCardinality,
  assertFileBijection,
  assertFootprints,
  assertPortalKinds,
  assertSafeIntegers,
  assertPortalsInWalls,
  assertLayoutInvariants,
} from "./invariants.js";
import { computeLayout } from "./compute.js";
import type { LayoutDir, LayoutFile, LayoutTree } from "./compute.js";
import { DEFAULT_LAYOUT_OPTIONS } from "./options.js";
import type { Category } from "./tables.js";
import { LayoutInvariantError } from "../errors.js";
import { nodeId } from "../ids.js";
import type { WorldLayout, SpatialNode, FileObject } from "../schema.js";

// ── Fixtures : LayoutTree dont les ids dérivent du path (contrat §4.2) ──

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

const OPTS = DEFAULT_LAYOUT_OPTIONS;
const NO_CLASS: ReadonlyMap<string, Category> = new Map();

function run(tree: LayoutTree): WorldLayout {
  return computeLayout(tree, NO_CLASS, "cwe-v0", OPTS);
}

/**
 * Arbre riche : dossiers imbriqués (⇒ escaliers parent↔enfant de level distinct),
 * fichiers de rôles variés (⇒ `readme-stand`, `file-code`, `file-config`, `file-doc`),
 * plusieurs salles. Base de la plupart des mutations ciblées.
 */
function richTree(): LayoutTree {
  return {
    root: makeDir(
      "",
      [
        makeDir(
          "src",
          [makeDir("src/core", [], ["src/core/index.ts", "src/core/util.ts"].map(makeFile))],
          ["src/app.ts", "src/config.json"].map(makeFile),
        ),
        makeDir("docs", [], ["docs/README.md", "docs/guide.md"].map(makeFile)),
      ],
      ["README.md", "main.ts"].map(makeFile),
    ),
  };
}

/** Racine surchargée de 300 fichiers ⇒ pagination (annexes, portails de chaînage « door »). */
function bigFilesTree(): LayoutTree {
  const files = Array.from({ length: 300 }, (_, i) => makeFile(`f${String(i).padStart(4, "0")}.ts`));
  return { root: makeDir("", [], files) };
}

/** Chaîne imbriquée de profondeur 30 ⇒ level plafonné et `depthFlattened` au-delà de 20. */
function deepTree(): LayoutTree {
  const segments: string[] = [];
  for (let i = 1; i <= 30; i++) segments.push(`d${String(i)}`);
  let node = makeDir(segments.join("/"));
  for (let depth = 29; depth >= 1; depth--) node = makeDir(segments.slice(0, depth).join("/"), [node]);
  return { root: makeDir("", [node]) };
}

// ── Outils de test ──

function nn<T>(v: T | undefined, msg = "valeur absente dans le test"): T {
  if (v === undefined) throw new Error(msg);
  return v;
}

/** `structuredClone` typé : la mutation ciblée porte sur une copie, jamais l'original. */
function clone(layout: WorldLayout): WorldLayout {
  return structuredClone(layout);
}

/** Asserte que `fn` lève une `LayoutInvariantError` dont l'invariant est exactement `code`. */
function expectInvariant(fn: () => void, code: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught, `attendu LayoutInvariantError ${code}, aucune levée`).toBeInstanceOf(LayoutInvariantError);
  if (caught instanceof LayoutInvariantError) expect(caught.invariant).toBe(code);
}

/** Première salle satisfaisant `pred` (échoue le test si aucune). */
function firstRoom(layout: WorldLayout, pred: (n: SpatialNode) => boolean): SpatialNode {
  return nn(layout.spatialNodes.find(pred), "aucune salle ne satisfait le prédicat");
}

// ── I1 — Extent ──

describe("I1 — extent", () => {
  it("un layout conforme passe", () => {
    expect(() => assertExtent(run(bigFilesTree()))).not.toThrow();
  });

  it("une salle plus large que 2·maxRoomHalfExtent lève", () => {
    const layout = clone(run(richTree()));
    const room = nn(layout.spatialNodes[0]);
    room.dimensions.x = 2 * layout.maxRoomHalfExtent + 2; // pair, au-delà du plafond
    expectInvariant(() => assertExtent(layout), "I1");
  });
});

// ── I2 — Visibilité des portes ──

describe("I2 — visibilité", () => {
  it("un layout conforme passe", () => {
    expect(() => assertVisibility(run(richTree()))).not.toThrow();
  });

  it("un objet posé sur le seuil d'un portail lève", () => {
    const layout = clone(run(richTree()));
    const room = firstRoom(layout, (n) => n.objects.length > 0 && n.portals.length > 0);
    const p = nn(room.portals[0]);
    const o = nn(room.objects[0]);
    // Place l'objet exactement sur le seuil du portail : le segment centre→seuil
    // se termine dans l'emprise ⇒ intersection garantie, toute orientation.
    const half = { x: room.dimensions.x / 2, z: room.dimensions.z / 2 };
    const corner = { north: [-half.x, -half.z], east: [half.x, -half.z], south: [half.x, half.z], west: [-half.x, half.z] } as const;
    const dir = { north: [1, 0], east: [0, 1], south: [-1, 0], west: [0, -1] } as const;
    const c = corner[p.wall];
    const d = dir[p.wall];
    o.position.x = nn(c[0]) + nn(d[0]) * p.offset;
    o.position.z = nn(c[1]) + nn(d[1]) * p.offset;
    expectInvariant(() => assertVisibility(layout), "I2");
  });

  it("l'emprise asymétrique orientée est TRANSPOSÉE (sinon le test est aveugle)", () => {
    // Salle 5×5 (20000²), un portail nord (offset 6000 ⇒ seuil (-4000,-10000)).
    // readme-stand (3000×1500) en (-800, 1000) :
    //   - orientation 0/2 (repère modèle, x=3000/z=1500) : AABB z∈[250,1750],
    //     séparée du segment (z ≤ 0) ⇒ AUCUNE intersection.
    //   - orientation 1/3 (transposée, x=1500/z=3000) : AABB z∈[-500,2500] atteint
    //     le segment ⇒ intersection. Oublier la transposition rend I2 aveugle ici.
    const readmeStand: FileObject = {
      sourceNodeId: nodeId("README.md"),
      position: { x: -800, y: 0, z: 1000 },
      orientation: 0,
      kind: "readme-stand",
      footprint: { x: 3000, z: 1500 },
    };
    const room: SpatialNode = {
      id: "s_craft",
      sourceNodeId: nodeId(""),
      role: "hall",
      page: 0,
      pageCount: 1,
      spaceType: "hall",
      theme: "neutral",
      level: 0,
      depthFlattened: false,
      position: { x: 0, y: 0, z: 0 },
      orientation: 0,
      dimensions: { x: 20000, y: 4000, z: 20000 },
      portals: [{ id: "p_craft", toSpatialNodeId: "s_craft", kind: "door", wall: "north", offset: 6000, width: 2000, height: 3000 }],
      objects: [readmeStand],
    };
    const layout: WorldLayout = {
      layoutVersion: 0,
      seed: "cwe-v0",
      normalSpeed: OPTS.normalSpeed,
      maxRoomHalfExtent: OPTS.maxRoomHalfExtent,
      spatialNodes: [room],
    };

    // Repère modèle (orientation 0) : conforme.
    expect(() => assertVisibility(layout), "orientation 0 doit passer").not.toThrow();
    // Quart de tour est (orientation 1) : l'AABB transposée occulte ⇒ lève.
    readmeStand.orientation = 1;
    expectInvariant(() => assertVisibility(layout), "I2");
  });
});

// ── I3 — Non-chevauchement des salles ──

describe("I3 — non-chevauchement", () => {
  it("un layout conforme passe", () => {
    expect(() => assertRoomsDisjoint(run(richTree()))).not.toThrow();
  });

  it("deux salles au même centre lèvent", () => {
    const layout = clone(run(richTree()));
    const a = nn(layout.spatialNodes[0]);
    const b = nn(layout.spatialNodes[1]);
    b.position = { x: a.position.x, y: a.position.y, z: a.position.z }; // AABB confondues
    expectInvariant(() => assertRoomsDisjoint(layout), "I3");
  });
});

// ── I4 — Profondeur de rendu ──

describe("I4 — profondeur de rendu", () => {
  it("une chaîne profonde (level plafonné, depthFlattened) passe", () => {
    const t = deepTree();
    expect(() => assertRenderDepth(run(t), t, OPTS)).not.toThrow();
    // La fixture exerce bien le plafonnement (au moins une salle aplatie).
    expect(run(t).spatialNodes.some((n) => n.depthFlattened)).toBe(true);
  });

  it("un depthFlattened incohérent avec la profondeur source lève", () => {
    const t = richTree();
    const layout = clone(run(t));
    const room = nn(layout.spatialNodes[0]);
    room.depthFlattened = !room.depthFlattened; // dossiers peu profonds ⇒ attendu false
    expectInvariant(() => assertRenderDepth(layout, t, OPTS), "I4");
  });

  it("un level ≠ min(depth, maxRenderDepth) lève", () => {
    const t = richTree();
    const layout = clone(run(t));
    const room = nn(layout.spatialNodes[0]);
    room.level = room.level + 1;
    expectInvariant(() => assertRenderDepth(layout, t, OPTS), "I4");
  });
});

// ── I5 — Connexité depuis le hall ──

describe("I5 — connexité", () => {
  it("un layout conforme passe", () => {
    expect(() => assertConnected(run(richTree()))).not.toThrow();
  });

  it("une salle privée de tous ses portails entrants lève", () => {
    const layout = clone(run(richTree()));
    const target = firstRoom(layout, (n) => n.role === "primary");
    for (const n of layout.spatialNodes) {
      n.portals = n.portals.filter((p) => p.toSpatialNodeId !== target.id);
    }
    expectInvariant(() => assertConnected(layout), "I5");
  });
});

// ── I6 — Réciprocité des portails ──

describe("I6 — réciprocité", () => {
  it("un layout conforme passe", () => {
    expect(() => assertPortalReciprocity(run(richTree()))).not.toThrow();
  });

  it("un portail sans vis-à-vis lève", () => {
    const layout = clone(run(richTree()));
    const a = firstRoom(layout, (n) => n.portals.length > 0);
    const p = nn(a.portals[0]);
    const b = firstRoom(layout, (n) => n.id === p.toSpatialNodeId);
    b.portals = b.portals.filter((q) => !(q.toSpatialNodeId === a.id && q.kind === p.kind));
    expectInvariant(() => assertPortalReciprocity(layout), "I6");
  });
});

// ── I7 — FR-005 : cardinalité des salles ──

describe("I7 — cardinalité des salles", () => {
  it("un layout paginé conforme passe (pages 0…pageCount−1)", () => {
    const t = bigFilesTree();
    expect(() => assertRoomCardinality(run(t), t)).not.toThrow();
  });

  it("un dossier sans salle identité (primary rétrogradé en annex) lève", () => {
    const t = richTree();
    const layout = clone(run(t));
    const primary = firstRoom(layout, (n) => n.role === "primary");
    primary.role = "annex"; // le dossier n'a plus aucune salle hall|primary
    expectInvariant(() => assertRoomCardinality(layout, t), "I7");
  });

  it("un hall porté par un dossier non racine lève", () => {
    const t = richTree();
    const layout = clone(run(t));
    const primary = firstRoom(layout, (n) => n.role === "primary");
    primary.role = "hall"; // deux halls, et un hall hors racine
    expectInvariant(() => assertRoomCardinality(layout, t), "I7");
  });
});

// ── I8 — Couverture des fichiers (bijection) ──

describe("I8 — bijection des fichiers", () => {
  it("un layout conforme passe", () => {
    const t = richTree();
    expect(() => assertFileBijection(run(t), t)).not.toThrow();
  });

  it("un fichier non exclu sans FileObject lève", () => {
    const t = richTree();
    const layout = clone(run(t));
    const room = firstRoom(layout, (n) => n.objects.length > 0);
    room.objects.pop(); // un fichier n'a plus d'objet
    expectInvariant(() => assertFileBijection(layout, t), "I8");
  });

  it("un objet fichier en double lève", () => {
    const t = richTree();
    const layout = clone(run(t));
    const room = firstRoom(layout, (n) => n.objects.length > 0);
    room.objects.push(nn(room.objects[0])); // même sourceNodeId deux fois
    expectInvariant(() => assertFileBijection(layout, t), "I8");
  });
});

// ── I9 — Emprises conformes à la table ──

describe("I9 — emprises", () => {
  it("un layout conforme passe", () => {
    expect(() => assertFootprints(run(richTree()), OPTS)).not.toThrow();
  });

  it("une emprise divergente de KIND_FOOTPRINT lève", () => {
    const layout = clone(run(richTree()));
    const room = firstRoom(layout, (n) => n.objects.length > 0);
    nn(room.objects[0]).footprint.x = 3500; // ≠ table pour tout kind
    expectInvariant(() => assertFootprints(layout, OPTS), "I9");
  });
});

// ── I10 — PortalKind produits en v0 ──

describe("I10 — kinds de portails", () => {
  it("un layout conforme passe", () => {
    expect(() => assertPortalKinds(run(richTree()))).not.toThrow();
  });

  it("un kind réservé (elevator) lève", () => {
    const layout = clone(run(richTree()));
    const room = firstRoom(layout, (n) => n.portals.length > 0);
    nn(room.portals[0]).kind = "elevator";
    expectInvariant(() => assertPortalKinds(layout), "I10");
  });

  it("un escalier requalifié en porte (kind incohérent avec l'écart de level) lève", () => {
    const layout = clone(run(richTree()));
    const room = firstRoom(layout, (n) => n.portals.some((p) => p.kind === "stair"));
    nn(room.portals.find((p) => p.kind === "stair")).kind = "door"; // levels distincts mais « door »
    expectInvariant(() => assertPortalKinds(layout), "I10");
  });
});

// ── I11 — Intégrité entière ──

describe("I11 — intégrité entière", () => {
  it("un layout conforme passe", () => {
    expect(() => assertSafeIntegers(run(richTree()))).not.toThrow();
  });

  it("un flottant qui a fui lève", () => {
    const layout = clone(run(richTree()));
    nn(layout.spatialNodes[0]).position.x = 0.5; // non entier
    expectInvariant(() => assertSafeIntegers(layout), "I11");
  });

  it("un entier non sûr lève", () => {
    const layout = clone(run(richTree()));
    nn(layout.spatialNodes[0]).dimensions.z = Number.MAX_SAFE_INTEGER + 1;
    expectInvariant(() => assertSafeIntegers(layout), "I11");
  });
});

// ── I12 — Portes dans les murs ──

describe("I12 — portes dans les murs", () => {
  it("un layout conforme passe", () => {
    expect(() => assertPortalsInWalls(run(richTree()))).not.toThrow();
  });

  it("un offset qui déborde le mur lève", () => {
    const layout = clone(run(richTree()));
    const room = firstRoom(layout, (n) => n.portals.length > 0);
    nn(room.portals[0]).offset = 0; // 0 < width/2 = 1000
    expectInvariant(() => assertPortalsInWalls(layout), "I12");
  });
});

// ── Agrégat assertLayoutInvariants ──

describe("assertLayoutInvariants — agrégat", () => {
  const fixtures: { readonly name: string; readonly make: () => LayoutTree }[] = [
    { name: "arbre riche", make: richTree },
    { name: "pagination (300 fichiers)", make: bigFilesTree },
    { name: "profondeur 30", make: deepTree },
    { name: "dossier vide", make: () => ({ root: makeDir("", [], []) }) },
    { name: "un seul fichier", make: () => ({ root: makeDir("", [], [makeFile("README.md")]) }) },
    { name: "200 sous-dossiers", make: () => ({ root: makeDir("", Array.from({ length: 200 }, (_, i) => makeDir(`d${String(i).padStart(3, "0")}`)), []) }) },
  ];

  it("passe sur tous les artefacts produits par computeLayout", () => {
    for (const f of fixtures) {
      const t = f.make();
      expect(() => assertLayoutInvariants(run(t), t, OPTS), f.name).not.toThrow();
    }
  });

  it("relaie l'invariant violé (I1) sur mutation de dimensions", () => {
    const t = richTree();
    const layout = clone(run(t));
    nn(layout.spatialNodes[0]).dimensions.x = 2 * layout.maxRoomHalfExtent + 2;
    expectInvariant(() => assertLayoutInvariants(layout, t, OPTS), "I1");
  });

  it("relaie l'invariant violé (I8) sur retrait d'objet", () => {
    const t = richTree();
    const layout = clone(run(t));
    firstRoom(layout, (n) => n.objects.length > 0).objects.pop();
    expectInvariant(() => assertLayoutInvariants(layout, t, OPTS), "I8");
  });
});
