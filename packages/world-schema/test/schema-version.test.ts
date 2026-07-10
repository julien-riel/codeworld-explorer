/**
 * Suite 5 — FR-027 (chargement et refus de version, contrat §9). `parseWorld` sur un
 * artefact de `schemaVersion` INCONNUE lève `UnsupportedSchemaVersionError` (jamais
 * une erreur Zod : le refus de version précède la validation) ; sur un artefact
 * VALIDE, réussit et retourne un objet typé. On couvre aussi la variante Result
 * `loadWorld` (JSON illisible / version non supportée / succès).
 */

import { describe, it, expect } from "vitest";
import {
  parseWorld,
  loadWorld,
  WorldLoadException,
  UnsupportedSchemaVersionError,
  canonicalStringify,
} from "../src/index";
import { FIXTURES, buildWorld } from "./fixtures";

const tiny = FIXTURES[0];
if (tiny === undefined) throw new Error("fixture tiny absente");

describe("FR-027 : parseWorld réussit sur un artefact v0 valide", () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} : parseWorld retourne un World typé`, () => {
      const world = buildWorld(fx);
      const parsed = parseWorld(world);
      expect(parsed.manifest.schemaVersion).toBe(0);
      expect(parsed.layout.spatialNodes.length).toBeGreaterThan(0);
      expect(parsed.nodes.length).toBe(world.nodes.length);
      // Round-trip via octets canoniques (loadWorld sur une chaîne).
      const result = loadWorld(canonicalStringify(world));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.world.search.documents.length).toBe(world.nodes.length);
    });
  }
});

describe("FR-027 : v1 est supportée en lecture (activation phase 1, ADR-0004)", () => {
  it("un artefact de schemaVersion 1 sans entité réservée est accepté", () => {
    const valid = buildWorld(tiny);
    const v1: unknown = { ...valid, manifest: { ...valid.manifest, schemaVersion: 1 } };
    const parsed = parseWorld(v1);
    expect(parsed.manifest.schemaVersion).toBe(1);
  });
});

describe("FR-027 : parseWorld refuse une version inconnue AVANT Zod", () => {
  it("première version au-delà des supportées (2) → UnsupportedSchemaVersionError (pas une erreur Zod)", () => {
    const valid = buildWorld(tiny);
    const bumped: unknown = { ...valid, manifest: { ...valid.manifest, schemaVersion: 2 } };
    expect(() => parseWorld(bumped)).toThrow(UnsupportedSchemaVersionError);
    try {
      parseWorld(bumped);
      expect.unreachable("parseWorld aurait dû lever");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedSchemaVersionError);
      if (error instanceof UnsupportedSchemaVersionError) {
        expect(error.found).toBe(2);
        expect(error.supported).toContain(1);
      }
    }
  });

  it("schemaVersion très supérieure (99) → UnsupportedSchemaVersionError", () => {
    const valid = buildWorld(tiny);
    const future: unknown = { ...valid, manifest: { ...valid.manifest, schemaVersion: 99 } };
    expect(() => parseWorld(future)).toThrow(UnsupportedSchemaVersionError);
  });

  it("schemaVersion absente → UnsupportedSchemaVersionError (found NaN)", () => {
    const valid = buildWorld(tiny);
    const noVersion: unknown = {
      ...valid,
      manifest: {
        analyzerVersion: valid.manifest.analyzerVersion,
        layoutVersion: valid.manifest.layoutVersion,
        configurationHash: valid.manifest.configurationHash,
      },
    };
    try {
      parseWorld(noVersion);
      expect.unreachable("parseWorld aurait dû lever");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedSchemaVersionError);
      if (error instanceof UnsupportedSchemaVersionError) expect(Number.isNaN(error.found)).toBe(true);
    }
  });
});

describe("FR-027 : version bonne mais corps invalide → erreur Zod, pas de refus de version", () => {
  it("nodes non-tableau → WorldLoadException(kind: invalid-schema)", () => {
    const valid = buildWorld(tiny);
    const corrupt: unknown = { ...valid, nodes: "pas-un-tableau" };
    try {
      parseWorld(corrupt);
      expect.unreachable("parseWorld aurait dû lever");
    } catch (error) {
      expect(error).toBeInstanceOf(WorldLoadException);
      if (error instanceof WorldLoadException) {
        expect(error.error.kind).toBe("invalid-schema");
      }
    }
  });
});

describe("FR-027 : loadWorld (variante Result) discrimine les trois cas", () => {
  it("JSON illisible → kind malformed-json", () => {
    const result = loadWorld("{ ceci n'est pas du json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("malformed-json");
  });

  it("version non supportée → kind unsupported-schema-version (found renseigné)", () => {
    const valid = buildWorld(tiny);
    const raw = canonicalStringify({ ...valid, manifest: { ...valid.manifest, schemaVersion: 5 } });
    const result = loadWorld(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unsupported-schema-version");
      if (result.error.kind === "unsupported-schema-version") expect(result.error.found).toBe(5);
    }
  });

  it("artefact valide → ok:true et World typé", () => {
    const result = loadWorld(canonicalStringify(buildWorld(tiny)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.world.manifest.schemaVersion).toBe(0);
  });
});
