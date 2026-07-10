/**
 * Tests d'intégration de `runAnalyze` (le cœur du CLI). Le flux URL est exercé de bout
 * en bout avec des ports FACTICES (aucun réseau, aucun `git` réel) : le GitPort « clone »
 * en copiant une arborescence fixture, le GitHubPort renvoie des métadonnées figées.
 * On vérifie la livraison « une commande → un monde » : artefact valide, métadonnées de
 * dépôt injectées, committer date normalisée, sidecar de provenance.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "@codeworld/world-schema";
import { runAnalyze, mergeConfig } from "./run.js";
import { PROVENANCE_FILENAME } from "./provenance.js";
import { InvalidRepoUrlError, GitCloneError } from "./errors.js";
import type { GitPort } from "./git.js";
import type { GitHubPort } from "./github.js";
import type { FileConfig } from "./config.js";

/** Répertoires de clone temporaires actuellement présents sous os.tmpdir(). */
async function cloneTmpDirs(): Promise<string[]> {
  return (await readdir(tmpdir())).filter((n) => n.startsWith("cwx-clone-"));
}

/** Capture de ce qui est écrit sur stdout pendant un test (réinitialisée à chaque test). */
let stdoutCalls: string[] = [];
function capturedStdout(): string {
  return stdoutCalls.join("");
}

let scratch: string;
let fixture: string;

/** Métadonnées de commit figées (offset local +02:00 → doit se normaliser en Z). */
const SHA = "0123456789abcdef0123456789abcdef01234567";
const COMMITTED_RAW = "2026-07-09T14:32:07+02:00";
const COMMITTED_NORM = "2026-07-09T12:32:07Z";

/** GitPort factice : « clone » = copie de la fixture ; lit sha/branche/date figés. */
const fakeGit: GitPort = {
  async run(args) {
    if (args.includes("clone")) {
      const dest = args[args.length - 1]!;
      await cp(fixture, dest, { recursive: true });
      return "";
    }
    if (args.includes("--abbrev-ref")) return "main";
    if (args.includes("rev-parse")) return SHA;
    if (args.includes("show")) return COMMITTED_RAW;
    return "";
  },
};

/** GitHubPort factice : licence MIT, branche par défaut main. */
const fakeGitHub: GitHubPort = {
  fetchRepo(ref) {
    return Promise.resolve({
      fullName: `${ref.owner}/${ref.repo}`,
      htmlUrl: `https://github.com/${ref.owner}/${ref.repo}`,
      defaultBranch: "main",
      licenseSpdxId: "MIT",
    });
  },
};

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "cwx-run-"));
  fixture = join(scratch, "fixture");
  await mkdir(join(fixture, "src"), { recursive: true });
  await writeFile(join(fixture, "src", "index.ts"), 'import { u } from "./util";\nexport const app = u;\n');
  await writeFile(join(fixture, "src", "util.ts"), "export const u = 1;\n");
  await writeFile(join(fixture, "README.md"), "# Fixture\n");
  // Silence le journal/récapitulatif du CLI pendant les tests, en capturant stdout.
  stdoutCalls = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdoutCalls.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(scratch, { recursive: true, force: true });
});

describe("runAnalyze — flux URL GitHub (ports factices)", () => {
  it("clone, injecte les métadonnées, produit un artefact valide", async () => {
    const out = join(scratch, "out");
    await runAnalyze(
      "https://github.com/acme/widget",
      { out, provenance: true, quiet: true },
      { git: fakeGit, github: fakeGitHub },
    );

    const text = await readFile(join(out, "world.json"), "utf8");
    const loaded = loadWorld(text);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const world = loaded.world;

    // Métadonnées de dépôt injectées depuis l'API (mutables) et le commit (déterministes).
    expect(world.repository.owner).toBe("acme");
    expect(world.repository.name).toBe("widget");
    expect(world.repository.url).toBe("https://github.com/acme/widget");
    expect(world.repository.license).toBe("MIT");
    expect(world.snapshot.commitSha).toBe(SHA);
    expect(world.snapshot.branch).toBe("main");
    // Committer date NORMALISÉE en UTC (offset +02:00 retranché, suffixe Z).
    expect(world.snapshot.committedAt).toBe(COMMITTED_NORM);

    // L'analyse statique a bien tourné sur la copie clonée.
    expect(world.manifest.schemaVersion).toBe(1);
    expect(world.symbols?.some((s) => s.name === "app")).toBe(true);
    expect(world.relations && world.relations.length).toBeGreaterThan(0);
  });

  it("écrit le sidecar de provenance par défaut, l'omet avec provenance:false", async () => {
    const outA = join(scratch, "outA");
    await runAnalyze(
      "https://github.com/acme/widget",
      { out: outA, provenance: true, quiet: true },
      { git: fakeGit, github: fakeGitHub },
    );
    const prov = JSON.parse(await readFile(join(outA, PROVENANCE_FILENAME), "utf8")) as {
      artifactSha256: string;
      durationsMs: Record<string, number>;
    };
    expect(prov.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(prov.durationsMs)).toContain("clone");

    const outB = join(scratch, "outB");
    await runAnalyze(
      "https://github.com/acme/widget",
      { out: outB, provenance: false, quiet: true },
      { git: fakeGit, github: fakeGitHub },
    );
    await expect(stat(join(outB, PROVENANCE_FILENAME))).rejects.toThrow();
  });
});

describe("runAnalyze — cache filesystem (analyse incrémentale)", () => {
  it("un 2e passage sur le même cache est identique octet pour octet et sert des hits", async () => {
    const cacheDir = join(scratch, "cache");
    const out1 = join(scratch, "c1");
    const out2 = join(scratch, "c2");
    await runAnalyze(fixture, { out: out1, provenance: false, quiet: true, cache: cacheDir });
    await runAnalyze(fixture, { out: out2, provenance: false, quiet: true, cache: cacheDir });

    const w1 = await readFile(join(out1, "world.json"));
    const w2 = await readFile(join(out2, "world.json"));
    expect(w1.equals(w2)).toBe(true); // cache chaud == cache froid (FR-026)

    // Le récapitulatif prouve que le cache filesystem a réellement servi des hits (chaud).
    expect(/[1-9]\d* hits/.test(capturedStdout())).toBe(true);
  });
});

describe("runAnalyze — flux local et erreurs", () => {
  it("analyse un chemin local et produit un artefact valide", async () => {
    const out = join(scratch, "out-local");
    await runAnalyze(fixture, { out, provenance: true, quiet: true });
    const loaded = loadWorld(await readFile(join(out, "world.json"), "utf8"));
    expect(loaded.ok).toBe(true);
  });

  it("ne laisse aucun répertoire de clone temporaire (échec puis succès)", async () => {
    const before = await cloneTmpDirs();

    const brokenGit: GitPort = {
      run() {
        return Promise.reject(new GitCloneError("dépôt introuvable"));
      },
    };
    await expect(
      runAnalyze(
        "https://github.com/acme/widget",
        { out: join(scratch, "leak1"), provenance: false, quiet: true },
        { git: brokenGit, github: fakeGitHub },
      ),
    ).rejects.toBeInstanceOf(GitCloneError);

    await runAnalyze(
      "https://github.com/acme/widget",
      { out: join(scratch, "leak2"), provenance: false, quiet: true },
      { git: fakeGit, github: fakeGitHub },
    );

    expect(await cloneTmpDirs()).toEqual(before); // ni l'échec ni le succès ne fuient
  });

  it("refuse une URL non-GitHub sans retomber en chemin local", async () => {
    await expect(
      runAnalyze("https://gitlab.com/o/r", { out: join(scratch, "x"), provenance: false, quiet: true }),
    ).rejects.toBeInstanceOf(InvalidRepoUrlError);
  });

  it("propage un échec de clone comme GitCloneError", async () => {
    const brokenGit: GitPort = {
      run() {
        return Promise.reject(new GitCloneError("dépôt introuvable"));
      },
    };
    await expect(
      runAnalyze(
        "https://github.com/acme/widget",
        { out: join(scratch, "y"), provenance: false, quiet: true },
        { git: brokenGit, github: fakeGitHub },
      ),
    ).rejects.toBeInstanceOf(GitCloneError);
  });
});

describe("mergeConfig — la config utilisateur prime sur les métadonnées", () => {
  const meta: FileConfig = {
    repository: { owner: "acme", name: "widget", url: "https://github.com/acme/widget", defaultBranch: "main", license: "MIT" },
    snapshot: { commitSha: "a".repeat(40), branch: "main", committedAt: "2026-01-01T00:00:00Z" },
  };

  it("surcharge champ à champ repository/snapshot et conserve le reste", () => {
    const user: FileConfig = {
      layoutSeed: "graine",
      repository: { license: "Apache-2.0" }, // corrige la licence détectée
      snapshot: { branch: "release" },
    };
    const merged = mergeConfig(meta, user);
    expect(merged?.repository?.license).toBe("Apache-2.0"); // l'utilisateur gagne
    expect(merged?.repository?.owner).toBe("acme"); // la métadonnée est conservée
    expect(merged?.snapshot?.branch).toBe("release");
    expect(merged?.snapshot?.commitSha).toBe("a".repeat(40));
    expect(merged?.layoutSeed).toBe("graine");
  });

  it("retombe sur l'unique côté défini si l'autre est absent", () => {
    expect(mergeConfig(undefined, { layoutSeed: "x" })).toEqual({ layoutSeed: "x" });
    expect(mergeConfig(meta, undefined)).toBe(meta);
  });
});
