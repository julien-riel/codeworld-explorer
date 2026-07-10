import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_SCHEMA_VERSIONS, UnsupportedSchemaVersionError } from "@codeworld/world-schema";
import {
  fileContentUrl,
  HttpError,
  loadGallery,
  loadWorld,
  normalizeWorldError,
  worldUrl,
} from "./loader";

// Artefact réel committé (public/worlds/schema/world.json), pour un chargement de bout en bout.
const worldJson = readFileSync(
  fileURLToPath(new URL("../../public/worlds/schema/world.json", import.meta.url)),
  "utf8",
);

/** Simule `fetch` : réponse minimale exposant `ok`, `status`, `text()`. */
function stubFetch(body: string, init: { ok: boolean; status: number }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: init.ok,
        status: init.status,
        text: () => Promise.resolve(body),
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("worldUrl / fileContentUrl", () => {
  it("compose des URLs statiques sous worlds/", () => {
    expect(worldUrl("schema/world.json")).toBe("worlds/schema/world.json");
    expect(fileContentUrl("schema", "abc123")).toBe("worlds/schema/files/abc123");
  });
});

describe("loadWorld — monde valide", () => {
  it("charge et valide l'artefact réel", async () => {
    stubFetch(worldJson, { ok: true, status: 200 });
    const world = await loadWorld("schema/world.json");
    // Version-agnostique : l'artefact committé peut être v0 (phase 0) ou v1 (phase 1
    // dès que l'analyseur émet des symboles) ; les deux sont supportés (FR-027).
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain(world.manifest.schemaVersion);
    expect(world.layout.spatialNodes.length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledWith("worlds/schema/world.json");
  });

  it("accepte un artefact v1 porteur de symbols/relations sans modifier la scène (forward-compat)", async () => {
    // On dérive un artefact v1 de l'artefact réel : bump de version + entités phase 1.
    // Le client doit le charger tel quel ; la scène 3D n'en consomme aucune clé.
    const base = JSON.parse(worldJson) as Record<string, unknown> & {
      manifest: { schemaVersion: number };
    };
    base.manifest.schemaVersion = 1;
    base.symbols = [];
    base.relations = [];
    stubFetch(JSON.stringify(base), { ok: true, status: 200 });
    const world = await loadWorld("schema/world.json");
    expect(world.manifest.schemaVersion).toBe(1);
    expect(world.symbols).toEqual([]);
    expect(world.relations).toEqual([]);
  });
});

describe("loadWorld — version de schéma inconnue (FR-027)", () => {
  it("REJETTE avec l'erreur typée du contrat, pas un rejet non géré", async () => {
    const bumped = JSON.parse(worldJson) as { manifest: { schemaVersion: number } };
    bumped.manifest.schemaVersion = 99;
    stubFetch(JSON.stringify(bumped), { ok: true, status: 200 });

    // Le rejet est TYPÉ et intercepté proprement (aucune UnhandledRejection).
    await expect(loadWorld("schema/world.json")).rejects.toBeInstanceOf(
      UnsupportedSchemaVersionError,
    );
  });

  it("normalise l'erreur de version en état affichable discriminé", async () => {
    const bumped = JSON.parse(worldJson) as { manifest: { schemaVersion: number } };
    bumped.manifest.schemaVersion = 99;
    stubFetch(JSON.stringify(bumped), { ok: true, status: 200 });

    const error = await loadWorld("schema/world.json").catch((e: unknown) => e);
    const normalized = normalizeWorldError(error);
    expect(normalized.kind).toBe("unsupported-schema-version");
    if (normalized.kind === "unsupported-schema-version") {
      expect(normalized.found).toBe(99);
      expect(normalized.supported).toContain(0);
    }
  });
});

describe("loadWorld — défaillances normalisées", () => {
  it("JSON illisible → kind malformed-json", async () => {
    stubFetch("{ pas du json", { ok: true, status: 200 });
    const error = await loadWorld("schema/world.json").catch((e: unknown) => e);
    expect(normalizeWorldError(error).kind).toBe("malformed-json");
  });

  it("HTTP 404 → HttpError → kind network avec statut", async () => {
    stubFetch("not found", { ok: false, status: 404 });
    const error = await loadWorld("schema/world.json").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    const normalized = normalizeWorldError(error);
    expect(normalized.kind).toBe("network");
    if (normalized.kind === "network") {
      expect(normalized.status).toBe(404);
    }
  });

  it("schéma invalide → kind invalid-schema", async () => {
    const broken = JSON.parse(worldJson) as { nodes: unknown };
    broken.nodes = "pas un tableau";
    stubFetch(JSON.stringify(broken), { ok: true, status: 200 });
    const error = await loadWorld("schema/world.json").catch((e: unknown) => e);
    expect(normalizeWorldError(error).kind).toBe("invalid-schema");
  });
});

describe("loadGallery", () => {
  it("charge et rend l'index de galerie", async () => {
    stubFetch(
      JSON.stringify({ schemaVersion: 0, worlds: [{ name: "schema", path: "schema" }] }),
      { ok: true, status: 200 },
    );
    const gallery = await loadGallery();
    expect(gallery.worlds).toHaveLength(1);
    expect(gallery.worlds[0]?.name).toBe("schema");
    expect(fetch).toHaveBeenCalledWith("worlds/index.json");
  });
});
