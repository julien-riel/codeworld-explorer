import { describe, it, expect } from "vitest";

import {
  ManifestSchema,
  parseManifest,
  emptyManifest,
  type AssetProvenance,
} from "./manifest.js";

const validAsset: AssetProvenance = {
  id: "crate-small",
  name: "Small Crate",
  source: "kenney",
  pack: "Survival Kit",
  author: "Kenney",
  license: "CC0-1.0",
  url: "https://kenney.nl/assets/survival-kit",
  sha256: "a".repeat(64),
  transforms: ["scale-normalize", "palette-remap", "quantize"],
};

describe("ManifestSchema", () => {
  it("valide le manifeste vide", () => {
    expect(() => parseManifest(emptyManifest())).not.toThrow();
    expect(parseManifest({ assets: [] })).toEqual({ assets: [] });
  });

  it("valide un asset CC0 conforme", () => {
    const result = parseManifest({ assets: [validAsset] });
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]!.license).toBe("CC0-1.0");
  });

  it("REJETTE un asset sous licence CC-BY", () => {
    const parsed = ManifestSchema.safeParse({
      assets: [{ ...validAsset, license: "CC-BY-4.0" }],
    });
    expect(parsed.success).toBe(false);
    const message = parsed.error!.issues.map((i) => i.message).join(" | ");
    expect(message).toContain("CC0-1.0");
  });

  it("REJETTE un asset sans sha256", () => {
    const { sha256: _omit, ...noHash } = validAsset;
    const parsed = ManifestSchema.safeParse({ assets: [noHash] });
    expect(parsed.success).toBe(false);
  });

  it("REJETTE un sha256 mal formé", () => {
    const parsed = ManifestSchema.safeParse({
      assets: [{ ...validAsset, sha256: "XYZ" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("REJETTE une URL invalide", () => {
    const parsed = ManifestSchema.safeParse({
      assets: [{ ...validAsset, url: "pas-une-url" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("REJETTE une clé inconnue (strict)", () => {
    const parsed = ManifestSchema.safeParse({
      assets: [{ ...validAsset, extra: true }],
    });
    expect(parsed.success).toBe(false);
  });

  it("REJETTE une transformation hors vocabulaire", () => {
    const parsed = ManifestSchema.safeParse({
      assets: [{ ...validAsset, transforms: ["inconnue"] }],
    });
    expect(parsed.success).toBe(false);
  });
});
