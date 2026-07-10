#!/usr/bin/env node
/**
 * CLI `codeworld` (PRD §14.1) : fine couche Commander au-dessus de `runAnalyze` (run.ts).
 *
 * `analyze <cible>` accepte un chemin local OU une URL GitHub. Un journal de progression
 * par étape est émis sur stderr ; le récapitulatif sur stdout. Les défaillances prévues
 * (URL invalide, échec de clone, limite, config invalide) sont rapportées par un message
 * clair, l'étape fautive et un code de sortie ≠ 0 — jamais une trace de pile brute.
 */

import { Command } from "commander";
import pc from "picocolors";
import { RecordingReporter } from "./progress.js";
import { runAnalyze, type AnalyzeCliOptions } from "./run.js";
import { ANALYZER_VERSION } from "./version.js";
import { AnalyzeError } from "./errors.js";

const program = new Command();

program
  .name("codeworld")
  .description("Analyse un dépôt (chemin local ou URL GitHub) et produit un artefact world.json")
  .version(ANALYZER_VERSION);

program
  .command("analyze")
  .argument("<target>", "chemin local du dépôt OU URL GitHub (https://github.com/owner/repo)")
  .requiredOption("-o, --out <dir>", "répertoire de sortie de l'artefact")
  .option("-c, --config <file>", "fichier de configuration JSON (couche 1, métadonnées)")
  .option("-s, --seed <seed>", "graine de layout (surcharge la configuration)")
  .option("-r, --ref <branch|tag>", "branche ou tag à cloner (URL GitHub ; défaut : branche par défaut)")
  .option("--cache <dir>", "active le cache par hash de contenu dans ce répertoire (analyse incrémentale)")
  .option("--no-provenance", "n'écrit pas le sidecar world.build.json")
  .option("-q, --quiet", "n'émet pas le journal de progression par étape")
  .description("Analyse un dépôt local ou GitHub et écrit l'artefact world.json")
  .action(async (target: string, opts: AnalyzeCliOptions) => {
    const sink = opts.quiet === true ? undefined : (line: string) => process.stderr.write(pc.dim(line));
    const reporter = new RecordingReporter({ sink });
    try {
      await runAnalyze(target, opts, {}, reporter);
    } catch (error) {
      const step = reporter.currentStep;
      const where = step !== undefined ? pc.red(` [étape : ${step}]`) : "";
      if (error instanceof AnalyzeError) {
        process.stderr.write(pc.red(`Échec de l'analyse [${error.code}]${where} : ${error.message}\n`));
      } else {
        process.stderr.write(
          pc.red(`Échec de l'analyse${where} : ${error instanceof Error ? error.message : String(error)}\n`),
        );
      }
      process.exitCode = 1;
    }
  });

await program.parseAsync();
