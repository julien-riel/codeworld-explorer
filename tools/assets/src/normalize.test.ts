import { describe, it, expect } from "vitest";
import { PropertyType } from "@gltf-transform/core";

import { buildTestBox } from "./fixtures.js";
import {
  normalizeScale,
  remapToPalette,
  mergeMaterials,
  normalizeDocument,
  worldBounds,
  createAssetIO,
  PRODUCT_PALETTE,
  PIPELINE,
  DEFAULT_TARGET_SIZE,
} from "./normalize.js";

describe("normalizeScale", () => {
  it("porte la plus grande dimension de la boîte à la cible", () => {
    const doc = buildTestBox({ size: [1000, 2000, 500] });
    normalizeScale(doc, 4000);
    const b = worldBounds(doc)!;
    const dims = [
      b.max[0] - b.min[0],
      b.max[1] - b.min[1],
      b.max[2] - b.min[2],
    ];
    // La dimension y (2000, la plus grande) devient 4000 ; ratio préservé.
    expect(Math.max(...dims)).toBeCloseTo(4000, 3);
    expect(dims[1]).toBeCloseTo(4000, 3);
    expect(dims[0]).toBeCloseTo(2000, 3);
    expect(dims[2]).toBeCloseTo(1000, 3);
  });

  it("est un no-op si déjà normalisé (idempotence de l'étape)", () => {
    const doc = buildTestBox({ size: [1000, 2000, 500] });
    normalizeScale(doc, 4000);
    const first = worldBounds(doc)!;
    normalizeScale(doc, 4000);
    const second = worldBounds(doc)!;
    expect(second).toEqual(first);
  });
});

describe("remapToPalette", () => {
  it("aligne chaque couleur sur une entrée de la palette", () => {
    const doc = buildTestBox({
      colors: [
        [0.84, 0.27, 0.21, 1],
        [0.19, 0.51, 0.85, 0.5],
      ],
    });
    remapToPalette(doc);
    const mats = doc.getRoot().listMaterials();
    for (const m of mats) {
      const [r, g, b] = m.getBaseColorFactor();
      const onPalette = PRODUCT_PALETTE.some(
        (p) => p[0] === r && p[1] === g && p[2] === b,
      );
      expect(onPalette).toBe(true);
    }
    // L'alpha d'origine est préservé.
    expect(mats[1]!.getBaseColorFactor()[3]).toBeCloseTo(0.5, 6);
  });

  it("est idempotent", () => {
    const doc = buildTestBox();
    remapToPalette(doc);
    const before = doc.getRoot().listMaterials().map((m) => m.getBaseColorFactor());
    remapToPalette(doc);
    const after = doc.getRoot().listMaterials().map((m) => m.getBaseColorFactor());
    expect(after).toEqual(before);
  });
});

describe("mergeMaterials", () => {
  it("réduit le nombre de matériaux identiques", async () => {
    const doc = buildTestBox({
      colors: [
        [0.5, 0.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1],
      ],
    });
    expect(doc.getRoot().listMaterials().length).toBe(2);
    await mergeMaterials(doc);
    expect(doc.getRoot().listMaterials().length).toBe(1);
  });

  it("fusionne après remappage de deux couleurs voisines", async () => {
    const doc = buildTestBox({
      colors: [
        [0.84, 0.27, 0.21, 1],
        [0.86, 0.29, 0.23, 1],
      ],
    });
    remapToPalette(doc);
    await mergeMaterials(doc);
    expect(doc.getRoot().listMaterials().length).toBe(1);
  });
});

describe("normalizeDocument (bout en bout)", () => {
  it("renvoie l'ordre canonique des transformations", async () => {
    const doc = buildTestBox();
    const transforms = await normalizeDocument(doc);
    expect(transforms).toEqual([...PIPELINE]);
  });

  it("produit un GLB relisible par @gltf-transform/core", async () => {
    const doc = buildTestBox({ size: [1000, 2000, 500] });
    await normalizeDocument(doc);

    const io = createAssetIO();
    const glb = await io.writeBinary(doc);
    expect(glb.byteLength).toBeGreaterThan(0);

    const reread = await io.readBinary(glb);
    expect(reread.getRoot().listMeshes().length).toBe(1);
    // Échelle conservée après aller-retour disque.
    const b = worldBounds(reread)!;
    expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])).toBeCloseTo(
      DEFAULT_TARGET_SIZE,
      0,
    );
    // La compression Meshopt est bien inscrite.
    const extensions = reread.getRoot().listExtensionsUsed().map((e) => e.extensionName);
    expect(extensions).toContain("EXT_meshopt_compression");
  });

  it("réduit les deux matériaux voisins à un seul", async () => {
    const doc = buildTestBox({
      colors: [
        [0.84, 0.27, 0.21, 1],
        [0.86, 0.29, 0.23, 1],
      ],
    });
    await normalizeDocument(doc);
    expect(doc.getRoot().listMaterials().length).toBe(1);
  });

  it("est idempotent : relancer sur sa propre sortie ne change plus les octets", async () => {
    const io = createAssetIO();

    const doc1 = buildTestBox({ size: [1000, 2000, 500] });
    await normalizeDocument(doc1);
    const glbA = await io.writeBinary(doc1);

    const doc2 = await io.readBinary(glbA);
    await normalizeDocument(doc2);
    const glbB = await io.writeBinary(doc2);

    expect(Buffer.from(glbB).equals(Buffer.from(glbA))).toBe(true);
  });
});

// Garde de cohérence : PropertyType.MATERIAL est bien la clé utilisée.
it("expose PropertyType.MATERIAL", () => {
  expect(PropertyType.MATERIAL).toBe("Material");
});
