/**
 * Fixture de test : charge et valide le monde `schema` réel de `public/worlds/`.
 * Module utilitaire (hors glob de tests) importé par les tests de scène ; jamais
 * bundlé dans l'application (aucun code applicatif ne l'importe).
 *
 * Le chemin est résolu depuis `process.cwd()` (et non `import.meta.url`) pour rester
 * robuste : sous jsdom, `import.meta.url` n'est plus une URL `file:`. On tente les
 * deux racines usuelles — exécution filtrée (`apps/client`) et exécution racine.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseWorld, type World } from "@codeworld/world-schema";

const CANDIDATE_PATHS = [
  "public/worlds/schema/world.json",
  "apps/client/public/worlds/schema/world.json",
];

/** Localise le `world.json` du monde `schema` quelle que soit la racine d'exécution. */
function resolveWorldPath(): string {
  for (const rel of CANDIDATE_PATHS) {
    const candidate = resolve(process.cwd(), rel);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`world.json du monde \`schema\` introuvable depuis ${process.cwd()}`);
}

/** Parse le `world.json` du monde `schema` en `World` validé. */
export function loadSchemaWorld(): World {
  const raw = readFileSync(resolveWorldPath(), "utf8");
  return parseWorld(JSON.parse(raw));
}
