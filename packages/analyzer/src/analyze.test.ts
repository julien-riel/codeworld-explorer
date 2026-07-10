/**
 * Tests d'intégration du générateur embryonnaire (sprint 2). Chaque test bâtit une
 * arborescence temporaire RÉELLE, l'analyse, et vérifie une exigence dure :
 * validité `parseWorld`, reproductibilité FR-026, indépendance à l'ordre de lecture,
 * échec local `read-error`, refus des liens sortants, exclusion de `node_modules`,
 * primauté de la couche 1 (config) sur la couche 2 (règles).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalStringify,
  loadWorld,
  parseWorld,
  type Category,
} from "@codeworld/world-schema";
import { analyze } from "./pipeline.js";
import { writeWorld } from "./write.js";
import { parseConfigJson } from "./config.js";
import { nodeFsPort, type FsPort } from "./inventory.js";
import { AnalysisLimitError, OutgoingSymlinkError } from "./errors.js";
import { MAX_INVENTORY_NODES } from "./exclusions.js";

/** Écrit une petite arborescence jouet couvrant tous les cas d'exclusion/classification. */
async function makeToyRepo(root: string): Promise<void> {
  await mkdir(join(root, "src", "services"), { recursive: true });
  await mkdir(join(root, "src", "utils"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "test"), { recursive: true });
  await mkdir(join(root, "node_modules", "leftpad"), { recursive: true });
  await mkdir(join(root, "dist"), { recursive: true });

  await writeFile(join(root, "README.md"), "# Toy\n");
  await writeFile(join(root, "package.json"), '{"name":"toy"}\n');
  await writeFile(
    join(root, "src", "index.ts"),
    'import { user } from "./services/user";\nexport const x = 1;\nexport { user };\n',
  );
  await writeFile(join(root, "src", "services", "user.ts"), "export function user() {}\n");
  await writeFile(join(root, "src", "utils", "helpers.ts"), "export const h = 2;\n");
  await writeFile(join(root, "docs", "guide.md"), "# Guide\n");
  await writeFile(join(root, "test", "user.test.ts"), "// test\n");
  await writeFile(join(root, "node_modules", "leftpad", "index.js"), "module.exports = 1;\n");
  await writeFile(join(root, "dist", "bundle.js"), "compiled\n");
  // Fichier binaire : extension binaire ET octet NUL → exclu « binary », jamais haché.
  await writeFile(join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
}

/** Nombre de fichiers texte NON exclus attendus (donc nombre de blobs sous files/). */
const EXPECTED_TEXT_FILES = 7;

let root: string;
let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "cwx-analyze-"));
  root = join(scratch, "repo");
  await mkdir(root, { recursive: true });
  await makeToyRepo(root);
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("analyze — artefact valide", () => {
  it("produit un world.json qui passe parseWorld et loadWorld", async () => {
    const result = await analyze(root, {});
    // `analyze` a déjà validé ; on revérifie explicitement l'objet et le fichier écrit.
    expect(() => parseWorld(result.world)).not.toThrow();

    const out = join(scratch, "out");
    await writeWorld(out, result.world, result.files);
    const text = await readFile(join(out, "world.json"), "utf8");
    const loaded = loadWorld(text);
    expect(loaded.ok).toBe(true);

    // Couverture totale de l'index de recherche (bijection nodes ↔ documents).
    expect(result.world.search.documents.length).toBe(result.world.nodes.length);
    const refs = new Set(result.world.search.documents.map((d) => d.ref));
    const ids = new Set(result.world.nodes.map((n) => n.id));
    expect(refs).toEqual(ids);

    // Au moins une salle et un hall.
    expect(result.world.layout.spatialNodes.length).toBeGreaterThan(0);
    expect(result.world.layout.spatialNodes.some((s) => s.role === "hall")).toBe(true);
  });

  it("classe src/services en « service » par règle de nom (couche 2)", async () => {
    const result = await analyze(root, {});
    const dir = result.world.nodes.find((n) => n.path === "src/services");
    expect(dir).toBeDefined();
    const cls = result.world.classifications.find((c) => c.sourceNodeId === dir?.id);
    expect(cls?.category).toBe("service");
    expect(cls?.decisionSource).toBe("rule");
    expect(cls?.confidence).toBe(1000);
    expect(cls?.overriddenByConfig).toBe(false);
  });
});

describe("analyse statique — symboles et relations (sprint 5, phase 1)", () => {
  it("émet un artefact v1 porteur de symbols/relations toujours présents", async () => {
    const result = await analyze(root, {});
    expect(result.world.manifest.schemaVersion).toBe(1);
    // Collections de phase 1 toujours présentes (vides si vides, §2.3).
    expect(Array.isArray(result.world.symbols)).toBe(true);
    expect(Array.isArray(result.world.relations)).toBe(true);
    expect(() => parseWorld(result.world)).not.toThrow();
  });

  it("extrait les symboles top-level des fichiers TS", async () => {
    const result = await analyze(root, {});
    const userFile = result.world.nodes.find((n) => n.path === "src/services/user.ts");
    const userSym = result.world.symbols?.find(
      (s) => s.sourceNodeId === userFile?.id && s.name === "user",
    );
    expect(userSym?.symbolType).toBe("function");
    expect(userSym?.exported).toBe(true);
    // Le fichier de test ne déclare rien : aucun symbole rattaché.
    const testFile = result.world.nodes.find((n) => n.path === "test/user.test.ts");
    expect(result.world.symbols?.some((s) => s.sourceNodeId === testFile?.id)).toBe(false);
  });

  it("résout un import relatif en relation fichier→fichier", async () => {
    const result = await analyze(root, {});
    const index = result.world.nodes.find((n) => n.path === "src/index.ts");
    const user = result.world.nodes.find((n) => n.path === "src/services/user.ts");
    const rel = result.world.relations?.find(
      (r) => r.sourceRef.id === index?.id && r.targetRef.id === user?.id,
    );
    expect(rel?.relationType).toBe("import");
    expect(rel?.confidence).toBe(1000);
  });

  it("enrichit l'index de recherche avec symbolNames sur les fichiers", async () => {
    const result = await analyze(root, {});
    const index = result.world.nodes.find((n) => n.path === "src/index.ts");
    const doc = result.world.search.documents.find((d) => d.ref === index?.id);
    expect(doc?.symbolNames).toContain("x");
    // Un dossier ne porte jamais symbolNames.
    const dirDoc = result.world.search.documents.find((d) => d.kind === "directory");
    expect(dirDoc?.symbolNames).toBeUndefined();
  });
});

describe("exclusions", () => {
  it("exclut node_modules : contenu absent des nœuds ET de files/", async () => {
    const result = await analyze(root, {});
    const paths = result.world.nodes.map((n) => n.path);

    // Le dossier node_modules apparaît en feuille exclue, sans childCount…
    const nm = result.world.nodes.find((n) => n.path === "node_modules");
    expect(nm?.excludedReason).toBe("vendored");
    expect(nm?.childCount).toBeUndefined();
    // …mais son intérieur n'est jamais inventorié.
    expect(paths.some((p) => p.startsWith("node_modules/"))).toBe(false);

    // dist exclu (generated), logo.png exclu (binary).
    expect(result.world.nodes.find((n) => n.path === "dist")?.excludedReason).toBe("generated");
    expect(result.world.nodes.find((n) => n.path === "logo.png")?.excludedReason).toBe("binary");

    // files/ ne contient que les blobs des fichiers texte non exclus.
    const out = join(scratch, "out");
    await writeWorld(out, result.world, result.files);
    const blobs = await readdir(join(out, "files"));
    expect(blobs.length).toBe(EXPECTED_TEXT_FILES);
    expect(result.files.size).toBe(EXPECTED_TEXT_FILES);
  });
});

describe("FR-026 — reproductibilité octet pour octet", () => {
  it("deux exécutions produisent des octets identiques (world.json et files/)", async () => {
    const w1 = join(scratch, "w1");
    const w2 = join(scratch, "w2");
    const r1 = await analyze(root, {});
    const r2 = await analyze(root, {});
    await writeWorld(w1, r1.world, r1.files);
    await writeWorld(w2, r2.world, r2.files);

    const b1 = await readFile(join(w1, "world.json"));
    const b2 = await readFile(join(w2, "world.json"));
    expect(b1.equals(b2)).toBe(true);

    const f1 = (await readdir(join(w1, "files"))).sort();
    const f2 = (await readdir(join(w2, "files"))).sort();
    expect(f1).toEqual(f2);
    for (const name of f1) {
      const c1 = await readFile(join(w1, "files", name));
      const c2 = await readFile(join(w2, "files", name));
      expect(c1.equals(c2)).toBe(true);
    }
  });
});

describe("indépendance à l'ordre du système de fichiers", () => {
  it("un readDir mélangé produit exactement le même artefact", async () => {
    // Port qui renvoie les entrées dans l'ordre INVERSE ; l'inventaire les re-trie.
    const reversedFs: FsPort = {
      ...nodeFsPort,
      async readDir(absPath) {
        const entries = await nodeFsPort.readDir(absPath);
        return [...entries].reverse();
      },
    };
    const rDefault = await analyze(root, {});
    const rReversed = await analyze(root, { fs: reversedFs });
    expect(canonicalStringify(rReversed.world)).toBe(canonicalStringify(rDefault.world));
  });
});

describe("FR-024 / FR-025 — échec local sans échec global", () => {
  it("un fichier illisible produit read-error et l'artefact reste valide", async () => {
    const failingFs: FsPort = {
      ...nodeFsPort,
      async readFile(absPath) {
        if (absPath.endsWith(join("src", "index.ts"))) {
          throw new Error("EACCES: permission denied");
        }
        return nodeFsPort.readFile(absPath);
      },
    };
    const result = await analyze(root, { fs: failingFs });
    const idx = result.world.nodes.find((n) => n.path === "src/index.ts");
    expect(idx?.excludedReason).toBe("read-error");
    expect(idx?.contentHash).toBeUndefined();
    expect(idx?.language).toBeUndefined();
    // L'artefact global reste ouvrable.
    expect(() => parseWorld(result.world)).not.toThrow();
  });
});

describe("sécurité — liens symboliques sortants", () => {
  it("refuse un lien symbolique dont la cible sort de la racine", async () => {
    const outside = await mkdtemp(join(tmpdir(), "cwx-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret\n");
    await symlink(outside, join(root, "escape"));
    try {
      await expect(analyze(root, {})).rejects.toBeInstanceOf(OutgoingSymlinkError);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("classification — couche 1 (config) prime sur couche 2 (règle)", () => {
  it("un mapping de config change la catégorie d'un dossier (par nom)", async () => {
    const folderNames = new Map<string, Category>([["services", "controller"]]);
    const result = await analyze(root, { config: { classificationFolderNames: folderNames } });
    const dir = result.world.nodes.find((n) => n.path === "src/services");
    const cls = result.world.classifications.find((c) => c.sourceNodeId === dir?.id);
    expect(cls?.category).toBe("controller");
    expect(cls?.decisionSource).toBe("config");
    expect(cls?.overriddenByConfig).toBe(true);
  });

  it("un mapping de config par chemin (fichier JSON) surcharge la règle de nom", async () => {
    // src/utils serait « utility » par règle ; la config le force en « controller ».
    const fc = parseConfigJson('{"classifications":{"paths":{"src/utils":"controller"}}}');
    const result = await analyze(root, { config: fc });
    const dir = result.world.nodes.find((n) => n.path === "src/utils");
    const cls = result.world.classifications.find((c) => c.sourceNodeId === dir?.id);
    expect(cls?.category).toBe("controller");
    expect(cls?.decisionSource).toBe("config");
    expect(cls?.overriddenByConfig).toBe(true);
  });
});

describe("FR-026 — le nom de dépôt dérivé est normalisé en NFC", () => {
  it("un dossier racine nommé en NFD ne fait pas fuir sa forme Unicode dans l'artefact", async () => {
    // « café » en NFD sur disque. Le nom dérivé (basename du realpath) DOIT être ramené
    // en NFC comme tout chemin, sinon macOS (NFD) et Linux (NFC) divergent octet à octet.
    const nfc = "café".normalize("NFC");
    const nfd = "café".normalize("NFD");
    const nfdRoot = join(scratch, nfd);
    await mkdir(join(nfdRoot, "src"), { recursive: true });
    await writeFile(join(nfdRoot, "src", "a.ts"), "export const x = 1;\n");

    // `realPath` force la forme NFD du dernier segment, quelle que soit la normalisation
    // du système de fichiers de test (APFS préserve, HFS+ impose NFD) : la garde NFC du
    // pipeline est ainsi exercée de façon déterministe sur toute machine.
    const nfdFs: FsPort = {
      ...nodeFsPort,
      async realPath(absPath) {
        const real = await nodeFsPort.realPath(absPath);
        return real
          .split("/")
          .map((seg) => (seg === nfc || seg === nfd ? nfd : seg))
          .join("/");
      },
    };

    const result = await analyze(nfdRoot, { fs: nfdFs });
    expect(result.world.repository.name).toBe(nfc);
    expect(result.world.repository.name.normalize("NFC")).toBe(result.world.repository.name);
    expect(result.world.repository.url.endsWith(nfc)).toBe(true);
    expect(result.world.nodes.find((n) => n.path === "")?.name).toBe(nfc);
  });
});

describe("FR-024 — un nom de fichier avec « \\ » n'avorte pas l'analyse", () => {
  it("écarte l'entrée avec un avertissement et produit tout de même l'artefact", async () => {
    // « \ » est légal sur macOS/Linux ; `normalizePath` le convertirait en « / »,
    // éclatant le segment en faux composants. L'entrée doit être écartée, pas propagée.
    await mkdir(join(root, "weird"), { recursive: true });
    await writeFile(join(root, "weird", "foo\\bar.ts"), "x");

    const result = await analyze(root, {});
    expect(() => parseWorld(result.world)).not.toThrow();
    // Aucun faux composant « weird/foo » ni « weird/foo/bar.ts » n'a été créé.
    expect(result.world.nodes.some((n) => n.path === "weird/foo")).toBe(false);
    expect(result.world.nodes.some((n) => n.path === "weird/foo/bar.ts")).toBe(false);
    expect(result.warnings.some((w) => w.includes("séparateur"))).toBe(true);
  });
});

describe("§22.2/§27.3 — plafond du nombre TOTAL de nœuds (anti-DoS)", () => {
  it("refuse une arborescence de dossiers dépassant MAX_INVENTORY_NODES", async () => {
    // FsPort synthétique : la racine expose (plafond + 5) dossiers vides, aucun fichier.
    // Sans plafonnement des dossiers, le pipeline produisait un artefact non borné.
    const count = MAX_INVENTORY_NODES + 5;
    const manyDirsFs: FsPort = {
      readDir(absPath) {
        if (absPath === "/virt-many") {
          return Promise.resolve(
            Array.from({ length: count }, (_, i) => ({
              name: `d${String(i).padStart(6, "0")}`,
              kind: "directory" as const,
            })),
          );
        }
        return Promise.resolve([]);
      },
      statSize() {
        return Promise.resolve(0);
      },
      readFile() {
        return Promise.resolve(new Uint8Array());
      },
      realPath(absPath) {
        return Promise.resolve(absPath);
      },
    };
    await expect(analyze("/virt-many", { fs: manyDirsFs })).rejects.toBeInstanceOf(AnalysisLimitError);
  });
});

describe("conflit de normalisation Unicode entre frères (checkout Linux/ext4)", () => {
  it("écarte le doublon NFC au lieu de dégénérer en erreur d'invariant interne", async () => {
    // Deux frères « café » NFC et « café » NFD : impossible sur APFS/HFS+, possible sur
    // ext4. On les injecte via FsPort. Un seul nœud « café » (NFC) doit subsister et
    // l'artefact rester ouvrable (FR-024), sans erreur d'invariant d'arbre.
    const nfc = "café".normalize("NFC");
    const nfd = "café".normalize("NFD");
    const twinFs: FsPort = {
      readDir(absPath) {
        if (absPath === "/virt-twin") {
          return Promise.resolve([
            { name: nfc, kind: "directory" as const },
            { name: nfd, kind: "directory" as const },
          ]);
        }
        return Promise.resolve([]);
      },
      statSize() {
        return Promise.resolve(0);
      },
      readFile() {
        return Promise.resolve(new Uint8Array());
      },
      realPath(absPath) {
        return Promise.resolve(absPath);
      },
    };
    const result = await analyze("/virt-twin", { fs: twinFs });
    expect(() => parseWorld(result.world)).not.toThrow();
    expect(result.world.nodes.filter((n) => n.path === nfc)).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("normalisation Unicode"))).toBe(true);
  });
});
