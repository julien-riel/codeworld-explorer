/**
 * Chargement des mondes du CORPUS de référence (schema, self, zod) depuis
 * `public/worlds/`, pour le contrôle de budget hors-ligne (PRD §9.5, §16.1).
 *
 * Module utilitaire de TEST (hors glob de tests, importé par les tests de budget) :
 * il lit les artefacts sur le disque via `node:fs` et ne dépend d'aucun GL. Jamais
 * bundlé dans l'application — aucun code applicatif ne l'importe.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseWorld, type World } from "@codeworld/world-schema";

/** Un monde du corpus, avec son nom, prêt à mesurer. */
export interface CorpusWorld {
  name: string;
  world: World;
}

/** Noms des mondes du corpus (dossiers sous `public/worlds/`). */
export const CORPUS_WORLD_NAMES = ["schema", "self", "zod"] as const;

/** Racines candidates selon la racine d'exécution (paquet filtré ou racine du dépôt). */
const BASES = ["public/worlds", "apps/client/public/worlds"];

/** Localise le `world.json` d'un monde quelle que soit la racine d'exécution. */
function resolveWorldPath(name: string): string {
  for (const base of BASES) {
    const candidate = resolve(process.cwd(), base, name, "world.json");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`world.json du monde \`${name}\` introuvable depuis ${process.cwd()}`);
}

/** Parse le `world.json` d'un monde du corpus en `World` validé. */
export function loadCorpusWorld(name: string): World {
  const raw = readFileSync(resolveWorldPath(name), "utf8");
  return parseWorld(JSON.parse(raw));
}

/** Charge les trois mondes du corpus de référence. */
export function loadCorpus(): CorpusWorld[] {
  return CORPUS_WORLD_NAMES.map((name) => ({ name, world: loadCorpusWorld(name) }));
}
