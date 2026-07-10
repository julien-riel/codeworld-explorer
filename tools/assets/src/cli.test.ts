import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildTestBox } from "./fixtures.js";
import { createAssetIO } from "./normalize.js";
import { runNormalize } from "./cli.js";
import { parseManifest } from "./manifest.js";

let dir: string;
let inputGlb: string;
let outGlb: string;
let manifestPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cw-assets-"));
  inputGlb = join(dir, "crate.glb");
  outGlb = join(dir, "crate.out.glb");
  manifestPath = join(dir, "manifest.json");
  // On génère un GLB d'entrée par programme (aucun téléchargement).
  const glb = await createAssetIO().writeBinary(buildTestBox({ size: [1000, 2000, 500] }));
  await writeFile(inputGlb, glb);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const baseArgs = () => [
  inputGlb,
  "--out",
  outGlb,
  "--manifest",
  manifestPath,
  "--source",
  "kenney",
  "--pack",
  "Survival Kit",
  "--author",
  "Kenney",
  "--url",
  "https://kenney.nl/assets/survival-kit",
];

describe("runNormalize", () => {
  it("normalise, écrit le GLB et consigne un asset CC0 valide", async () => {
    const asset = await runNormalize(baseArgs());

    // Le GLB de sortie est relisible.
    const out = await createAssetIO().read(outGlb);
    expect(out.getRoot().listMeshes().length).toBe(1);

    // Le manifeste est valide et contient l'asset avec sha256 et transforms.
    const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0]!.license).toBe("CC0-1.0");
    expect(manifest.assets[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.transforms).toContain("meshopt-compress");
  });

  it("REJETTE une licence non-CC0 et n'écrit pas de manifeste corrompu", async () => {
    await expect(
      runNormalize([...baseArgs(), "--license", "CC-BY-4.0"]),
    ).rejects.toThrow();
    // Aucun manifeste écrit (l'échec précède l'écriture).
    await expect(readFile(manifestPath, "utf8")).rejects.toThrow();
  });

  it("remplace l'entrée de même id lors d'un second passage", async () => {
    await runNormalize([...baseArgs(), "--id", "crate"]);
    await runNormalize([...baseArgs(), "--id", "crate"]);
    const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    expect(manifest.assets).toHaveLength(1);
  });

  it("exige les options obligatoires", async () => {
    await expect(
      runNormalize([inputGlb, "--out", outGlb, "--manifest", manifestPath]),
    ).rejects.toThrow(/--source/);
  });
});
