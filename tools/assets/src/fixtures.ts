/**
 * Constructeurs de `Document` glTF en mémoire, pour exercer le pipeline sans
 * télécharger le moindre asset (décision produit phase 0). Utilisés par les tests
 * et le harnais CLI de démonstration.
 */

import { Document, Logger, Verbosity, type Material } from "@gltf-transform/core";

/** Paramètres du cube de test. */
export interface TestBoxOptions {
  /** Dimensions du pavé (mm) avant normalisation. */
  readonly size?: readonly [number, number, number];
  /** Couleurs `baseColorFactor` des matériaux (une par matériau/primitive). */
  readonly colors?: readonly (readonly [number, number, number, number])[];
}

/**
 * Construit un `Document` : un pavé droit dont chaque face-groupe porte l'un des
 * matériaux fournis. Deux matériaux ⇒ deux primitives, de quoi exercer la fusion
 * de matériaux. Une minuscule texture 1×1 est ajoutée pour éprouver la chaîne.
 */
export function buildTestBox(options: TestBoxOptions = {}): Document {
  const size = options.size ?? [1000, 2000, 500];
  const colors = options.colors ?? [
    [0.84, 0.27, 0.21, 1],
    [0.86, 0.29, 0.23, 1],
  ];

  const doc = new Document();
  doc.setLogger(new Logger(Verbosity.SILENT));
  const buffer = doc.createBuffer();

  const [sx, sy, sz] = size;
  // Huit sommets du pavé, coin en (0,0,0).
  const corners = [
    [0, 0, 0],
    [sx, 0, 0],
    [sx, sy, 0],
    [0, sy, 0],
    [0, 0, sz],
    [sx, 0, sz],
    [sx, sy, sz],
    [0, sy, sz],
  ];
  const position = doc
    .createAccessor("POSITION")
    .setType("VEC3")
    .setArray(new Float32Array(corners.flat()))
    .setBuffer(buffer);
  const texcoord = doc
    .createAccessor("TEXCOORD_0")
    .setType("VEC2")
    .setArray(
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]),
    )
    .setBuffer(buffer);

  // Deux tranches d'indices (avant / arrière) pour deux primitives.
  const faceSets = [
    new Uint16Array([0, 1, 2, 0, 2, 3, 0, 1, 5, 0, 5, 4]),
    new Uint16Array([4, 5, 6, 4, 6, 7, 2, 3, 7, 2, 7, 6]),
  ];

  // Texture palette minuscule (1×1 PNG rouge), partagée : éprouve le remapping.
  const png1x1 = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  const texture = doc
    .createTexture("palette")
    .setImage(png1x1)
    .setMimeType("image/png");

  const mesh = doc.createMesh("box");
  colors.forEach((color, i) => {
    const material: Material = doc
      .createMaterial(`mat-${i}`)
      .setBaseColorFactor([...color])
      .setBaseColorTexture(texture);
    const primitive = doc
      .createPrimitive()
      .setAttribute("POSITION", position)
      .setAttribute("TEXCOORD_0", texcoord)
      .setIndices(
        doc
          .createAccessor(`idx-${i}`)
          .setType("SCALAR")
          .setArray(faceSets[i % faceSets.length]!)
          .setBuffer(buffer),
      )
      .setMaterial(material);
    mesh.addPrimitive(primitive);
  });

  doc.createScene("scene").addChild(doc.createNode("box-node").setMesh(mesh));
  return doc;
}
