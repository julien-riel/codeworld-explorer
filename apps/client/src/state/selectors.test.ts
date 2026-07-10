import { describe, expect, it } from "vitest";
import type {
  FileObject,
  ObjectKind,
  Portal,
  SourceNode,
  SpatialNode,
  Wall,
  World,
} from "@codeworld/world-schema";
import {
  activeZoneIds,
  ancestorChain,
  breadcrumb,
  buildWorldIndex,
  neighbors,
  resolveTeleport,
  roomOfSourceNode,
} from "./selectors";

// ── Fabriques de fixture (World typé minimal ; les valeurs ne franchissent pas Zod) ──

function dir(id: string, parentId: string | null, name: string, depth: number): SourceNode {
  return { id, parentId, path: name, name, nodeType: "directory", depth };
}

function file(id: string, parentId: string, name: string, depth: number): SourceNode {
  return { id, parentId, path: name, name, nodeType: "file", depth };
}

function portal(id: string, to: string, wall: Wall): Portal {
  return { id, toSpatialNodeId: to, kind: "door", wall, offset: 0, width: 2000, height: 3000 };
}

function obj(sourceNodeId: string, kind: ObjectKind): FileObject {
  return {
    sourceNodeId,
    position: { x: 0, y: 0, z: 0 },
    orientation: 0,
    kind,
    footprint: { x: 2000, z: 2000 },
  };
}

function room(
  id: string,
  sourceNodeId: string,
  role: SpatialNode["role"],
  portals: Portal[],
  objects: FileObject[],
): SpatialNode {
  return {
    id,
    sourceNodeId,
    role,
    page: 0,
    pageCount: 1,
    spaceType: role === "hall" ? "hall" : "room",
    theme: "neutral",
    level: 0,
    depthFlattened: false,
    position: { x: 0, y: 0, z: 0 },
    orientation: 0,
    dimensions: { x: 20000, y: 4000, z: 20000 },
    portals,
    objects,
  };
}

function mkWorld(nodes: SourceNode[], spatialNodes: SpatialNode[]): World {
  return {
    manifest: { schemaVersion: 0, analyzerVersion: "test", layoutVersion: 0, configurationHash: "x" },
    repository: {
      provider: "github",
      owner: "acme",
      name: "repo",
      url: "https://example.test",
      defaultBranch: "main",
      license: null,
    },
    snapshot: { commitSha: "deadbeef", branch: "main", committedAt: "1970-01-01T00:00:00Z" },
    nodes,
    classifications: [],
    layout: {
      layoutVersion: 0,
      seed: "seed",
      normalSpeed: 6000,
      maxRoomHalfExtent: 48000,
      spatialNodes,
    },
    search: { version: 0, documents: [] },
  };
}

// Arbre : root → { src → {a, b}, docs → {readme} } ; 3 salles reliées en étoile au hall.
const nodes: SourceNode[] = [
  dir("n_root", null, "root", 0),
  dir("n_src", "n_root", "src", 1),
  dir("n_docs", "n_root", "docs", 1),
  file("n_a", "n_src", "a.ts", 2),
  file("n_b", "n_src", "b.ts", 2),
  file("n_readme", "n_docs", "README.md", 2),
];

const spatialNodes: SpatialNode[] = [
  room("s_hall", "n_root", "hall", [portal("p_1", "s_src", "north"), portal("p_2", "s_docs", "east")], []),
  room("s_src", "n_src", "primary", [portal("p_3", "s_hall", "south")], [obj("n_a", "file-code"), obj("n_b", "file-code")]),
  room("s_docs", "n_docs", "primary", [portal("p_4", "s_hall", "west")], [obj("n_readme", "readme-stand")]),
];

const index = buildWorldIndex(mkWorld(nodes, spatialNodes));

describe("ancestorChain / breadcrumb", () => {
  it("remonte de la racine au fichier, inclus, dans l'ordre du fil d'Ariane", () => {
    expect(ancestorChain(index, "n_a").map((n) => n.id)).toEqual(["n_root", "n_src", "n_a"]);
  });

  it("rend juste la racine pour la racine", () => {
    expect(ancestorChain(index, "n_root").map((n) => n.id)).toEqual(["n_root"]);
  });

  it("rend une chaîne vide pour un nœud inconnu", () => {
    expect(ancestorChain(index, "n_nope")).toEqual([]);
  });

  it("breadcrumb est l'alias d'ancestorChain", () => {
    expect(breadcrumb).toBe(ancestorChain);
  });
});

describe("neighbors", () => {
  it("liste les salles atteignables par portail, sans elle-même", () => {
    expect(neighbors(index, "s_hall").map((s) => s.id)).toEqual(["s_src", "s_docs"]);
    expect(neighbors(index, "s_src").map((s) => s.id)).toEqual(["s_hall"]);
  });

  it("rend une liste vide pour une salle inconnue", () => {
    expect(neighbors(index, "s_nope")).toEqual([]);
  });

  it("activeZoneIds = salle courante + voisines (zone à monter)", () => {
    expect(activeZoneIds(index, "s_hall")).toEqual(["s_hall", "s_src", "s_docs"]);
  });
});

describe("roomOfSourceNode", () => {
  it("trouve la salle d'un fichier via ses objets", () => {
    expect(roomOfSourceNode(index, "n_a")?.id).toBe("s_src");
    expect(roomOfSourceNode(index, "n_readme")?.id).toBe("s_docs");
  });

  it("trouve la salle d'un dossier via son sourceNodeId", () => {
    expect(roomOfSourceNode(index, "n_src")?.id).toBe("s_src");
    expect(roomOfSourceNode(index, "n_root")?.id).toBe("s_hall");
  });

  it("rend undefined pour un nœud sans salle", () => {
    expect(roomOfSourceNode(index, "n_nope")).toBeUndefined();
  });
});

describe("resolveTeleport", () => {
  it("résout un fichier vers sa salle et le sélectionne", () => {
    expect(resolveTeleport(index, { kind: "node", sourceNodeId: "n_a" })).toEqual({
      spatialNodeId: "s_src",
      selectedFileNodeId: "n_a",
    });
  });

  it("résout un dossier vers sa salle, sans sélection", () => {
    expect(resolveTeleport(index, { kind: "node", sourceNodeId: "n_docs" })).toEqual({
      spatialNodeId: "s_docs",
      selectedFileNodeId: null,
    });
  });

  it("résout une salle directement, sans sélection", () => {
    expect(resolveTeleport(index, { kind: "room", spatialNodeId: "s_hall" })).toEqual({
      spatialNodeId: "s_hall",
      selectedFileNodeId: null,
    });
  });

  it("rend undefined pour une cible inexistante", () => {
    expect(resolveTeleport(index, { kind: "node", sourceNodeId: "n_nope" })).toBeUndefined();
    expect(resolveTeleport(index, { kind: "room", spatialNodeId: "s_nope" })).toBeUndefined();
  });
});

describe("hall", () => {
  it("l'index expose la salle hall unique", () => {
    expect(index.hall?.id).toBe("s_hall");
  });
});
