/**
 * `corpus:check` — test de régression FR-026 SUR DISQUE (plan §6).
 *
 * FR-026 garantit qu'un même (dépôt, commit, configuration, version d'analyseur)
 * produit un artefact identique OCTET POUR OCTET. Ce test le vérifie comme une
 * IDEMPOTENCE : on régénère le corpus DEUX fois, dans deux répertoires temporaires
 * indépendants, puis on compare les deux régénérations octet pour octet.
 *
 * Pourquoi ne pas comparer à la copie committée ? Parce que deux des mondes ont une
 * entrée qui évolue : `self` EST ce dépôt (il grossit à chaque commit) et `schema`
 * suit `packages/world-schema`. Comparer une régénération à un instantané figé
 * échouerait à chaque modification du dépôt sans rien dire de FR-026. La double
 * régénération teste la reproductibilité réelle, quelle que soit l'évolution du dépôt,
 * et ne périme jamais. La copie committée sous `apps/client/public/worlds` reste un
 * jeu de démonstration servi au client, régénérable par `pnpm corpus:build`.
 *
 * Les blobs `files/` sont HORS FR-026 (copies déterministes des sources, cf. write.ts)
 * et git-ignorés ; la surface de comparaison est les `world.json` et la galerie.
 */

import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCorpus } from "./build.mjs";
import { WORLDS } from "./worlds.mjs";

/** Fichiers dont la reproductibilité est garantie (hors `files/`). */
function checkedArtifacts() {
  const rels = WORLDS.map((w) => `${w.name}/world.json`);
  rels.push("index.json");
  return rels;
}

/** Compare deux fichiers octet pour octet ; renvoie un message d'erreur ou `null`. */
function compareBytes(rel, pathA, pathB) {
  if (!existsSync(pathA) || !existsSync(pathB)) {
    return `absent d'une des deux régénérations : ${rel}`;
  }
  const a = readFileSync(pathA);
  const b = readFileSync(pathB);
  if (a.length !== b.length) {
    return `taille différente : ${rel} (${String(a.length)} o vs ${String(b.length)} o)`;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return `octet différent à l'offset ${String(i)} : ${rel}`;
  }
  return null;
}

const tmpA = mkdtempSync(join(tmpdir(), "codeworld-corpus-a-"));
const tmpB = mkdtempSync(join(tmpdir(), "codeworld-corpus-b-"));
try {
  // Deux régénérations indépendantes de la même entrée : elles DOIVENT coïncider.
  buildCorpus({ outDir: tmpA });
  buildCorpus({ outDir: tmpB });

  const diffs = [];
  for (const rel of checkedArtifacts()) {
    const err = compareBytes(rel, join(tmpA, rel), join(tmpB, rel));
    if (err !== null) diffs.push(err);
  }

  if (diffs.length > 0) {
    process.stderr.write("corpus:check A ÉCHOUÉ — deux régénérations divergent (FR-026 violé) :\n");
    for (const d of diffs) process.stderr.write(`  - ${d}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `corpus:check OK — ${String(checkedArtifacts().length)} artefact(s) reproductibles octet pour octet sur deux régénérations (FR-026).\n`,
    );
  }
} finally {
  rmSync(tmpA, { recursive: true, force: true });
  rmSync(tmpB, { recursive: true, force: true });
}
