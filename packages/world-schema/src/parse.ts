/**
 * Chargement et refus de version (contrat §9, FR-027).
 *
 * Le contrôle de version se fait AVANT toute validation Zod : `manifest.schemaVersion`
 * est lu en premier, et un échec est une erreur TYPÉE DISCRIMINÉE, jamais un `throw`
 * générique. `manifest.schemaVersion` est le point d'ancrage éternel du contrat (§3.2)
 * dont la lecture ne dépend d'aucune forme validée par Zod.
 */

import { z } from "zod";
import { WorldSchema, type World } from "./schema.js";
import { SUPPORTED_SCHEMA_VERSIONS } from "./version.js";
import { UnsupportedSchemaVersionError } from "./errors.js";

/** Erreur de chargement discriminée par `kind` (contrat §9.1). `kind` anglais stable, `message` français pour l'UI. */
export type WorldLoadError =
  | { kind: "malformed-json"; message: string }
  | {
      kind: "unsupported-schema-version";
      found: number;
      supported: readonly number[];
      message: string;
    }
  // Divergence assumée avec le contrat §9.1 : Zod 4 n'exporte plus `ZodIssue` ;
  // le type public des « issues » est `z.core.$ZodIssue`.
  | { kind: "invalid-schema"; issues: z.core.$ZodIssue[]; message: string };

/** Résultat de `loadWorld` : force le traitement des trois cas côté client (contrat §9.1). */
export type LoadResult =
  | { ok: true; world: World }
  | { ok: false; error: WorldLoadError };

/** Variante lançante typée pour le pipeline : porte l'erreur discriminée (contrat §9.1). */
export class WorldLoadException extends Error {
  readonly error: WorldLoadError;
  constructor(error: WorldLoadError) {
    super(error.message);
    this.name = "WorldLoadException";
    this.error = error;
  }
}

/**
 * Lit `manifest.schemaVersion` sur une valeur non validée. Renvoie `NaN` si le
 * champ est absent ou n'est pas un nombre (contrat §9.1, étape 2).
 */
function readSchemaVersion(data: unknown): number {
  // La garde `typeof/in` narrows `data` puis `manifest` : accès direct sans `as`.
  if (typeof data === "object" && data !== null && "manifest" in data) {
    const manifest: unknown = data.manifest;
    if (typeof manifest === "object" && manifest !== null && "schemaVersion" in manifest) {
      const version: unknown = manifest.schemaVersion;
      if (typeof version === "number") return version;
    }
  }
  return NaN;
}

/**
 * Vérifie que la version de schéma est supportée, AVANT toute validation Zod.
 * @returns la version supportée.
 * @throws UnsupportedSchemaVersionError si le champ est absent, non numérique, ou
 *   hors de `SUPPORTED_SCHEMA_VERSIONS`. On ne lance JAMAIS Zod sur une version inconnue.
 */
export function assertSupportedSchemaVersion(data: unknown): number {
  const version = readSchemaVersion(data);
  // `includes(NaN)` est faux (SameValueZero) : absent/non-numérique ⇒ non supporté.
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    throw new UnsupportedSchemaVersionError(version, SUPPORTED_SCHEMA_VERSIONS);
  }
  return version;
}

/**
 * Valide une valeur déjà désérialisée en `World` (variante lançante, pipeline).
 * Le refus de version précède la validation Zod (contrat §9.1).
 * @throws UnsupportedSchemaVersionError si la version n'est pas supportée.
 * @throws WorldLoadException (`kind: "invalid-schema"`) si la forme est invalide.
 */
export function parseWorld(data: unknown): World {
  assertSupportedSchemaVersion(data);
  const result = WorldSchema.safeParse(data);
  if (!result.success) {
    throw new WorldLoadException({
      kind: "invalid-schema",
      issues: result.error.issues,
      message: "Artefact non conforme au schéma v0 (contrat §3).",
    });
  }
  return result.data;
}

/**
 * Charge un `world.json` brut (variante Result, client). Séquence (contrat §9.1) :
 * `JSON.parse` → lecture de version → validation Zod. On ne lance jamais.
 */
export function loadWorld(rawJson: string): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(rawJson);
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "malformed-json",
        message: `JSON illisible : ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  const version = readSchemaVersion(data);
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    return {
      ok: false,
      error: {
        kind: "unsupported-schema-version",
        found: version,
        supported: SUPPORTED_SCHEMA_VERSIONS,
        message: `Version de schéma non supportée : ${String(version)} (supportées : ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}).`,
      },
    };
  }

  const result = WorldSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      error: {
        kind: "invalid-schema",
        issues: result.error.issues,
        message: "Artefact non conforme au schéma v0 (contrat §3).",
      },
    };
  }
  return { ok: true, world: result.data };
}
