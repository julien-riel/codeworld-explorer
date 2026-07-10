/**
 * Sidecar de provenance `world.build.json` (spec §10.4, ADR-0002).
 *
 * SEUL endroit où vit l'heure réelle d'exécution. Fichier SÉPARÉ de `world.json`,
 * explicitement HORS FR-026 : jamais comparé par le test de reproductibilité, jamais
 * lu par le client pour une décision. Il documente une exécution (quand, où, combien
 * de temps par étape, empreinte de l'artefact produit) à des fins de diagnostic.
 *
 * Ce module vit dans l'analyseur (jamais dans `world-schema`, qui interdit `Date` et
 * `node:*`) : c'est la frontière propre entre le déterministe (l'artefact) et l'observé
 * (la provenance).
 */

import { hostname } from "node:os";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ANALYZER_VERSION } from "./version.js";

/** Nom du sidecar, à côté de `world.json`. Git-ignoré (contient l'heure réelle). */
export const PROVENANCE_FILENAME = "world.build.json";

/** Contenu du sidecar de provenance (§10.4). */
export interface Provenance {
  /** Instant réel de fin de build, ISO 8601 (heure murale — NON déterministe). */
  readonly buildAt: string;
  /** Nom d'hôte de la machine d'analyse. */
  readonly host: string;
  readonly analyzerVersion: string;
  /** Durée mesurée par étape, en millisecondes (clé = nom d'étape). */
  readonly durationsMs: Record<string, number>;
  /** Empreinte sha256 hex des octets de `world.json` (couvert par FR-026, lui). */
  readonly artifactSha256: string;
}

/**
 * Assemble la provenance d'une exécution. `now`/`host` sont injectables pour des tests
 * déterministes ; par défaut ils lisent l'horloge et le nom d'hôte réels (autorisé ici).
 */
export function buildProvenance(input: {
  readonly durationsMs: Record<string, number>;
  readonly artifactSha256: string;
  readonly now?: () => Date;
  readonly host?: string;
}): Provenance {
  const at = input.now?.() ?? new Date();
  return {
    buildAt: at.toISOString(),
    host: input.host ?? hostname(),
    analyzerVersion: ANALYZER_VERSION,
    durationsMs: input.durationsMs,
    artifactSha256: input.artifactSha256,
  };
}

/**
 * Écrit `world.build.json` sous `outDir` (JSON indenté, lisible ; la reproductibilité
 * octet ne s'applique pas à ce fichier). Renvoie le chemin écrit.
 */
export async function writeProvenance(outDir: string, provenance: Provenance): Promise<string> {
  const path = join(outDir, PROVENANCE_FILENAME);
  await writeFile(path, JSON.stringify(provenance, null, 2) + "\n");
  return path;
}
