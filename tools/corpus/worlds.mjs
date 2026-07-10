/**
 * Définition du corpus de démonstration (PRD §31.1, plan §6).
 *
 * Chaque monde décrit une arborescence LOCALE réelle à analyser et le fichier de
 * configuration qui fige ses métadonnées (dépôt, licence, graine de layout). Les
 * chemins sont résolus par rapport à la racine du dépôt, jamais en absolu machine,
 * pour rester reproductibles d'une machine à l'autre (FR-026).
 *
 * `self` et `schema` proviennent de ce dépôt ; `zod` est un paquet tiers volumineux
 * sous licence MIT, présent de façon déterministe grâce au lockfile pnpm figé.
 */

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
/** Racine du dépôt : deux niveaux au-dessus de `tools/corpus`. */
export const REPO_ROOT = resolve(here, "..", "..");

const configDir = join(here, "configs");

/**
 * Corpus, TRIÉ par `name`. `source` est le chemin de l'arborescence à analyser ;
 * `config` le fichier de configuration à passer au CLI.
 */
export const WORLDS = [
  {
    name: "schema",
    source: join(REPO_ROOT, "packages", "world-schema"),
    config: join(configDir, "schema.json"),
  },
  {
    name: "self",
    source: REPO_ROOT,
    config: join(configDir, "self.json"),
  },
  {
    name: "zod",
    source: join(REPO_ROOT, "packages", "world-schema", "node_modules", "zod"),
    config: join(configDir, "zod.json"),
  },
].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

/** Emplacement canonique du corpus committé, servi tel quel par le client. */
export const CORPUS_DIR = join(REPO_ROOT, "apps", "client", "public", "worlds");

/** Chemin du CLI `codeworld` compilé (l'analyseur doit avoir été construit). */
export const ANALYZER_CLI = join(REPO_ROOT, "packages", "analyzer", "dist", "cli.js");
