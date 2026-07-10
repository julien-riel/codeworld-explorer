#!/usr/bin/env node
/**
 * CLI `codeworld` (PRD §14.1). Sprint 2 : `analyze <chemin-local> --out <dir>` lit une
 * arborescence RÉELLE sur disque et écrit un `world.json` valide, sans analyse de
 * symboles ni IA. Les défaillances prévues (limite, lien sortant, config invalide)
 * sont rapportées par un message clair et un code de sortie ≠ 0 — jamais une trace brute.
 */

import { Command } from "commander";
import pc from "picocolors";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyze } from "./pipeline.js";
import { writeWorld } from "./write.js";
import { parseConfigJson, type FileConfig } from "./config.js";
import { ANALYZER_VERSION } from "./version.js";
import { AnalyzeError } from "./errors.js";

interface AnalyzeCliOptions {
  readonly out: string;
  readonly config?: string;
  readonly seed?: string;
}

/** Exécute une analyse et écrit l'artefact ; lève des erreurs typées en cas d'échec. */
async function runAnalyze(pathArg: string, opts: AnalyzeCliOptions): Promise<void> {
  const rootPath = resolve(pathArg);

  let fileConfig: FileConfig | undefined;
  if (opts.config !== undefined) {
    const text = await readFile(resolve(opts.config), "utf8");
    fileConfig = parseConfigJson(text);
  }
  if (opts.seed !== undefined) fileConfig = { ...(fileConfig ?? {}), layoutSeed: opts.seed };

  process.stderr.write(pc.dim(`Analyse de « ${rootPath} »…\n`));
  const result = await analyze(rootPath, fileConfig !== undefined ? { config: fileConfig } : {});
  const written = await writeWorld(resolve(opts.out), result.world, result.files);

  const { stats } = result;
  const kib = (written.worldBytes / 1024).toFixed(1);
  process.stdout.write(
    [
      pc.green("Artefact écrit :") + ` ${written.worldPath}`,
      `  nœuds       : ${String(stats.nodes)} (${String(stats.directories)} dossiers, ${String(stats.files)} fichiers, ${String(stats.analyzed)} analysés)`,
      `  salles      : ${String(stats.rooms)}`,
      `  classif.    : ${String(stats.classifications)}`,
      `  contenus    : ${String(written.fileCount)} blobs sous files/`,
      `  world.json  : ${String(written.worldBytes)} octets (${kib} Kio)`,
    ].join("\n") + "\n",
  );

  if (result.warnings.length > 0) {
    process.stderr.write(pc.yellow(`${String(result.warnings.length)} avertissement(s) :\n`));
    for (const w of result.warnings) process.stderr.write(pc.yellow(`  - ${w}\n`));
  }
}

const program = new Command();

program
  .name("codeworld")
  .description("Analyse un dépôt local et produit un artefact world.json")
  .version(ANALYZER_VERSION);

program
  .command("analyze")
  .argument("<path>", "chemin local du dépôt à analyser")
  .requiredOption("-o, --out <dir>", "répertoire de sortie de l'artefact")
  .option("-c, --config <file>", "fichier de configuration JSON (couche 1, métadonnées)")
  .option("-s, --seed <seed>", "graine de layout (surcharge la configuration)")
  .description("Analyse une arborescence locale et écrit l'artefact world.json")
  .action(async (path: string, opts: AnalyzeCliOptions) => {
    try {
      await runAnalyze(path, opts);
    } catch (error) {
      if (error instanceof AnalyzeError) {
        process.stderr.write(pc.red(`Échec de l'analyse [${error.code}] : ${error.message}\n`));
      } else {
        process.stderr.write(pc.red(`Échec de l'analyse : ${error instanceof Error ? error.message : String(error)}\n`));
      }
      process.exitCode = 1;
    }
  });

await program.parseAsync();
