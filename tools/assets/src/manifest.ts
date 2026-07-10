/**
 * Schéma Zod du manifeste de provenance des assets 3D (PRD §10.4, §30.4, FR-029).
 *
 * Le manifeste est le registre versionné de tout asset importé : sa source, son
 * pack, son auteur, sa licence, l'URL d'origine, l'empreinte sha256 du fichier
 * brut et la liste ORDONNÉE des transformations du pipeline qui lui ont été
 * appliquées.
 *
 * Contrainte dure (FR-029, exigence « Must ») : la seule licence acceptée est
 * `CC0-1.0`. Un asset sous toute autre licence est REJETÉ par le schéma — ce
 * n'est pas un simple avertissement. De même, un asset sans empreinte sha256
 * valide est rejeté : la provenance sans empreinte n'est pas une provenance.
 */

import { z } from "zod";

/**
 * Identifiants des transformations du pipeline, dans l'ordre canonique
 * d'application (cf. `normalize.ts`). L'ordre du tableau `transforms` d'un asset
 * reflète la séquence réellement exécutée.
 */
export const TRANSFORM_IDS = [
  "scale-normalize",
  "palette-remap",
  "material-merge",
  "quantize",
  "meshopt-compress",
] as const;

export type TransformId = (typeof TRANSFORM_IDS)[number];

/** Sources CC0 retenues (PRD §10.4) ; `poly-pizza` reste une source d'appoint. */
export const ASSET_SOURCES = [
  "kenney",
  "quaternius",
  "kaykit",
  "poly-pizza",
] as const;

const transformIdSchema = z.enum(TRANSFORM_IDS);

// Empreinte hexadécimale minuscule sur 32 octets (même format que le contrat).
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * Licence : littéral unique `CC0-1.0`. Toute autre valeur (CC-BY, MIT, …) échoue
 * la validation avec un message explicite (FR-029).
 */
export const LicenseSchema = z.literal("CC0-1.0", {
  message: "licence non conforme : seuls les assets CC0-1.0 sont admis (FR-029)",
});

/** Provenance d'un asset 3D normalisé. */
export const AssetProvenanceSchema = z.strictObject({
  /** Identifiant stable de l'asset dans le corpus (ex. `crate-small`). */
  id: z.string().min(1),
  /** Nom lisible de l'asset d'origine. */
  name: z.string().min(1),
  /** Bibliothèque source. */
  source: z.enum(ASSET_SOURCES),
  /** Pack/kit d'origine au sein de la source. */
  pack: z.string().min(1),
  /** Auteur ou collectif créditant l'asset. */
  author: z.string().min(1),
  /** Licence — contrainte à `CC0-1.0`. */
  license: LicenseSchema,
  /** URL de téléchargement du fichier d'origine. */
  url: z.string().url(),
  /** Empreinte sha256 du fichier d'origine (avant toute transformation). */
  sha256: sha256HexSchema,
  /** Transformations du pipeline, dans l'ordre d'application. */
  transforms: z.array(transformIdSchema),
});

export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;

/** Manifeste complet : `{ assets: [] }` est valide (manifeste vide). */
export const ManifestSchema = z.strictObject({
  assets: z.array(AssetProvenanceSchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;

/**
 * Valide une valeur inconnue comme manifeste et la renvoie typée.
 *
 * @throws {z.ZodError} si la forme, une licence ou une empreinte sont invalides.
 */
export function parseManifest(data: unknown): Manifest {
  return ManifestSchema.parse(data);
}

/** Manifeste vide canonique. */
export function emptyManifest(): Manifest {
  return { assets: [] };
}
