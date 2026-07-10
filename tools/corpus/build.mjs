/**
 * `corpus:build` — REGÉNÈRE tout le corpus de démonstration (plan §6, PRD §31.1).
 *
 * Pour chaque monde de `worlds.mjs`, appelle le CLI `codeworld analyze` (seule
 * interface publique de l'analyseur) et écrit `<out>/<name>/world.json` + `files/`.
 * Assemble ensuite la galerie `<out>/index.json` que lira le client 3D.
 *
 * Sortie DÉTERMINISTE (FR-026) : l'ordre des mondes et des clés est figé, et toute
 * valeur stockée dérive des octets de `world.json` — aucune horloge, aucune taille
 * gzip (qui dépendrait de la version de zlib).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { ANALYZER_CLI, CORPUS_DIR, WORLDS } from "./worlds.mjs";

/** Compte les blobs sous `<worldDir>/files` (0 si le répertoire est absent). */
function countFiles(worldDir) {
  const filesDir = join(worldDir, "files");
  if (!existsSync(filesDir)) return 0;
  return readdirSync(filesDir).length;
}

/** Analyse un monde dans `<outDir>/<name>` via le CLI compilé. */
function analyzeWorld(world, outDir) {
  const worldDir = join(outDir, world.name);
  // Repartir d'un état propre : une régénération ne laisse jamais de résidu.
  rmSync(worldDir, { recursive: true, force: true });
  // Corpus committé : pas de sidecar de provenance (heure réelle, hors FR-026) ni de
  // journal par étape (bruit lors d'une régénération en lot).
  const args = ["analyze", world.source, "--out", worldDir, "--config", world.config, "--quiet", "--no-provenance"];
  execFileSync(process.execPath, [ANALYZER_CLI, ...args], { stdio: ["ignore", "ignore", "inherit"] });
  return worldDir;
}

/**
 * Régénère l'intégralité du corpus sous `outDir` et renvoie les entrées de galerie
 * (une par monde), pour usage par le rapport et par `corpus:check`.
 */
export function buildCorpus({ outDir = CORPUS_DIR } = {}) {
  // Le monde `self` exclut `apps/client/public/worlds` ; ce répertoire doit exister
  // AU MOMENT de l'analyse pour que son nœud exclu apparaisse de façon stable.
  mkdirSync(CORPUS_DIR, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const entries = [];
  for (const world of WORLDS) {
    const worldDir = analyzeWorld(world, outDir);
    const bytes = readFileSync(join(worldDir, "world.json"));
    const parsed = JSON.parse(bytes.toString("utf8"));
    entries.push({
      name: world.name,
      path: world.name,
      world: `${world.name}/world.json`,
      nodes: parsed.nodes.length,
      rooms: parsed.layout.spatialNodes.length,
      files: countFiles(worldDir),
      artifactBytes: bytes.length,
    });
  }

  const index = { schemaVersion: 0, worlds: entries };
  // Indentation à 2 espaces + saut de ligne final : lisible et strictement reproductible.
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return entries;
}

// ── Exécution directe : régénère le corpus canonique et rapporte les chiffres ──
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const entries = buildCorpus();
  process.stdout.write(`Corpus régénéré sous ${CORPUS_DIR}\n`);
  let biggest = entries[0];
  for (const e of entries) {
    const gz = gzipSync(readFileSync(join(CORPUS_DIR, e.world))).length;
    process.stdout.write(
      `  ${e.name.padEnd(8)} nœuds=${String(e.nodes).padStart(5)} salles=${String(e.rooms).padStart(4)} ` +
        `world.json=${String(e.artifactBytes).padStart(8)} o (gzip ${String(gz).padStart(7)} o) blobs=${String(e.files).padStart(4)}\n`,
    );
    if (e.artifactBytes > biggest.artifactBytes) biggest = e;
  }
  const gzBiggest = gzipSync(readFileSync(join(CORPUS_DIR, biggest.world))).length;
  const budget = 15 * 1024 * 1024;
  const ok = gzBiggest < budget;
  process.stdout.write(
    `Budget PRD §27.3 (artefact principal < 15 Mo compressés) : plus gros = « ${biggest.name} » ` +
      `à ${gzBiggest} o gzip — ${ok ? "OK" : "DÉPASSEMENT"}.\n`,
  );
  if (!ok) process.exitCode = 1;
}
