/**
 * Versions du contrat, exprimées en ENTIERS (contrat §3.0). Ne pas confondre
 * avec `package.json.version` (semver de publication) : ces constantes-ci sont
 * les versions du format d'artefact et de l'algorithme de layout.
 *
 * `manifest.schemaVersion` est un point d'ancrage éternel (contrat §3.2) : son
 * nom et son emplacement ne changent jamais, car FR-027 le lit avant toute
 * validation Zod.
 */

/**
 * Version de schéma que ce build PRODUIT.
 *
 * v1 (phase 1, sprint 5) active les entités sémantiques `symbols` et `relations`
 * (ADR-0004). Le producteur émet TOUJOURS 1 : l'analyseur extrait désormais les
 * symboles TypeScript, donc tout artefact porte les tableaux `symbols`/`relations`
 * (vides si le dépôt n'a aucun code analysable). Les entités `summaries`/`tour`
 * restent réservées (sprint 7) et absentes d'un artefact v1 valide.
 */
export const SCHEMA_VERSION = 1;

/**
 * Versions de schéma que ce build sait LIRE (contrat §9, FR-027). v0 reste supportée
 * en lecture : un artefact d'avant le sprint 5 (sans `symbols`) demeure explorable.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [0, 1];

/** Version de l'algorithme de layout ; indépendante de `SCHEMA_VERSION` (contrat §12). */
export const LAYOUT_VERSION = 0;
