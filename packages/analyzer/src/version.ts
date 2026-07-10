/**
 * Version de l'analyseur, figée en constante (pas de lecture de `package.json` à
 * l'exécution). Elle entre dans l'identité FR-026 via `manifest.analyzerVersion`
 * (contrat §3.2, §10.1) : la modifier est un changement DÉLIBÉRÉ qui autorise une
 * régénération du corpus. Elle DOIT rester synchrone avec `package.json.version`.
 */
export const ANALYZER_VERSION = "0.1.0";
