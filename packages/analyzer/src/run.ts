/**
 * Cœur programmatique de `codeworld analyze` (PRD §14.1), séparé de la couche Commander
 * (cli.ts) pour être exercé directement par les tests d'intégration (clone `file://`,
 * ports factices) sans déclencher l'analyse des arguments de ligne de commande.
 *
 * `analyze <cible>` accepte un CHEMIN LOCAL (flux historique) ou une URL GitHub (clone
 * superficiel du commit + métadonnées via l'API, puis analyse de la copie de travail —
 * « une commande → un monde », §19.3, §21.1). L'artefact `world.json` et les contenus
 * adressés par hash sont écrits, avec un sidecar de provenance `world.build.json` (§10.4).
 */

import pc from "picocolors";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { analyze } from "./pipeline.js";
import { writeWorld } from "./write.js";
import { parseConfigFile, type FileConfig } from "./config.js";
import { createFilesystemCache, type CachePort } from "./cache.js";
import { RecordingReporter } from "./progress.js";
import { buildProvenance, writeProvenance } from "./provenance.js";
import { fetchRepoMetadata, looksLikeRepoUrl, parseRepoUrl, type GitHubPort } from "./github.js";
import { shallowClone, type GitPort } from "./git.js";

/** Options de la commande `analyze` (miroir des drapeaux Commander). */
export interface AnalyzeCliOptions {
  readonly out: string;
  readonly config?: string;
  readonly seed?: string;
  readonly ref?: string;
  readonly cache?: string;
  /** Écrit le sidecar de provenance (défaut vrai ; `--no-provenance` le désactive). */
  readonly provenance: boolean;
  readonly quiet?: boolean;
}

/** Ports injectables (tests hermétiques) ; par défaut, les implémentations réseau/git réelles. */
export interface CliPorts {
  readonly github?: GitHubPort;
  readonly git?: GitPort;
}

/** Cible résolue en une racine locale à analyser, avec métadonnées et nettoyage éventuels. */
interface ResolvedTarget {
  readonly rootPath: string;
  /** Fragment de config issu du dépôt distant (repository/snapshot), ou `undefined` en local. */
  readonly metadata?: FileConfig;
  readonly warnings: readonly string[];
  /** Supprime une copie de travail temporaire (no-op en local). */
  cleanup(): Promise<void>;
}

/**
 * Résout la cible d'analyse. Un argument qui RESSEMBLE à une URL de dépôt (github.ts)
 * emprunte le flux de clone ; sinon, c'est un chemin local. Une entrée qui ressemble à
 * une URL mais échoue à l'analyse lève (jamais de repli silencieux en chemin local).
 */
async function resolveTarget(
  target: string,
  opts: AnalyzeCliOptions,
  reporter: RecordingReporter,
  ports: CliPorts,
): Promise<ResolvedTarget> {
  if (!looksLikeRepoUrl(target)) {
    return { rootPath: resolve(target), warnings: [], cleanup: () => Promise.resolve() };
  }

  const ref = parseRepoUrl(target); // lève InvalidRepoUrlError si malformé

  reporter.start("metadata");
  const meta = await fetchRepoMetadata(ref, ports.github);
  reporter.done(
    "metadata",
    `${meta.repository.owner}/${meta.repository.name}, licence ${meta.repository.license ?? "?"}`,
  );

  const scratch = await mkdtemp(join(tmpdir(), "cwx-clone-"));
  const cloneDir = join(scratch, "repo");
  reporter.start("clone");
  let clone;
  try {
    clone = await shallowClone(target, cloneDir, { ref: opts.ref, port: ports.git });
  } catch (error) {
    await rm(scratch, { recursive: true, force: true });
    throw error;
  }
  reporter.done("clone", `${clone.commitSha.slice(0, 10)} sur ${clone.branch}`);

  // Fragment injecté : métadonnées mutables (API) + faits déterministes du commit (git).
  // `committedAt` porte encore l'offset local ; `resolveConfig` le normalise (spec §3.4.1).
  const metadata: FileConfig = {
    repository: {
      owner: meta.repository.owner,
      name: meta.repository.name,
      url: meta.repository.url,
      defaultBranch: meta.repository.defaultBranch ?? clone.branch,
      license: meta.repository.license,
    },
    snapshot: {
      commitSha: clone.commitSha,
      branch: clone.branch,
      committedAt: clone.committedAtRaw,
    },
  };

  return {
    rootPath: cloneDir,
    metadata,
    warnings: meta.warnings,
    cleanup: () => rm(scratch, { recursive: true, force: true }),
  };
}

/**
 * Fusionne le fragment de métadonnées (base) et la configuration utilisateur (surcharge).
 * La couche 1 « config » prime (plan §7) : un opérateur peut corriger une licence ou une
 * branche mal détectées. `repository`/`snapshot` sont fusionnés champ à champ.
 */
export function mergeConfig(
  metadata: FileConfig | undefined,
  user: FileConfig | undefined,
): FileConfig | undefined {
  if (metadata === undefined) return user;
  if (user === undefined) return metadata;
  return {
    ...metadata,
    ...user,
    repository: { ...metadata.repository, ...user.repository },
    snapshot: { ...metadata.snapshot, ...user.snapshot },
  };
}

/**
 * Exécute une analyse et écrit l'artefact. Le `reporter` est fourni par l'appelant afin
 * qu'en cas d'échec il puisse attribuer l'erreur à l'étape courante (`reporter.currentStep`).
 * Lève des erreurs typées (`AnalyzeError`) en cas de défaillance prévue.
 */
export async function runAnalyze(
  target: string,
  opts: AnalyzeCliOptions,
  ports: CliPorts = {},
  reporter: RecordingReporter = new RecordingReporter(),
): Promise<void> {
  let userConfig: FileConfig | undefined;
  if (opts.config !== undefined) {
    const text = await readFile(resolve(opts.config), "utf8");
    userConfig = parseConfigFile(text, opts.config);
  }
  if (opts.seed !== undefined) userConfig = { ...(userConfig ?? {}), layoutSeed: opts.seed };

  const cache: CachePort | undefined =
    opts.cache !== undefined ? createFilesystemCache(resolve(opts.cache)) : undefined;

  const resolved = await resolveTarget(target, opts, reporter, ports);
  try {
    if (opts.quiet !== true) process.stderr.write(pc.dim(`Analyse de « ${resolved.rootPath} »…\n`));
    const config = mergeConfig(resolved.metadata, userConfig);
    const result = await analyze(resolved.rootPath, {
      ...(config !== undefined ? { config } : {}),
      ...(cache !== undefined ? { cache } : {}),
      progress: reporter,
    });

    reporter.start("write");
    const outDir = resolve(opts.out);
    const written = await writeWorld(outDir, result.world, result.files);
    reporter.done("write", `${String(written.worldBytes)} o`);

    if (opts.provenance) {
      const provenance = buildProvenance({
        durationsMs: reporter.durationsMs(),
        artifactSha256: written.worldSha256,
      });
      await writeProvenance(outDir, provenance);
    }

    const { stats } = result;
    const kib = (written.worldBytes / 1024).toFixed(1);
    const cacheLine =
      cache !== undefined
        ? [`  cache       : ${String(stats.cache.hits)} hits, ${String(stats.cache.misses)} misses`]
        : [];
    process.stdout.write(
      [
        pc.green("Artefact écrit :") + ` ${written.worldPath}`,
        `  nœuds       : ${String(stats.nodes)} (${String(stats.directories)} dossiers, ${String(stats.files)} fichiers, ${String(stats.analyzed)} analysés)`,
        `  salles      : ${String(stats.rooms)}`,
        `  classif.    : ${String(stats.classifications)}`,
        `  symboles    : ${String(stats.symbols)} sur ${String(stats.parsedFiles)} fichiers de code`,
        `  relations   : ${String(stats.relations)} (imports directs)`,
        ...cacheLine,
        `  contenus    : ${String(written.fileCount)} blobs sous files/`,
        `  world.json  : ${String(written.worldBytes)} octets (${kib} Kio)`,
      ].join("\n") + "\n",
    );

    const allWarnings = [...resolved.warnings, ...result.warnings];
    if (allWarnings.length > 0) {
      process.stderr.write(pc.yellow(`${String(allWarnings.length)} avertissement(s) :\n`));
      for (const w of allWarnings) process.stderr.write(pc.yellow(`  - ${w}\n`));
    }
  } finally {
    await resolved.cleanup();
  }
}
