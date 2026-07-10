import { describe, it, expect } from "vitest";
import {
  parseWorld,
  loadWorld,
  assertSupportedSchemaVersion,
  WorldLoadException,
} from "./parse.js";
import { UnsupportedSchemaVersionError } from "./errors.js";
import { canonicalStringify } from "./canonical.js";
import { type World } from "./schema.js";
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

describe("assertSupportedSchemaVersion (contrat §9.1, FR-027)", () => {
  it("version supportée : renvoie la version", () => {
    expect(assertSupportedSchemaVersion(makeMinimalWorld())).toBe(0);
  });

  it("version inconnue (au-delà des supportées) : lève UnsupportedSchemaVersionError, PAS une erreur Zod", () => {
    const world = makeMinimalWorld();
    // Supportées = {0, 1} depuis l'activation phase 1 ; 2 est la première inconnue.
    const bad = { ...world, manifest: { ...world.manifest, schemaVersion: 2 } };
    expect(() => assertSupportedSchemaVersion(bad)).toThrow(UnsupportedSchemaVersionError);
    try {
      assertSupportedSchemaVersion(bad);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedSchemaVersionError);
      if (error instanceof UnsupportedSchemaVersionError) {
        expect(error.kind).toBe("unsupported-schema-version");
        expect(error.found).toBe(2);
        expect(error.supported).toEqual([0, 1]);
        // Message explicite et exploitable : contient version trouvée et supportées.
        expect(error.message).toContain("2");
        expect(error.message).toContain("1");
      }
    }
  });

  it("schemaVersion absent ou non numérique : found = NaN, non supporté", () => {
    expect(() => assertSupportedSchemaVersion({})).toThrow(UnsupportedSchemaVersionError);
    try {
      assertSupportedSchemaVersion({ manifest: { schemaVersion: "0" } });
    } catch (error) {
      if (error instanceof UnsupportedSchemaVersionError) {
        expect(Number.isNaN(error.found)).toBe(true);
      }
    }
  });
});

describe("parseWorld (variante lançante, pipeline)", () => {
  it("artefact minimal valide : renvoie le World", () => {
    const world = parseWorld(makeMinimalWorld());
    expect(world.manifest.schemaVersion).toBe(0);
    expect(world.nodes).toHaveLength(1);
  });

  it("version inconnue : lève UnsupportedSchemaVersionError AVANT toute validation Zod", () => {
    const world = makeMinimalWorld();
    // Corps par ailleurs cassé : la version doit être refusée en premier.
    const bad = { manifest: { schemaVersion: 99 }, garbage: true };
    expect(() => parseWorld(bad)).toThrow(UnsupportedSchemaVersionError);
    // Ce n'est donc PAS une WorldLoadException de schéma.
    try {
      parseWorld(bad);
    } catch (error) {
      expect(error).not.toBeInstanceOf(WorldLoadException);
    }
    void world;
  });

  it("version bonne, corps invalide : lève WorldLoadException (kind invalid-schema)", () => {
    const world = makeMinimalWorld();
    const bad = { ...world, unexpected: 1 };
    try {
      parseWorld(bad);
      throw new Error("attendu : levée");
    } catch (error) {
      expect(error).toBeInstanceOf(WorldLoadException);
      if (error instanceof WorldLoadException) {
        expect(error.error.kind).toBe("invalid-schema");
      }
    }
  });

  it("entité réservée présente : rejetée", () => {
    const bad = { ...makeMinimalWorld(), symbols: [] };
    expect(() => parseWorld(bad)).toThrow(WorldLoadException);
  });
});

describe("loadWorld (variante Result, client — contrat §9.1)", () => {
  it("JSON valide et conforme : ok true", () => {
    const raw = canonicalStringify(makeMinimalWorld());
    const res = loadWorld(raw);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.world.repository.owner).toBe("acme");
  });

  it("JSON illisible : malformed-json", () => {
    const res = loadWorld("{ ceci n'est pas du JSON");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe("malformed-json");
  });

  it("version inconnue : unsupported-schema-version (jamais invalid-schema)", () => {
    const world = makeMinimalWorld();
    const raw = canonicalStringify({ ...world, manifest: { ...world.manifest, schemaVersion: 7 } });
    const res = loadWorld(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe("unsupported-schema-version");
      if (res.error.kind === "unsupported-schema-version") {
        expect(res.error.found).toBe(7);
        expect(res.error.supported).toEqual([0, 1]);
      }
    }
  });

  it("version bonne, corps malformé : invalid-schema avec issues", () => {
    const world = makeMinimalWorld();
    const raw = canonicalStringify({ ...world, unexpected: 1 });
    const res = loadWorld(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe("invalid-schema");
      if (res.error.kind === "invalid-schema") {
        expect(res.error.issues.length).toBeGreaterThan(0);
      }
    }
  });
});
