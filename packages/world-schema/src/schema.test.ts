import { describe, it, expect } from "vitest";
import { WorldSchema, SourceNodeSchema, SearchDocSchema, type World } from "./schema.js";
import { nodeId, spatialNodeId } from "./ids.js";
import { sha256Hex } from "./hash/sha256.js";

/** Artefact v0 minimal mais valide au sens du schéma (§3). */
function makeMinimalWorld(): World {
  const rootId = nodeId("");
  return {
    manifest: {
      schemaVersion: 0,
      analyzerVersion: "0.1.0",
      layoutVersion: 0,
      configurationHash: sha256Hex("config-v0"),
    },
    repository: {
      provider: "github",
      owner: "acme",
      name: "repo",
      url: "https://github.com/acme/repo",
      defaultBranch: "main",
      license: null,
    },
    snapshot: { commitSha: "0".repeat(40), branch: "main", committedAt: "2026-07-09T12:32:07Z" },
    nodes: [
      { id: rootId, parentId: null, path: "", name: "repo", nodeType: "directory", depth: 0, childCount: 0 },
    ],
    classifications: [
      { sourceNodeId: rootId, category: "root", confidence: 1000, decisionSource: "rule", evidence: [], overriddenByConfig: false },
    ],
    layout: {
      layoutVersion: 0,
      seed: "cwe-v0",
      normalSpeed: 6000,
      maxRoomHalfExtent: 48000,
      spatialNodes: [
        {
          id: spatialNodeId(rootId, "hall", 0),
          sourceNodeId: rootId,
          role: "hall",
          page: 0,
          pageCount: 1,
          spaceType: "hall",
          theme: "project-hall",
          level: 0,
          depthFlattened: false,
          position: { x: 0, y: 0, z: 0 },
          orientation: 0,
          dimensions: { x: 12000, y: 6000, z: 12000 },
          portals: [],
          objects: [],
        },
      ],
    },
    search: {
      version: 0,
      documents: [{ ref: rootId, path: "", name: "repo", kind: "directory", category: "root" }],
    },
  };
}

describe("WorldSchema (contrat §3, §2.3)", () => {
  it("un artefact minimal valide passe", () => {
    const res = WorldSchema.safeParse(makeMinimalWorld());
    expect(res.success).toBe(true);
  });

  it("rejette une clé inconnue de premier niveau (.strict())", () => {
    const world = { ...makeMinimalWorld(), unexpected: 1 };
    const res = WorldSchema.safeParse(world);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    }
  });

  it("rejette une clé inconnue dans un objet imbriqué (.strict())", () => {
    const world = makeMinimalWorld();
    const bad = {
      ...world,
      manifest: { ...world.manifest, extra: true },
    };
    expect(WorldSchema.safeParse(bad).success).toBe(false);
  });

  it("rejette un champ optionnel émis à null (contrat §2.3)", () => {
    const world = makeMinimalWorld();
    const node = world.nodes[0];
    if (node === undefined) throw new Error("fixture invalide");
    // `language` est optionnel : présent → string, sinon OMIS ; jamais null.
    const withNull = { ...node, language: null };
    expect(SourceNodeSchema.safeParse(withNull).success).toBe(false);
  });

  it("accepte l'omission d'un champ optionnel", () => {
    const world = makeMinimalWorld();
    const doc = world.search.documents[0];
    if (doc === undefined) throw new Error("fixture invalide");
    // `language` absent : valide.
    expect(SearchDocSchema.safeParse(doc).success).toBe(true);
    // `language` présent en string : valide.
    expect(SearchDocSchema.safeParse({ ...doc, language: "ts" }).success).toBe(true);
  });

  it("exige que parentId soit null OU un nodeId (null a un sens propre)", () => {
    const world = makeMinimalWorld();
    const node = world.nodes[0];
    if (node === undefined) throw new Error("fixture invalide");
    expect(SourceNodeSchema.safeParse({ ...node, parentId: null }).success).toBe(true);
    expect(SourceNodeSchema.safeParse({ ...node, parentId: "not-an-id" }).success).toBe(false);
  });

  it("rejette un flottant là où un entier est requis (contrat §2.2)", () => {
    const world = makeMinimalWorld();
    const node = world.nodes[0];
    if (node === undefined) throw new Error("fixture invalide");
    expect(SourceNodeSchema.safeParse({ ...node, depth: 1.5 }).success).toBe(false);
  });

  it("borne manifest.schemaVersion à {0, 1} (défense en profondeur, contrat §9.1)", () => {
    const world = makeMinimalWorld();
    // v1 sans entité réservée : accepté (l'activation phase 1 n'exige pas leur présence).
    expect(WorldSchema.safeParse({ ...world, manifest: { ...world.manifest, schemaVersion: 1 } }).success).toBe(true);
    // v2 : hors de l'union — rejeté par Zod (le refus de version le précède via parseWorld).
    expect(WorldSchema.safeParse({ ...world, manifest: { ...world.manifest, schemaVersion: 2 } }).success).toBe(false);
  });
});

describe("garde conditionnelle des entités de phase 1 (contrat §3.9, ADR-0004)", () => {
  /** Artefact v1 minimal : mêmes formes que v0, `symbols`/`relations` présents et vides. */
  function makeV1World(): World {
    const w = makeMinimalWorld();
    return { ...w, manifest: { ...w.manifest, schemaVersion: 1 }, symbols: [], relations: [] };
  }

  it("v0 : absence des 4 entités réservées — valide", () => {
    expect(WorldSchema.safeParse(makeMinimalWorld()).success).toBe(true);
  });

  for (const key of ["symbols", "relations", "summaries", "tour"] as const) {
    it(`v0 avec ${key} présent : rejeté`, () => {
      const world = { ...makeMinimalWorld(), [key]: key === "tour" ? { title: "t", steps: [], generatedBy: "x" } : [] };
      const res = WorldSchema.safeParse(world);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path[0] === key)).toBe(true);
      }
    });
  }

  it("v1 avec symbols/relations (même vides) : accepté", () => {
    expect(WorldSchema.safeParse(makeV1World()).success).toBe(true);
  });

  for (const key of ["summaries", "tour"] as const) {
    it(`v1 avec ${key} (réservé sprint 7) : rejeté`, () => {
      const bad = { ...makeV1World(), [key]: key === "tour" ? { title: "t", steps: [], generatedBy: "x" } : [] };
      const res = WorldSchema.safeParse(bad);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path[0] === key)).toBe(true);
      }
    });
  }
});
