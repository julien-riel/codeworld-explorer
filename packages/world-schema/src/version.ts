/**
 * Versions du contrat, exprimées en ENTIERS (contrat §3.0). Ne pas confondre
 * avec `package.json.version` (semver de publication) : ces constantes-ci sont
 * les versions du format d'artefact et de l'algorithme de layout.
 *
 * `manifest.schemaVersion` est un point d'ancrage éternel (contrat §3.2) : son
 * nom et son emplacement ne changent jamais, car FR-027 le lit avant toute
 * validation Zod.
 */

/** Version de schéma que ce build PRODUIT. */
export const SCHEMA_VERSION = 0;

/** Versions de schéma que ce build sait LIRE (contrat §9). */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [0];

/** Version de l'algorithme de layout ; indépendante de `SCHEMA_VERSION` (contrat §12). */
export const LAYOUT_VERSION = 0;
